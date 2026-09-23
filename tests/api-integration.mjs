import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequest } from '../functions/api/[[path]].js'

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value))

// ponytail: SQL subset only; extend when handler queries change.
class FakeD1 {
  constructor(staff = [{ id: 'staff-1', name: 'Cikgu Hana', normalized_name: 'CIKGU HANA', active: 1, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' }]) {
    this.staff = clone(staff)
    this.exceptions = []
    this.audit = []
    this.rateLimits = new Map()
    this.failAudit = false
    this.batchTail = Promise.resolve()
  }

  batch(statements) {
    const execute = async () => {
      const snapshot = { staff: clone(this.staff), exceptions: clone(this.exceptions), audit: clone(this.audit), rateLimits: new Map(this.rateLimits) }
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        return results
      } catch (error) {
        this.staff = snapshot.staff
        this.exceptions = snapshot.exceptions
        this.audit = snapshot.audit
        this.rateLimits = snapshot.rateLimits
        throw error
      }
    }
    const pending = this.batchTail.then(execute, execute)
    this.batchTail = pending.catch(() => {})
    return pending
  }

  auditException(action, before, record) {
    if (this.failAudit) throw new Error('audit unavailable')
    this.audit.push({
      id: crypto.randomUUID(),
      action,
      entity: 'exception',
      record_id: record.id,
      before,
      after: { id: record.id, staffId: record.staff_id, status: record.status, date: record.date, updatedAt: record.updated_at },
      actor: record.created_by,
      created_at: record.updated_at,
    })
  }

  prepare(sql) {
    let values = []
    return {
      bind(...input) { values = input; return this },
      first: async () => clone(this.query(sql, values).at(0) || null),
      all: async () => ({ results: clone(this.query(sql, values)) }),
      run: async () => this.run(sql, values),
    }
  }

  query(sql, values) {
    if (sql.startsWith('SELECT count FROM rate_limits')) return [{ count: this.rateLimits.get(`${values[0]}\0${values[1]}`) || 0 }]
    if (sql.startsWith('SELECT id, name, active FROM staff')) return this.staff.map(({ id, name, active }) => ({ id, name, active })).sort((a, b) => a.name.localeCompare(b.name))
    if (sql.startsWith('SELECT id, name FROM staff WHERE active = 1')) return this.staff.filter((staff) => staff.active === 1).map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    if (sql.startsWith('SELECT id, name FROM staff WHERE id = ? AND active = 1')) {
      return this.staff.filter((staff) => staff.id === values[0] && staff.active === 1).map(({ id, name }) => ({ id, name }))
    }
    if (sql === 'SELECT id, name FROM staff WHERE id = ?') return this.staff.filter((staff) => staff.id === values[0]).map(({ id, name }) => ({ id, name }))
    if (sql.startsWith('SELECT * FROM exceptions WHERE staff_id = ? AND date = ?')) return this.exceptions.filter((record) => record.staff_id === values[0] && record.date === values[1])
    if (sql.startsWith('SELECT * FROM exceptions WHERE id = ?')) return this.exceptions.filter((record) => record.id === values[0])
    if (sql.startsWith('SELECT id FROM staff WHERE normalized_name = ? AND id != ?')) return this.staff.filter((staff) => staff.normalized_name === values[0] && staff.id !== values[1]).map(({ id }) => ({ id }))
    if (sql.startsWith('SELECT id FROM staff WHERE normalized_name = ?')) return this.staff.filter((staff) => staff.normalized_name === values[0]).map(({ id }) => ({ id }))
    if (sql.startsWith('SELECT * FROM staff WHERE id = ?')) return this.staff.filter((staff) => staff.id === values[0])
    if (sql.startsWith('SELECT e.id, e.date, e.status')) {
      return this.exceptions.filter((record) => record.date === values[0]).map((record) => {
        const staff = this.staff.find((item) => item.id === record.staff_id)
        return { id: record.id, date: record.date, status: record.status, updatedAt: record.updated_at, staffId: staff.id, staffName: staff.name }
      }).sort((a, b) => a.staffName.localeCompare(b.staffName))
    }
    if (sql.startsWith('SELECT s.name AS staffName, e.status, COUNT(*) AS total')) {
      const counts = new Map()
      for (const record of this.exceptions.filter((item) => item.date.slice(0, 7) === values[0])) {
        const name = this.staff.find((staff) => staff.id === record.staff_id).name
        const key = `${name}\0${record.status}`
        counts.set(key, (counts.get(key) || 0) + 1)
      }
      return [...counts].map(([key, total]) => {
        const [staffName, status] = key.split('\0')
        return { staffName, status, total }
      }).sort((a, b) => a.staffName.localeCompare(b.staffName) || a.status.localeCompare(b.status))
    }
    throw new Error(`SQL query not implemented: ${sql}`)
  }

  run(sql, values) {
    if (sql.startsWith('DELETE FROM rate_limits')) {
      const [ip, cutoff] = sql.includes('ip = ?') ? values : [null, values[0]]
      for (const key of this.rateLimits.keys()) {
        const [storedIp, windowStart] = key.split('\0')
        if (windowStart < cutoff && (!ip ? !storedIp.startsWith('admin:') : storedIp === ip)) this.rateLimits.delete(key)
      }
      return { meta: { changes: 0 } }
    }
    if (sql.startsWith('INSERT INTO rate_limits')) {
      const key = `${values[0]}\0${values[1]}`
      this.rateLimits.set(key, (this.rateLimits.get(key) || 0) + 1)
      return { meta: { changes: 1 } }
    }
    if (sql.startsWith('INSERT INTO audit_log')) {
      if (this.failAudit) throw new Error('audit unavailable')
      this.audit.push({ id: values[0], action: values[1], entity: values[2], record_id: values[3], before: values[4] && JSON.parse(values[4]), after: values[5] && JSON.parse(values[5]), actor: values[6], created_at: values[7] })
      return { meta: { changes: 1 } }
    }
    if (sql.startsWith('INSERT INTO exceptions')) {
      const [id, staffId, status, date, createdBy, createdAt, updatedAt] = values
      const existing = this.exceptions.find((record) => record.staff_id === staffId && record.date === date)
      if (existing && !sql.includes('ON CONFLICT')) throw new Error('UNIQUE constraint failed: exceptions.staff_id, exceptions.date')
      const next = existing
        ? { ...existing, status, created_by: createdBy, updated_at: updatedAt }
        : { id, staff_id: staffId, status, date, created_by: createdBy, created_at: createdAt, updated_at: updatedAt }
      this.auditException(existing ? 'EXCEPTION_CORRECTED' : 'EXCEPTION_CREATED', existing ? clone(existing) : null, next)
      if (existing) Object.assign(existing, next)
      else this.exceptions.push(next)
      return { meta: { changes: 1 } }
    }
    if (sql.startsWith('INSERT OR IGNORE INTO staff') || sql.startsWith('INSERT INTO staff')) {
      const [id, name, normalizedName, createdAt] = values
      if (this.staff.some((staff) => staff.normalized_name === normalizedName)) {
        if (sql.startsWith('INSERT OR IGNORE')) return { meta: { changes: 0 } }
        throw new Error('UNIQUE constraint failed: staff.normalized_name')
      }
      this.staff.push({ id, name, normalized_name: normalizedName, active: 1, created_at: createdAt, updated_at: values[4] })
      return { meta: { changes: 1 } }
    }
    if (sql.startsWith('UPDATE staff SET name = ?, normalized_name = ?, active = ?, updated_at = ? WHERE id = ?')) {
      const [name, normalizedName, active, updatedAt, id] = values
      const staff = this.staff.find((item) => item.id === id)
      if (!staff) return { meta: { changes: 0 } }
      Object.assign(staff, { name, normalized_name: normalizedName, active, updated_at: updatedAt })
      return { meta: { changes: 1 } }
    }
    if (sql.startsWith('UPDATE exceptions SET status = ?, date = ?, created_by = ?, updated_at = ? WHERE id = ?')) {
      const [status, date, createdBy, updatedAt, id] = values
      const record = this.exceptions.find((item) => item.id === id)
      if (!record) return { meta: { changes: 0 } }
      const next = { ...record, status, date, created_by: createdBy, updated_at: updatedAt }
      this.auditException('EXCEPTION_CORRECTED', clone(record), next)
      Object.assign(record, next)
      return { meta: { changes: 1 } }
    }
    throw new Error(`SQL mutation not implemented: ${sql}`)
  }
}

const env = (DB) => ({ DB, ADMIN_PIN: '123456', SESSION_SECRET: 'test-session-secret' })

const call = async (DB, path, { method = 'GET', data, cookie, ip = '203.0.113.10' } = {}) => {
  const headers = new Headers({ 'CF-Connecting-IP': ip })
  if (cookie) headers.set('cookie', cookie)
  if (data !== undefined) headers.set('content-type', 'application/json')
  const init = { method, headers }
  if (data !== undefined) init.body = JSON.stringify(data)
  const request = new Request(`https://example.test/api/${path}`, init)
  return onRequest({ request, env: env(DB) })
}

const login = async (DB) => {
  const response = await call(DB, 'admin/login', { method: 'POST', data: { pin: '123456' } })
  assert.equal(response.status, 200)
  const setCookie = response.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly; Secure; SameSite=Strict; Max-Age=21600/)
  return setCookie.split(';')[0]
}

test('blocks the sixth admin login attempt in its own 15-minute IP window', async () => {
  const DB = new FakeD1()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await call(DB, 'admin/login', { method: 'POST', data: { pin: 'wrong' } })
    assert.equal(response.status, 401)
  }
  const response = await call(DB, 'admin/login', { method: 'POST', data: { pin: 'wrong' } })
  assert.equal(response.status, 429)
  assert.equal([...DB.rateLimits.keys()].some((key) => key.startsWith('admin:203.0.113.10\0')), true)
})

test('public roster and exception endpoints only expose valid active-staff declarations', async () => {
  const DB = new FakeD1([{ id: 'staff-1', name: 'Cikgu Hana', normalized_name: 'CIKGU HANA', active: 1, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' }, { id: 'staff-2', name: 'Cikgu Zaki', normalized_name: 'CIKGU ZAKI', active: 0, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' }])
  const roster = await call(DB, 'staff')
  assert.deepEqual(await roster.json(), { staff: [{ id: 'staff-1', name: 'Cikgu Hana' }] })

  const valid = await call(DB, 'exceptions', { method: 'POST', data: { staffId: 'staff-1', status: 'CUTI', date: '2026-09-22', notes: 'Tidak boleh disimpan', medicalDocument: 'fail.pdf' } })
  assert.equal(valid.status, 201)
  assert.equal(valid.headers.get('cache-control'), 'no-store')
  assert.deepEqual(Object.keys(DB.exceptions[0]).sort(), ['created_at', 'created_by', 'date', 'id', 'staff_id', 'status', 'updated_at'])

  const invalid = await call(DB, 'exceptions', { method: 'POST', data: { staffId: 'staff-1', status: 'HADIR', date: '2026-09-22' } })
  assert.equal(invalid.status, 400)
  assert.match((await invalid.json()).error, /Maklumat pengecualian tidak sah/)
})

test('public exception submissions create once, cannot overwrite, and keep an eight-per-minute limit', async () => {
  const DB = new FakeD1()
  assert.equal((await call(DB, 'exceptions', { method: 'POST', data: { staffId: 'staff-1', status: 'CUTI', date: '2026-09-22' } })).status, 201)
  assert.equal((await call(DB, 'exceptions', { method: 'POST', data: { staffId: 'staff-1', status: 'MC', date: '2026-09-22' } })).status, 409)
  assert.equal(DB.exceptions.length, 1)
  assert.equal(DB.exceptions[0].status, 'CUTI')
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await call(DB, 'exceptions', { method: 'POST', data: { staffId: 'staff-1', status: 'MC', date: `2026-09-0${attempt}` } })
    assert.equal(response.status, 201)
  }
  assert.equal((await call(DB, 'exceptions', { method: 'POST', data: { staffId: 'staff-1', status: 'MC', date: '2026-09-08' } })).status, 429)
  assert.equal([...DB.rateLimits.keys()].some((key) => key.startsWith('203.0.113.10\0')), true)
  assert.equal([...DB.rateLimits.keys()].some((key) => key.startsWith('admin:')), false)
})

test('concurrent public submissions cannot overwrite the winning record', async () => {
  const DB = new FakeD1()
  const responses = await Promise.all([
    call(DB, 'exceptions', { method: 'POST', ip: '203.0.113.21', data: { staffId: 'staff-1', status: 'CUTI', date: '2026-09-22' } }),
    call(DB, 'exceptions', { method: 'POST', ip: '203.0.113.22', data: { staffId: 'staff-1', status: 'MC', date: '2026-09-22' } }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
  assert.equal(DB.exceptions.length, 1)
  assert.equal(DB.audit.length, 1)
})

test('concurrent public and admin writes return and audit the actual exception id', async () => {
  const DB = new FakeD1()
  const cookie = await login(DB)
  const [publicResponse, adminResponse] = await Promise.all([
    call(DB, 'exceptions', { method: 'POST', ip: '203.0.113.31', data: { staffId: 'staff-1', status: 'CUTI', date: '2026-09-22' } }),
    call(DB, 'admin/exceptions', { method: 'POST', cookie, ip: '203.0.113.32', data: { staffId: 'staff-1', status: 'MC', date: '2026-09-22' } }),
  ])
  assert.ok([201, 409].includes(publicResponse.status))
  assert.equal(adminResponse.status, 201)
  const adminRecord = (await adminResponse.json()).record
  assert.equal(DB.exceptions.length, 1)
  assert.equal(adminRecord.id, DB.exceptions[0].id)
  assert.deepEqual([...new Set(DB.audit.map((entry) => entry.record_id))], [DB.exceptions[0].id])
})

test('an exception trigger audit failure rolls back the exception row', async () => {
  const DB = new FakeD1()
  DB.failAudit = true
  await assert.rejects(call(DB, 'exceptions', { method: 'POST', data: { staffId: 'staff-1', status: 'CUTI', date: '2026-09-22' } }), /audit unavailable/)
  assert.equal(DB.exceptions.length, 0)
  assert.equal(DB.audit.length, 0)
})

test('protected roster endpoints reject anonymous requests and audit admin mutations', async () => {
  const DB = new FakeD1()
  assert.equal((await call(DB, 'admin/staff', { method: 'POST', data: { name: 'Cikgu Anis' } })).status, 401)
  assert.equal((await call(DB, 'admin/import', { method: 'POST', data: { names: ['Cikgu Mariam'] } })).status, 401)
  const cookie = await login(DB)

  const added = await call(DB, 'admin/staff', { method: 'POST', cookie, data: { name: 'Cikgu Anis' } })
  assert.equal(added.status, 201)
  const imported = await call(DB, 'admin/import', { method: 'POST', cookie, data: { names: ['Cikgu Anis', 'Cikgu Mariam', 'Cikgu Siti'] } })
  assert.deepEqual((await imported.json()).created.map((staff) => staff.name), ['Cikgu Mariam', 'Cikgu Siti'])
  assert.deepEqual(DB.audit.map((entry) => entry.action), ['STAFF_CREATED', 'STAFF_IMPORTED', 'STAFF_IMPORTED'])
  assert.deepEqual(DB.audit.slice(1).map((entry) => entry.record_id).sort(), DB.staff.filter((staff) => ['Cikgu Mariam', 'Cikgu Siti'].includes(staff.name)).map((staff) => staff.id).sort())
})

test('an audit failure rolls back its imported staff row', async () => {
  const DB = new FakeD1()
  const cookie = await login(DB)
  DB.failAudit = true
  await assert.rejects(call(DB, 'admin/import', { method: 'POST', cookie, data: { names: ['Cikgu Audit'] } }), /audit unavailable/)
  assert.deepEqual(DB.staff.map((staff) => staff.name), ['Cikgu Hana'])
  assert.equal(DB.audit.length, 0)
})

test('admin corrections are audited and visible through dashboard and monthly report', async () => {
  const DB = new FakeD1()
  assert.equal((await call(DB, 'admin/dashboard?date=2026-09-22')).status, 401)
  assert.equal((await call(DB, 'admin/report?month=2026-09')).status, 401)
  assert.equal((await call(DB, 'admin/exceptions', { method: 'POST', data: { staffId: 'staff-1', status: 'CUTI', date: '2026-09-22' } })).status, 401)
  const cookie = await login(DB)

  const created = await call(DB, 'admin/exceptions', { method: 'POST', cookie, data: { staffId: 'staff-1', status: 'CUTI', date: '2026-09-22' } })
  const record = (await created.json()).record
  const corrected = await call(DB, `admin/exceptions/${record.id}`, { method: 'PATCH', cookie, data: { status: 'KURSUS', date: '2026-09-23' } })
  assert.equal(corrected.status, 200)
  assert.equal(DB.exceptions.length, 1)
  assert.equal(DB.exceptions[0].status, 'KURSUS')
  assert.equal(DB.exceptions[0].date, '2026-09-23')
  assert.equal(DB.audit.at(-1).action, 'EXCEPTION_CORRECTED')

  const dashboard = await call(DB, 'admin/dashboard?date=2026-09-23', { cookie })
  assert.deepEqual((await dashboard.json()).records.map((item) => item.status), ['KURSUS'])
  const report = await call(DB, 'admin/report?month=2026-09', { cookie })
  assert.deepEqual((await report.json()).rows, [{ staffName: 'Cikgu Hana', status: 'KURSUS', total: 1 }])
  assert.equal((await call(DB, 'admin/report?month=2026-13', { cookie })).status, 400)
})

test('admin can edit a roster name and active flag without a delete endpoint', async () => {
  const DB = new FakeD1()
  assert.equal((await call(DB, 'admin/staff')).status, 401)
  const cookie = await login(DB)
  const edited = await call(DB, 'admin/staff/staff-1', { method: 'PATCH', cookie, data: { name: ' Cikgu Hana Baharu ', active: false } })
  assert.equal(edited.status, 200)
  assert.deepEqual((await edited.json()).staff, { id: 'staff-1', name: 'Cikgu Hana Baharu', active: false })
  assert.equal(DB.staff[0].normalized_name, 'CIKGU HANA BAHARU')
  assert.equal(DB.audit.at(-1).action, 'STAFF_UPDATED')
  assert.deepEqual(await (await call(DB, 'staff')).json(), { staff: [] })
  assert.deepEqual(await (await call(DB, 'admin/staff', { cookie })).json(), { staff: [{ id: 'staff-1', name: 'Cikgu Hana Baharu', active: false }] })
  assert.equal((await call(DB, 'admin/staff/staff-1', { method: 'DELETE', cookie })).status, 404)
})
