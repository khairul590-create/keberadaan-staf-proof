import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

const STATUSES = ['CUTI', 'MC', 'KURSUS', 'URUSAN_RASMI', 'KELUAR_SEMENTARA'] as const

type Status = (typeof STATUSES)[number]
type SelectedStatus = Status | ''
type AdminTab = 'dashboard' | 'roster' | 'correction' | 'report'
type Notice = { tone: 'error' | 'success'; text: string }
type Staff = { id: string; name: string; active?: boolean }
type ExceptionRecord = { id: string; staffId: string; staffName: string; status: Status; date: string; updatedAt: string }
type ReportRow = { staffName: string; status: Status; total: number }

const statusLabel: Record<Status, string> = {
  CUTI: 'Cuti',
  MC: 'MC',
  KURSUS: 'Kursus',
  URUSAN_RASMI: 'Urusan rasmi',
  KELUAR_SEMENTARA: 'Keluar sementara',
}

function localDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function safeError(value: unknown) {
  return value instanceof Error ? value.message : 'Permintaan tidak dapat diproses. Cuba semula.'
}

function apiError(data: unknown) {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error
  return 'Permintaan tidak dapat diproses. Cuba semula.'
}

async function api<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await fetch(path, { ...init, headers, ...(admin ? { credentials: 'include' as const } : {}) })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(apiError(data))
  return data as T
}

function App() {
  const today = useMemo(localDate, [])
  const [dark, setDark] = useState(() => localStorage.getItem('keberadaan-theme') === 'dark')
  const [staff, setStaff] = useState<Staff[]>([])
  const [staffState, setStaffState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [staffError, setStaffError] = useState('')
  const [publicOpen, setPublicOpen] = useState(false)
  const [publicStaffId, setPublicStaffId] = useState('')
  const [publicStatus, setPublicStatus] = useState<SelectedStatus>('')
  const [publicDate, setPublicDate] = useState(today)
  const [publicBusy, setPublicBusy] = useState(false)
  const [publicNotice, setPublicNotice] = useState<Notice | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [pin, setPin] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [adminNotice, setAdminNotice] = useState<Notice | null>(null)
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard')
  const [dashboardDate, setDashboardDate] = useState(today)
  const [records, setRecords] = useState<ExceptionRecord[]>([])
  const [dashboardBusy, setDashboardBusy] = useState(false)
  const [newStaffName, setNewStaffName] = useState('')
  const [importNames, setImportNames] = useState('')
  const [staffBusy, setStaffBusy] = useState('')
  const [correctionStaffId, setCorrectionStaffId] = useState('')
  const [correctionStatus, setCorrectionStatus] = useState<SelectedStatus>('')
  const [correctionDate, setCorrectionDate] = useState(today)
  const [correctionBusy, setCorrectionBusy] = useState(false)
  const [editing, setEditing] = useState<ExceptionRecord | null>(null)
  const [reportMonth, setReportMonth] = useState(today.slice(0, 7))
  const [reportRows, setReportRows] = useState<ReportRow[]>([])
  const [reportBusy, setReportBusy] = useState(false)
  const publicTrigger = useRef<HTMLButtonElement>(null)
  const adminTrigger = useRef<HTMLButtonElement>(null)

  const activeStaff = useMemo(() => staff.filter((item) => item.active !== false), [staff])
  const formattedToday = useMemo(
    () => new Intl.DateTimeFormat('ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${today}T00:00:00`)),
    [today],
  )

  async function loadStaff(adminView = false) {
    setStaffState('loading')
    setStaffError('')
    try {
      const data = await api<{ staff: Staff[] }>(adminView ? '/api/admin/staff' : '/api/staff', {}, adminView)
      setStaff(data.staff.map((item) => ({ ...item, active: adminView ? item.active : true })))
      setStaffState('ready')
    } catch (error) {
      setStaffState('error')
      setStaffError(safeError(error))
    }
  }

  async function loadDashboard(date = dashboardDate) {
    setDashboardBusy(true)
    try {
      const data = await api<{ date: string; records: ExceptionRecord[] }>(`/api/admin/dashboard?date=${encodeURIComponent(date)}`, {}, true)
      setRecords(data.records)
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setDashboardBusy(false)
    }
  }

  async function loadReport(month = reportMonth) {
    setReportBusy(true)
    try {
      const data = await api<{ month: string; rows: ReportRow[] }>(`/api/admin/report?month=${encodeURIComponent(month)}`, {}, true)
      setReportRows(data.rows)
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setReportBusy(false)
    }
  }

  useEffect(() => {
    void loadStaff()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('keberadaan-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (publicOpen) {
        setPublicOpen(false)
        publicTrigger.current?.focus()
      }
      if (adminOpen) {
        setAdminOpen(false)
        adminTrigger.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [adminOpen, publicOpen])

  async function submitPublic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!publicStaffId || !publicStatus) {
      setPublicNotice({ tone: 'error', text: 'Pilih nama staf dan status terlebih dahulu.' })
      return
    }
    setPublicBusy(true)
    setPublicNotice(null)
    try {
      const data = await api<{ record: { staffName: string } }>('/api/exceptions', {
        method: 'POST',
        body: JSON.stringify({ staffId: publicStaffId, status: publicStatus, date: publicDate }),
      })
      setPublicNotice({ tone: 'success', text: `Makluman ${data.record.staffName} telah diterima.` })
      setPublicOpen(false)
      setPublicStatus('')
      publicTrigger.current?.focus()
    } catch (error) {
      setPublicNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setPublicBusy(false)
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pin.trim()) {
      setAdminNotice({ tone: 'error', text: 'Masukkan PIN pentadbir.' })
      return
    }
    setLoginBusy(true)
    setAdminNotice(null)
    try {
      await api<{ ok: true }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ pin }) }, true)
      setPin('')
      setAdmin(true)
      setAdminOpen(false)
      setAdminTab('dashboard')
      await Promise.all([loadDashboard(today), loadStaff(true)])
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setLoginBusy(false)
    }
  }

  async function logout() {
    setAdminNotice(null)
    try {
      await api<{ ok: true }>('/api/admin/logout', { method: 'POST' }, true)
      setAdmin(false)
      setAdminTab('dashboard')
      setRecords([])
      setReportRows([])
      await loadStaff()
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    }
  }

  async function selectAdminTab(tab: AdminTab) {
    setAdminTab(tab)
    setAdminNotice(null)
    if (tab === 'dashboard' || tab === 'correction') await loadDashboard()
    if (tab === 'report') await loadReport()
  }

  async function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newStaffName.trim()) {
      setAdminNotice({ tone: 'error', text: 'Masukkan nama staf.' })
      return
    }
    setStaffBusy('new')
    setAdminNotice(null)
    try {
      await api<{ staff: Staff }>('/api/admin/staff', { method: 'POST', body: JSON.stringify({ name: newStaffName }) }, true)
      setNewStaffName('')
      await loadStaff(true)
      setAdminNotice({ tone: 'success', text: 'Staf telah ditambah.' })
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setStaffBusy('')
    }
  }

  async function importStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const names = importNames.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
    if (!names.length) {
      setAdminNotice({ tone: 'error', text: 'Masukkan sekurang-kurangnya satu nama.' })
      return
    }
    setStaffBusy('import')
    setAdminNotice(null)
    try {
      const data = await api<{ created: Staff[]; skipped: number }>('/api/admin/import', { method: 'POST', body: JSON.stringify({ names }) }, true)
      setImportNames('')
      await loadStaff(true)
      setAdminNotice({ tone: 'success', text: `${data.created.length} nama ditambah${data.skipped ? `; ${data.skipped} diabaikan.` : '.'}` })
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setStaffBusy('')
    }
  }

  async function patchStaff(staffId: string, patch: { name?: string; active?: boolean }) {
    setStaffBusy(staffId)
    setAdminNotice(null)
    try {
      await api(`/api/admin/staff/${encodeURIComponent(staffId)}`, { method: 'PATCH', body: JSON.stringify(patch) }, true)
      await loadStaff(true)
      if (patch.active === false && publicStaffId === staffId) setPublicStaffId('')
      setAdminNotice({ tone: 'success', text: 'Rekod staf dikemas kini.' })
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setStaffBusy('')
    }
  }

  async function saveCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!correctionStaffId || !correctionStatus) {
      setAdminNotice({ tone: 'error', text: 'Pilih staf dan status untuk pembetulan.' })
      return
    }
    setCorrectionBusy(true)
    setAdminNotice(null)
    try {
      await api('/api/admin/exceptions', {
        method: 'POST',
        body: JSON.stringify({ staffId: correctionStaffId, status: correctionStatus, date: correctionDate }),
      }, true)
      await loadDashboard(correctionDate)
      setDashboardDate(correctionDate)
      setCorrectionStatus('')
      setAdminNotice({ tone: 'success', text: 'Rekod pengecualian dikemas kini.' })
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setCorrectionBusy(false)
    }
  }

  async function updateException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    const status = String(form.get('status') || '') as Status
    const date = String(form.get('date') || '')
    setCorrectionBusy(true)
    setAdminNotice(null)
    try {
      await api(`/api/admin/exceptions/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify({ status, date }) }, true)
      setDashboardDate(date)
      await loadDashboard(date)
      setEditing(null)
      setAdminNotice({ tone: 'success', text: 'Rekod disimpan.' })
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setCorrectionBusy(false)
    }
  }

  const closePublic = () => {
    setPublicOpen(false)
    publicTrigger.current?.focus()
  }
  const closeAdmin = () => {
    setAdminOpen(false)
    adminTrigger.current?.focus()
  }

  return (
    <>
      <main className="app-shell">
        <header className="topbar">
          <div className="brand" aria-label="SK Darau, Keberadaan staf">
            <div className="mark" aria-hidden="true">K</div>
            <div>
              <strong>SK Darau</strong>
              <span>Keberadaan staf</span>
            </div>
          </div>
          <div className="top-actions">
            <button className="theme-button" type="button" aria-pressed={dark} onClick={() => setDark((value) => !value)}>
              {dark ? 'Cerah' : 'Gelap'}
            </button>
            {admin ? (
              <button className="admin-button" type="button" onClick={() => void logout()}>Log keluar</button>
            ) : (
              <button className="admin-button" ref={adminTrigger} type="button" onClick={() => setAdminOpen(true)}>Pentadbir</button>
            )}
          </div>
        </header>

        {!admin ? (
          <>
            <section className="hero" aria-labelledby="public-title">
              <p className="hero-date">{formattedToday}</p>
              <h1 id="public-title">Maklumkan pengecualian dengan ringkas.</h1>
              <p>Hantar pengesahan untuk status yang dibenarkan sahaja.</p>
            </section>

            <section className="public-layout" aria-labelledby="form-summary">
              <div className="panel public-card">
                <div className="panel-heading">
                  <div>
                    <h2 id="form-summary">Rekod pengecualian</h2>
                    <p>Pilih nama, status dan tarikh.</p>
                  </div>
                  <span className="step-label">Satu borang</span>
                </div>
                {publicNotice && <div className={`notice ${publicNotice.tone}`} role={publicNotice.tone === 'error' ? 'alert' : 'status'}>{publicNotice.text}</div>}
                {staffState === 'loading' && <div className="state-message" role="status">Memuatkan senarai staf…</div>}
                {staffState === 'error' && <div className="state-message error" role="alert">{staffError}</div>}
                {staffState === 'ready' && activeStaff.length === 0 && (
                  <div className="state-message">Tiada staf aktif buat masa ini. Sila hubungi pentadbir.</div>
                )}
                {staffState === 'ready' && activeStaff.length > 0 && (
                  <button className="primary-button public-trigger" ref={publicTrigger} type="button" onClick={() => { setPublicNotice(null); setPublicOpen(true) }}>
                    Buka borang pengesahan
                  </button>
                )}
              </div>
              <aside className="panel guidance-card">
                <h2>Ringkas dan terkawal</h2>
                <p>Tiada ruang untuk catatan kesihatan, alasan atau lampiran. Gunakan hanya jenis pengecualian yang tersedia.</p>
                <ul className="status-key" aria-label="Status yang dibenarkan">
                  {STATUSES.map((status) => <li key={status}>{statusLabel[status]}</li>)}
                </ul>
              </aside>
            </section>
          </>
        ) : (
          <section className="admin-workspace" aria-labelledby="admin-title">
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">Akses pentadbir</p>
                <h1 id="admin-title">Urus keberadaan staf</h1>
              </div>
              <p>Rekod dan pembetulan memerlukan sesi pentadbir.</p>
            </div>

            <nav className="admin-tabs strip" aria-label="Navigasi pentadbir">
              <button className={adminTab === 'dashboard' ? 'active' : ''} type="button" onClick={() => void selectAdminTab('dashboard')}>Hari ini</button>
              <button className={adminTab === 'roster' ? 'active' : ''} type="button" onClick={() => void selectAdminTab('roster')}>Senarai staf</button>
              <button className={adminTab === 'correction' ? 'active' : ''} type="button" onClick={() => void selectAdminTab('correction')}>Pembetulan</button>
              <button className={adminTab === 'report' ? 'active' : ''} type="button" onClick={() => void selectAdminTab('report')}>Laporan</button>
            </nav>

            {adminNotice && <div className={`notice ${adminNotice.tone}`} role={adminNotice.tone === 'error' ? 'alert' : 'status'}>{adminNotice.text}</div>}

            {adminTab === 'dashboard' && (
              <section className="panel admin-panel" aria-labelledby="dashboard-title">
                <div className="panel-heading with-control">
                  <div>
                    <h2 id="dashboard-title">Rekod mengikut tarikh</h2>
                    <p>Semak rekod yang dihantar untuk tarikh dipilih.</p>
                  </div>
                  <label className="compact-field">Tarikh<input type="date" value={dashboardDate} onChange={(event) => { setDashboardDate(event.target.value); void loadDashboard(event.target.value) }} /></label>
                </div>
                {dashboardBusy ? <div className="state-message" role="status">Memuatkan rekod…</div> : records.length === 0 ? <div className="state-message">Tiada rekod untuk tarikh ini.</div> : (
                  <ul className="record-list">
                    {records.map((record) => (
                      <li key={record.id}>
                        <div><strong>{record.staffName}</strong><span>{record.date}</span></div>
                        <span className="pill" data-status={record.status}>{statusLabel[record.status]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {adminTab === 'roster' && (
              <section className="roster-grid" aria-label="Pengurusan senarai staf">
                <div className="panel admin-panel">
                  <div className="panel-heading"><div><h2>Tambah staf</h2><p>Satu nama pada satu masa.</p></div></div>
                  <form className="inline-form" onSubmit={addStaff}>
                    <label className="visually-hidden" htmlFor="new-staff">Nama staf</label>
                    <input id="new-staff" value={newStaffName} onChange={(event) => setNewStaffName(event.target.value)} placeholder="Nama penuh staf" maxLength={120} />
                    <button className="secondary-button" type="submit" disabled={staffBusy === 'new'}>{staffBusy === 'new' ? 'Menyimpan…' : 'Tambah'}</button>
                  </form>
                  <form className="import-form" onSubmit={importStaff}>
                    <label htmlFor="import-staff">Import senarai</label>
                    <textarea id="import-staff" value={importNames} onChange={(event) => setImportNames(event.target.value)} placeholder={'Satu nama bagi setiap baris'} rows={5} />
                    <button className="text-button" type="submit" disabled={staffBusy === 'import'}>{staffBusy === 'import' ? 'Mengimport…' : 'Import nama'}</button>
                  </form>
                </div>
                <div className="panel admin-panel">
                  <div className="panel-heading"><div><h2>Senarai staf</h2><p>Ubah nama atau status aktif.</p></div></div>
                  {staffState === 'loading' && <div className="state-message" role="status">Memuatkan senarai staf…</div>}
                  {staffState === 'error' && <div className="state-message error" role="alert">{staffError}</div>}
                  {staffState === 'ready' && staff.length === 0 && <div className="state-message">Belum ada staf untuk diurus.</div>}
                  <div className="staff-list">
                    {staff.map((item) => (
                      <form className="staff-row" key={item.id} onSubmit={(event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name') || '').trim(); if (name) void patchStaff(item.id, { name }) }}>
                        <input name="name" aria-label={`Nama ${item.name}`} defaultValue={item.name} maxLength={120} />
                        <span className={item.active === false ? 'active-state inactive' : 'active-state'}>{item.active === false ? 'Tidak aktif' : 'Aktif'}</span>
                        <button className="text-button" type="submit" disabled={staffBusy === item.id}>Simpan</button>
                        <button className="icon-action" type="button" disabled={staffBusy === item.id} onClick={() => void patchStaff(item.id, { active: item.active === false })}>
                          {item.active === false ? 'Aktifkan' : 'Nyahaktif'}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {adminTab === 'correction' && (
              <section className="correction-grid" aria-label="Pembetulan rekod">
                <form className="panel admin-panel correction-form" onSubmit={saveCorrection}>
                  <div className="panel-heading"><div><h2>Tambah atau betulkan</h2><p>Simpan akan menggantikan rekod staf bagi tarikh sama.</p></div></div>
                  <label>Nama staf<select value={correctionStaffId} onChange={(event) => setCorrectionStaffId(event.target.value)} required><option value="">Pilih staf</option>{activeStaff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>Status<select value={correctionStatus} onChange={(event) => setCorrectionStatus(event.target.value as SelectedStatus)} required><option value="">Pilih status</option>{STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
                  <label>Tarikh<input type="date" value={correctionDate} onChange={(event) => setCorrectionDate(event.target.value)} required /></label>
                  <button className="primary-button" type="submit" disabled={correctionBusy || activeStaff.length === 0}>{correctionBusy ? 'Menyimpan…' : 'Simpan pembetulan'}</button>
                </form>
                <div className="panel admin-panel">
                  <div className="panel-heading with-control"><div><h2>Rekod untuk semakan</h2><p>Pilih rekod untuk ubah status atau tarikh.</p></div><label className="compact-field">Tarikh<input type="date" value={dashboardDate} onChange={(event) => { setDashboardDate(event.target.value); void loadDashboard(event.target.value) }} /></label></div>
                  {dashboardBusy ? <div className="state-message" role="status">Memuatkan rekod…</div> : records.length === 0 ? <div className="state-message">Tiada rekod untuk dibetulkan.</div> : <ul className="record-list edit-list">{records.map((record) => <li key={record.id}><div><strong>{record.staffName}</strong><span>{record.date}</span></div><span className="pill" data-status={record.status}>{statusLabel[record.status]}</span><button className="text-button" type="button" onClick={() => setEditing(record)}>Edit</button></li>)}</ul>}
                </div>
              </section>
            )}

            {adminTab === 'report' && (
              <section className="panel admin-panel" aria-labelledby="report-title">
                <div className="panel-heading with-control"><div><h2 id="report-title">Laporan bulanan</h2><p>Jumlah rekod mengikut staf dan status.</p></div><label className="compact-field">Bulan<input type="month" value={reportMonth} onChange={(event) => { setReportMonth(event.target.value); void loadReport(event.target.value) }} /></label></div>
                {reportBusy ? <div className="state-message" role="status">Memuatkan laporan…</div> : reportRows.length === 0 ? <div className="state-message">Tiada data laporan untuk bulan ini.</div> : <div className="report-table-wrap"><table><thead><tr><th scope="col">Staf</th><th scope="col">Status</th><th scope="col">Jumlah</th></tr></thead><tbody>{reportRows.map((row) => <tr key={`${row.staffName}-${row.status}`}><td>{row.staffName}</td><td><span className="pill" data-status={row.status}>{statusLabel[row.status]}</span></td><td>{row.total}</td></tr>)}</tbody></table></div>}
              </section>
            )}
          </section>
        )}
      </main>

      {!admin && <>
        <div className={`scrim ${publicOpen ? 'visible' : ''}`} onClick={closePublic} aria-hidden="true" />
        <section className={`sheet ${publicOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="public-form-title" aria-hidden={!publicOpen}>
          <div className="handle" />
          <div className="sheet-heading"><div><p className="eyebrow">Pengesahan staf</p><h2 id="public-form-title">Rekod pengecualian</h2></div><button className="close-button" type="button" aria-label="Tutup borang" onClick={closePublic}>×</button></div>
          <form className="public-form" onSubmit={submitPublic}>
            {publicNotice?.tone === 'error' && <div className="notice error" role="alert">{publicNotice.text}</div>}
            <label>Nama staf<select value={publicStaffId} onChange={(event) => setPublicStaffId(event.target.value)} required><option value="">Pilih nama</option>{activeStaff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <fieldset><legend>Jenis pengecualian</legend><div className="status-options">{STATUSES.map((status) => <button className={publicStatus === status ? 'selected' : ''} key={status} type="button" aria-pressed={publicStatus === status} onClick={() => setPublicStatus(status)}>{statusLabel[status]}</button>)}</div></fieldset>
            <label>Tarikh<input type="date" value={publicDate} onChange={(event) => setPublicDate(event.target.value)} required /></label>
            <p className="declaration">Saya mengesahkan makluman ini adalah tepat.</p>
            <button className="primary-button" type="submit" disabled={publicBusy || activeStaff.length === 0}>{publicBusy ? 'Menyimpan…' : 'Simpan makluman'}</button>
          </form>
        </section>
      </>}

      {!admin && <>
        <div className={`scrim ${adminOpen ? 'visible' : ''}`} onClick={closeAdmin} aria-hidden="true" />
        <section className={`sheet admin-sheet ${adminOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="login-title" aria-hidden={!adminOpen}>
          <div className="handle" />
          <div className="sheet-heading"><div><p className="eyebrow">Pentadbir SK Darau</p><h2 id="login-title">Masukkan PIN</h2></div><button className="close-button" type="button" aria-label="Tutup panel pentadbir" onClick={closeAdmin}>×</button></div>
          <form className="public-form" onSubmit={submitLogin}>
            <label htmlFor="admin-pin">PIN pentadbir<input id="admin-pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} required /></label>
            {adminNotice?.tone === 'error' && <div className="notice error" role="alert">{adminNotice.text}</div>}
            <button className="primary-button" type="submit" disabled={loginBusy}>{loginBusy ? 'Menyemak…' : 'Masuk ke pentadbir'}</button>
          </form>
        </section>
      </>}

      {editing && <>
        <div className="scrim visible" onClick={() => setEditing(null)} aria-hidden="true" />
        <section className="sheet open edit-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-title">
          <div className="handle" />
          <div className="sheet-heading"><div><p className="eyebrow">Pembetulan rekod</p><h2 id="edit-title">{editing.staffName}</h2></div><button className="close-button" type="button" aria-label="Tutup pembetulan" onClick={() => setEditing(null)}>×</button></div>
          <form className="public-form" onSubmit={updateException}>
            <label>Status<select name="status" defaultValue={editing.status}>{STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
            <label>Tarikh<input name="date" type="date" defaultValue={editing.date} required /></label>
            <button className="primary-button" type="submit" disabled={correctionBusy}>{correctionBusy ? 'Menyimpan…' : 'Simpan rekod'}</button>
          </form>
        </section>
      </>}
    </>
  )
}

export default App
