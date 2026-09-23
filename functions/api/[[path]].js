export const VALID_STATUSES = new Set(['CUTI', 'MC', 'KURSUS', 'URUSAN_RASMI', 'KELUAR_SEMENTARA'])

export const normaliseName = (value = '') => String(value).trim().replace(/\s+/g, ' ').toLocaleUpperCase('ms-MY')
export const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(value) && Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })
const fail = (message, status = 400) => json({ error: message }, status)
const now = () => new Date().toISOString()
const cookie = (request, name) => (Object.fromEntries((request.headers.get('cookie') || '').split(';').map(v => v.trim().split('='))))[name]
const bytes = (value) => new TextEncoder().encode(value)
const b64url = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, bytes(value)))
}

function same(a, b) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

async function admin(request, env) {
  const token = cookie(request, 'keberadaan_admin')
  if (!token || !env.SESSION_SECRET) return false
  const [id, expires, signature] = token.split('.')
  if (!id || !expires || !signature || Number(expires) < Date.now()) return false
  return same(signature, await hmac(`${id}.${expires}`, env.SESSION_SECRET))
}

async function requireAdmin(request, env) {
  return await admin(request, env) ? null : fail('Sesi pentadbir diperlukan.', 401)
}

async function body(request) {
  try { return await request.json() } catch { return null }
}

const auditStatement = (db, action, entity, recordId, before, after, actor = 'public') => db
  .prepare('INSERT INTO audit_log (id, action, entity, record_id, before_json, after_json, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .bind(crypto.randomUUID(), action, entity, recordId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, actor, now())

const deletionAuditStatement = (db, id) => db
  .prepare("INSERT INTO audit_log (id, action, entity, record_id, before_json, after_json, actor, created_at) SELECT ?, ?, ?, id, json_object('id', id, 'staffId', staff_id, 'status', status, 'date', date, 'updatedAt', updated_at), NULL, ?, ? FROM exceptions WHERE id = ?")
  .bind(crypto.randomUUID(), 'EXCEPTION_DELETED', 'exception', 'admin', now(), id)

const runAudited = (db, mutation, action, entity, recordId, before, after, actor) => db.batch([
  mutation,
  auditStatement(db, action, entity, recordId, before, after, actor),
])

const uniqueConflict = (error) => /UNIQUE constraint failed/.test(String(error))

async function enforceRate(request, db) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString()
  await db.prepare("DELETE FROM rate_limits WHERE window_start < ? AND ip NOT LIKE 'admin:%'").bind(new Date(Date.now() - 10 * 60000).toISOString()).run()
  await db.prepare('INSERT INTO rate_limits (ip, window_start, count) VALUES (?, ?, 1) ON CONFLICT(ip, window_start) DO UPDATE SET count = count + 1').bind(ip, windowStart).run()
  const row = await db.prepare('SELECT count FROM rate_limits WHERE ip = ? AND window_start = ?').bind(ip, windowStart).first()
  return Number(row?.count || 0) <= 8
}

async function enforceAdminLoginRate(request, db) {
  const ip = `admin:${request.headers.get('CF-Connecting-IP') || 'unknown'}`
  const windowStart = new Date(Math.floor(Date.now() / (15 * 60000)) * 15 * 60000).toISOString()
  await db.prepare('DELETE FROM rate_limits WHERE ip = ? AND window_start < ?').bind(ip, new Date(Date.now() - 15 * 60000).toISOString()).run()
  await db.prepare('INSERT INTO rate_limits (ip, window_start, count) VALUES (?, ?, 1) ON CONFLICT(ip, window_start) DO UPDATE SET count = count + 1').bind(ip, windowStart).run()
  const row = await db.prepare('SELECT count FROM rate_limits WHERE ip = ? AND window_start = ?').bind(ip, windowStart).first()
  return Number(row?.count || 0) <= 5
}

async function writeException(db, input, actor, allowExisting = false) {
  const staffId = String(input.staffId || '')
  const status = String(input.status || '')
  const date = String(input.date || '')
  if (!staffId || !VALID_STATUSES.has(status) || !isValidDate(date)) return { error: 'Maklumat pengecualian tidak sah.' }
  const staff = await db.prepare('SELECT id, name FROM staff WHERE id = ? AND active = 1').bind(staffId).first()
  if (!staff) return { error: 'Staf tidak ditemui atau tidak aktif.' }
  const createdAt = now()
  const record = { id: crypto.randomUUID(), staffId, status, date, updatedAt: createdAt }
  if (!allowExisting) {
    try {
      await db.batch([
        db.prepare('INSERT INTO exceptions (id, staff_id, status, date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(record.id, staffId, status, date, actor, createdAt, createdAt),
      ])
    } catch (error) {
      if (uniqueConflict(error)) return { error: 'Rekod bagi staf dan tarikh ini sudah ada.', status: 409 }
      throw error
    }
    return { record: { ...record, staffName: staff.name } }
  }
  const previous = await db.prepare('SELECT * FROM exceptions WHERE staff_id = ? AND date = ?').bind(staffId, date).first()
  record.id = previous?.id || record.id
  record.updatedAt = now()
  await db.batch([
    db.prepare('INSERT INTO exceptions (id, staff_id, status, date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(staff_id, date) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, created_by = excluded.created_by')
      .bind(record.id, staffId, status, date, actor, previous?.created_at || createdAt, record.updatedAt),
  ])
  const saved = await db.prepare('SELECT * FROM exceptions WHERE staff_id = ? AND date = ?').bind(staffId, date).first()
  return { record: { id: saved.id, staffId, status: saved.status, date: saved.date, updatedAt: saved.updated_at, staffName: staff.name } }
}

async function login(request, env) {
  if (!env.ADMIN_PIN || !env.SESSION_SECRET) return fail('Rahsia pentadbir belum dikonfigurasikan.', 503)
  if (!await enforceAdminLoginRate(request, env.DB)) return fail('Terlalu banyak cubaan. Cuba semula sebentar lagi.', 429)
  const data = await body(request)
  const pin = String(data?.pin || '')
  const expected = await hmac(env.ADMIN_PIN, env.SESSION_SECRET)
  const received = await hmac(pin, env.SESSION_SECRET)
  if (!same(expected, received)) return fail('PIN tidak tepat.', 401)
  const id = crypto.randomUUID()
  const expires = String(Date.now() + 6 * 60 * 60 * 1000)
  const signature = await hmac(`${id}.${expires}`, env.SESSION_SECRET)
  return json({ ok: true }, 200, { 'set-cookie': `keberadaan_admin=${id}.${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600` })
}

async function addStaff(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied
  const data = await body(request); const name = String(data?.name || '').trim()
  if (name.length < 3 || name.length > 120) return fail('Nama staf tidak sah.')
  const key = normaliseName(name)
  const exists = await env.DB.prepare('SELECT id FROM staff WHERE normalized_name = ?').bind(key).first()
  if (exists) return fail('Nama staf sudah ada.', 409)
  const row = { id: crypto.randomUUID(), name, key, createdAt: now() }
  try {
    await runAudited(env.DB,
      env.DB.prepare('INSERT INTO staff (id, name, normalized_name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)').bind(row.id, row.name, row.key, row.createdAt, row.createdAt),
      'STAFF_CREATED', 'staff', row.id, null, row, 'admin')
  } catch (error) {
    if (uniqueConflict(error)) return fail('Nama staf sudah ada.', 409)
    throw error
  }
  return json({ staff: { id: row.id, name: row.name, active: true } }, 201)
}

async function importStaff(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied
  const data = await body(request); const names = Array.isArray(data?.names) ? data.names : []
  if (!names.length || names.length > 250) return fail('Senarai staf mestilah antara 1 hingga 250 nama.')
  const created = []
  for (const raw of names) {
    const name = String(raw || '').trim(); const key = normaliseName(name)
    if (name.length < 3 || name.length > 120) continue
    const id = crypto.randomUUID(); const createdAt = now()
    const row = { id, name, key, active: true, createdAt }
    try {
      await runAudited(env.DB,
        env.DB.prepare('INSERT INTO staff (id, name, normalized_name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)').bind(id, name, key, createdAt, createdAt),
        'STAFF_IMPORTED', 'staff', id, null, row, 'admin')
      created.push({ id, name })
    } catch (error) {
      if (!uniqueConflict(error)) throw error
    }
  }
  return json({ created, skipped: names.length - created.length })
}

async function listAdminStaff(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied
  const { results } = await env.DB.prepare('SELECT id, name, active FROM staff ORDER BY name').all()
  return json({ staff: results.map((row) => ({ ...row, active: Boolean(row.active) })) })
}

async function updateStaff(request, env, id) {
  const denied = await requireAdmin(request, env); if (denied) return denied
  const previous = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first()
  if (!previous) return fail('Staf tidak ditemui.', 404)
  const data = await body(request)
  const hasName = Object.hasOwn(data || {}, 'name')
  const hasActive = Object.hasOwn(data || {}, 'active')
  if (!hasName && !hasActive) return fail('Maklumat staf tidak sah.')

  let name = previous.name
  let key = previous.normalized_name
  let active = previous.active
  if (hasName) {
    if (typeof data.name !== 'string') return fail('Nama staf tidak sah.')
    name = data.name.trim()
    if (name.length < 3 || name.length > 120) return fail('Nama staf tidak sah.')
    key = normaliseName(name)
    const duplicate = await env.DB.prepare('SELECT id FROM staff WHERE normalized_name = ? AND id != ?').bind(key, id).first()
    if (duplicate) return fail('Nama staf sudah ada.', 409)
  }
  if (hasActive) {
    if (typeof data.active !== 'boolean') return fail('Status aktif tidak sah.')
    active = data.active ? 1 : 0
  }

  const updatedAt = now()
  const record = { id, name, key, active: Boolean(active), updatedAt }
  try {
    await runAudited(env.DB,
      env.DB.prepare('UPDATE staff SET name = ?, normalized_name = ?, active = ?, updated_at = ? WHERE id = ?').bind(name, key, active, updatedAt, id),
      'STAFF_UPDATED', 'staff', id, previous, record, 'admin')
  } catch (error) {
    if (uniqueConflict(error)) return fail('Nama staf sudah ada.', 409)
    throw error
  }
  return json({ staff: { id, name, active: Boolean(active) } })
}

async function updateException(request, env, id) {
  const denied = await requireAdmin(request, env); if (denied) return denied
  const previous = await env.DB.prepare('SELECT * FROM exceptions WHERE id = ?').bind(id).first()
  if (!previous) return fail('Rekod tidak ditemui.', 404)
  const data = await body(request) || {}
  const status = String(data.status || '')
  const date = String(data.date || previous.date)
  if (!VALID_STATUSES.has(status) || !isValidDate(date)) return fail('Maklumat pengecualian tidak sah.')
  const staff = await env.DB.prepare('SELECT id, name FROM staff WHERE id = ?').bind(previous.staff_id).first()
  if (!staff) return fail('Staf tidak ditemui.', 404)
  const collision = await env.DB.prepare('SELECT * FROM exceptions WHERE staff_id = ? AND date = ?').bind(previous.staff_id, date).first()
  if (collision && collision.id !== id) return fail('Rekod bagi staf dan tarikh ini sudah ada.', 409)
  const record = { id, staffId: previous.staff_id, status, date, updatedAt: now() }
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE exceptions SET status = ?, date = ?, created_by = ?, updated_at = ? WHERE id = ?').bind(status, date, 'admin', record.updatedAt, id),
    ])
  } catch (error) {
    if (uniqueConflict(error)) return fail('Rekod bagi staf dan tarikh ini sudah ada.', 409)
    throw error
  }
  return json({ record: { ...record, staffName: staff.name } })
}

async function deleteException(request, env, id) {
  const denied = await requireAdmin(request, env); if (denied) return denied
  const [, deleted] = await env.DB.batch([
    deletionAuditStatement(env.DB, id),
    env.DB.prepare('DELETE FROM exceptions WHERE id = ?').bind(id),
  ])
  if (Number(deleted?.meta?.changes || 0) !== 1) return fail('Rekod tidak ditemui.', 404)
  return json({ ok: true })
}

export async function onRequest(context) {
  const { request, env } = context
  if (!env.DB) return fail('Pangkalan data D1 belum diikat pada Pages.', 503)
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '')
  const method = request.method

  if (path === 'staff' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, name FROM staff WHERE active = 1 ORDER BY name').all()
    return json({ staff: results })
  }
  if (path === 'exceptions' && method === 'POST') {
    if (!await enforceRate(request, env.DB)) return fail('Terlalu banyak cubaan. Cuba semula sebentar lagi.', 429)
    const result = await writeException(env.DB, await body(request) || {}, 'staff')
    return result.error ? fail(result.error, result.status) : json(result, 201)
  }
  if (path === 'admin/login' && method === 'POST') return login(request, env)
  if (path === 'admin/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': 'keberadaan_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' })
  if (path === 'admin/staff' && method === 'GET') return listAdminStaff(request, env)
  if (path === 'admin/staff' && method === 'POST') return addStaff(request, env)
  if (path === 'admin/import' && method === 'POST') return importStaff(request, env)
  const staffMatch = path.match(/^admin\/staff\/([\w-]+)$/)
  if (staffMatch && method === 'PATCH') return updateStaff(request, env, staffMatch[1])

  if (path === 'admin/dashboard' && method === 'GET') {
    const denied = await requireAdmin(request, env); if (denied) return denied
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
    if (!isValidDate(date)) return fail('Tarikh tidak sah.')
    const { results } = await env.DB.prepare('SELECT e.id, e.date, e.status, e.updated_at AS updatedAt, s.id AS staffId, s.name AS staffName FROM exceptions e JOIN staff s ON s.id = e.staff_id WHERE e.date = ? ORDER BY s.name').bind(date).all()
    return json({ date, records: results })
  }
  if (path === 'admin/report' && method === 'GET') {
    const denied = await requireAdmin(request, env); if (denied) return denied
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7)
    if (!isValidMonth(month)) return fail('Bulan tidak sah.')
    const { results } = await env.DB.prepare("SELECT s.name AS staffName, e.status, COUNT(*) AS total FROM exceptions e JOIN staff s ON s.id = e.staff_id WHERE substr(e.date, 1, 7) = ? GROUP BY s.name, e.status ORDER BY s.name, e.status").bind(month).all()
    return json({ month, rows: results })
  }
  if (path === 'admin/exceptions' && method === 'POST') {
    const denied = await requireAdmin(request, env); if (denied) return denied
    const result = await writeException(env.DB, await body(request) || {}, 'admin', true)
    return result.error ? fail(result.error, result.status) : json(result, 201)
  }
  const match = path.match(/^admin\/exceptions\/([\w-]+)$/)
  if (match && method === 'PATCH') return updateException(request, env, match[1])
  if (match && method === 'DELETE') return deleteException(request, env, match[1])
  return fail('Laluan API tidak ditemui.', 404)
}
