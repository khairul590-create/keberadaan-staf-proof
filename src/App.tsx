import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

const STATUSES = ['CUTI', 'MC', 'KURSUS', 'URUSAN_RASMI', 'KELUAR_SEMENTARA'] as const
const WEEKDAY_LABELS = ['A', 'I', 'S', 'R', 'K', 'J', 'S']

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

const statusDetail: Record<Status, string> = {
  CUTI: 'Tiada di sekolah',
  MC: 'Rehat sakit',
  KURSUS: 'Latihan rasmi',
  URUSAN_RASMI: 'Tugas luar',
  KELUAR_SEMENTARA: 'Akan kembali',
}

const dailyMetrics: Status[] = ['MC', 'KURSUS', 'URUSAN_RASMI']

function dateInput(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateInput(new Date(`${value}T12:00:00`)) === value
}

function localDate() {
  return dateInput(new Date())
}

function weekDates(selectedDate: string) {
  const start = validDate(selectedDate) ? new Date(`${selectedDate}T12:00:00`) : new Date()
  start.setDate(start.getDate() - start.getDay())
  return WEEKDAY_LABELS.map((weekday, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { date: dateInput(date), day: weekday, number: date.getDate() }
  })
}

function dateCaption(date: string) {
  if (!validDate(date)) return 'Pilih tarikh'
  const value = new Date(`${date}T12:00:00`)
  const weekday = new Intl.DateTimeFormat('ms-MY', { weekday: 'long' }).format(value)
  const dayMonth = new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'long' }).format(value)
  return `${weekday} · ${dayMonth}`
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
  const editTrigger = useRef<HTMLElement | null>(null)

  const activeStaff = useMemo(() => staff.filter((item) => item.active !== false), [staff])
  const selectedDate = admin ? dashboardDate : publicDate
  const week = useMemo(() => weekDates(selectedDate), [selectedDate])
  const publicReady = staffState === 'ready' && activeStaff.length > 0
  const metricItems = admin
    ? [
        { label: 'Jumlah rekod', total: records.length },
        { label: 'Tidak hadir', total: records.filter((record) => record.status !== 'KELUAR_SEMENTARA').length },
        { label: 'Keluar sementara', total: records.filter((record) => record.status === 'KELUAR_SEMENTARA').length },
      ]
    : dailyMetrics.map((status) => ({ label: statusLabel[status], total: '—' }))

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

  async function loadDashboard(date = dashboardDate, quiet = false) {
    if (!quiet) setDashboardBusy(true)
    try {
      const data = await api<{ date: string; records: ExceptionRecord[] }>(`/api/admin/dashboard?date=${encodeURIComponent(date)}`, {}, true)
      setRecords(data.records)
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      if (!quiet) setDashboardBusy(false)
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
    if (!admin || adminTab !== 'dashboard') return
    const timer = window.setInterval(() => void loadDashboard(dashboardDate, true), 15_000)
    return () => window.clearInterval(timer)
  }, [admin, adminTab, dashboardDate])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab' && (editing || publicOpen || adminOpen)) {
        const dialog = document.querySelector<HTMLElement>('.sheet[role="dialog"]')
        const focusable = dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')] : []
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
        return
      }
      if (event.key !== 'Escape') return
      if (editing) {
        closeEditing()
        return
      }
      if (publicOpen) {
        setPublicOpen(false)
        publicTrigger.current?.focus()
        return
      }
      if (adminOpen) {
        setAdminOpen(false)
        adminTrigger.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [adminOpen, editing, publicOpen])

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
      setPublicNotice({ tone: 'success', text: `Rekod kehadiran ${data.record.staffName} telah diterima.` })
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
      setDashboardDate(today)
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
      setDashboardDate(correctionDate)
      await loadDashboard(correctionDate)
      setCorrectionStatus('')
      setAdminNotice({ tone: 'success', text: 'Rekod kehadiran dikemas kini.' })
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

  async function removeException(record: ExceptionRecord) {
    if (!window.confirm(`Padam rekod kehadiran ${record.staffName} pada ${record.date}?`)) return
    setCorrectionBusy(true)
    setAdminNotice(null)
    try {
      await api(`/api/admin/exceptions/${encodeURIComponent(record.id)}`, { method: 'DELETE' }, true)
      if (editing?.id === record.id) closeEditing()
      await loadDashboard(dashboardDate)
      setAdminNotice({ tone: 'success', text: 'Rekod kehadiran telah dipadam.' })
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      setCorrectionBusy(false)
    }
  }

  function chooseDate(date: string) {
    if (!validDate(date)) return
    if (admin) {
      setDashboardDate(date)
      void loadDashboard(date)
      return
    }
    setPublicDate(date)
  }

  function closePublic() {
    setPublicOpen(false)
    publicTrigger.current?.focus()
  }

  function closeAdmin() {
    setAdminOpen(false)
    adminTrigger.current?.focus()
  }

  function closeEditing() {
    editTrigger.current?.focus()
    setEditing(null)
  }

  const notice = admin ? adminNotice : publicNotice

  return (
    <>
      <main className="app">
        <header className="topbar">
          <div className="brand" aria-label="SK Darau, Keberadaan staf">
            <div className="mark" aria-hidden="true">K</div>
            <div><b>SK Darau</b><span>Keberadaan staf</span></div>
          </div>
          <div className="top-actions">
            <button className="icon-btn" type="button" aria-label={dark ? 'Tukar mod cerah' : 'Tukar mod gelap'} aria-pressed={dark} onClick={() => setDark((value) => !value)}>{dark ? 'Cerah' : 'Gelap'}</button>
            {admin ? <button className="admin-btn" type="button" onClick={() => void logout()}>Log keluar</button> : <button className="admin-btn" ref={adminTrigger} type="button" aria-expanded={adminOpen} onClick={() => setAdminOpen(true)}>Pentadbir</button>}
          </div>
        </header>

        <section className="hero" aria-labelledby="page-title">
          <p className="kicker">{dateCaption(selectedDate)}</p>
          <h1 id="page-title">Siapa tidak berada di sekolah hari ini?</h1>
          <p>{admin ? 'Semak, betulkan dan urus rekod melalui akses pentadbir.' : 'Makluman harian tidak dipaparkan secara awam. Tambah rekod hanya bila perlu.'}</p>
        </section>

        {admin ? (
          <button className="fab" type="button" onClick={() => void selectAdminTab('correction')}>Tambah atau betulkan rekod</button>
        ) : (
          <button className="fab" ref={publicTrigger} type="button" aria-expanded={publicOpen} disabled={!publicReady} onClick={() => { setPublicNotice(null); setPublicOpen(true) }}>
            {staffState === 'loading' ? 'Memuatkan borang…' : publicReady ? 'Rekod Kehadiran' : 'Borang belum tersedia'}
          </button>
        )}

        <nav className="week" aria-label="Pilih tarikh minggu ini">
          {week.map((item) => <button className={`date ${item.date === selectedDate ? 'active' : ''}`} key={item.date} type="button" aria-pressed={item.date === selectedDate} aria-label={dateCaption(item.date)} onClick={() => chooseDate(item.date)}><span>{item.day}</span><b>{item.number}</b></button>)}
        </nav>

        {notice && <div className={`notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

        <div className="layout">
          <section className="panel daily-panel" aria-labelledby="daily-title">
            <div className="panel-title">
              <div><h2 id="daily-title">Keberadaan hari ini</h2><span>{admin ? `${records.length} rekod · auto-refresh 15 saat` : publicReady ? 'Rekod dilindungi' : staffState === 'error' ? 'Senarai staf tidak tersedia' : 'Belum sedia'}</span></div>
              {admin && <label className="mini-field">Tarikh<input type="date" value={dashboardDate} onChange={(event) => chooseDate(event.target.value)} /></label>}
            </div>
            <div className={`summary ${admin ? '' : 'privacy-summary'}`}>
              {metricItems.map((item) => <div className="metric" key={item.label}><b>{item.total}</b><span>{item.label}</span></div>)}
            </div>
            {admin ? (
              dashboardBusy ? <div className="state-message" role="status">Memuatkan rekod…</div> : <ul className="list">{records.length === 0 ? <li className="empty-entry">Tiada rekod bagi tarikh ini.</li> : records.map((record) => <li className="entry" key={record.id}><i className="dot" data-status={record.status} aria-hidden="true" /><div><b>{record.staffName}</b><small>{statusLabel[record.status]} · {record.date}</small></div><span className="pill" data-status={record.status}>{statusLabel[record.status]}</span><div className="entry-actions"><button className="entry-edit" type="button" onClick={(event) => { editTrigger.current = event.currentTarget; setEditing(record) }}>Edit</button><button className="entry-delete" type="button" disabled={correctionBusy} onClick={() => void removeException(record)}>Padam</button></div></li>)}</ul>
            ) : (
              <ul className="list"><li className="empty-entry">{staffState === 'loading' ? 'Memuatkan senarai staf…' : staffState === 'error' ? staffError : publicReady ? 'Borang tersedia. Makluman harian hanya boleh dilihat oleh pentadbir.' : 'Senarai staf sedang disediakan oleh pentadbir.'}</li></ul>
            )}
          </section>

          <aside className="panel aside">
            <h2>{admin ? 'Kawalan pentadbir' : 'Ringkas dan terkawal'}</h2>
            <p>{admin ? 'Pilih tugas, kemudian gunakan rekod harian dan borang pembetulan yang sama.' : 'Pilih nama sendiri sahaja. Makluman ini ialah pengesahan kehormatan; tiada nota perubatan atau lampiran.'}</p>
            {admin && <nav className="admin-tabs" aria-label="Navigasi pentadbir">
              <button className={adminTab === 'dashboard' ? 'active' : ''} type="button" onClick={() => void selectAdminTab('dashboard')}>Hari ini</button>
              <button className={adminTab === 'roster' ? 'active' : ''} type="button" onClick={() => void selectAdminTab('roster')}>Senarai staf</button>
              <button className={adminTab === 'correction' ? 'active' : ''} type="button" onClick={() => void selectAdminTab('correction')}>Pembetulan</button>
              <button className={adminTab === 'report' ? 'active' : ''} type="button" onClick={() => void selectAdminTab('report')}>Laporan</button>
            </nav>}
            <div className="status-key" aria-label="Status yang dibenarkan">
              {STATUSES.map((status) => <div className="key" key={status}><i className="dot" data-status={status} aria-hidden="true" />{statusLabel[status]}<em>{statusDetail[status]}</em></div>)}
            </div>
          </aside>
        </div>

        {admin && adminTab === 'roster' && <section className="admin-grid" aria-label="Pengurusan senarai staf">
          <div className="panel admin-panel">
            <div className="panel-title"><div><h2>Tambah staf</h2><span>Satu nama pada satu masa</span></div></div>
            <form className="inline-form" onSubmit={addStaff}>
              <label className="visually-hidden" htmlFor="new-staff">Nama staf</label>
              <input id="new-staff" value={newStaffName} onChange={(event) => setNewStaffName(event.target.value)} placeholder="Nama penuh staf" maxLength={120} />
              <button className="admin-action" type="submit" disabled={staffBusy === 'new'}>{staffBusy === 'new' ? 'Menyimpan…' : 'Tambah'}</button>
            </form>
            <form className="import-form" onSubmit={importStaff}>
              <label htmlFor="import-staff">Import senarai</label>
              <textarea id="import-staff" value={importNames} onChange={(event) => setImportNames(event.target.value)} placeholder="Satu nama bagi setiap baris" rows={5} />
              <button className="text-button" type="submit" disabled={staffBusy === 'import'}>{staffBusy === 'import' ? 'Mengimport…' : 'Import nama'}</button>
            </form>
          </div>
          <div className="panel admin-panel">
            <div className="panel-title"><div><h2>Senarai staf</h2><span>Ubah nama atau status aktif</span></div></div>
            {staffState === 'loading' && <div className="state-message" role="status">Memuatkan senarai staf…</div>}
            {staffState === 'error' && <div className="state-message error" role="alert">{staffError}</div>}
            {staffState === 'ready' && staff.length === 0 && <div className="state-message">Belum ada staf untuk diurus.</div>}
            <div className="staff-list">
              {staff.map((item) => <form className="staff-row" key={item.id} onSubmit={(event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name') || '').trim(); if (name) void patchStaff(item.id, { name }) }}>
                <input name="name" aria-label={`Nama ${item.name}`} defaultValue={item.name} maxLength={120} />
                <span className={item.active === false ? 'active-state inactive' : 'active-state'}>{item.active === false ? 'Tidak aktif' : 'Aktif'}</span>
                <button className="text-button" type="submit" disabled={staffBusy === item.id}>Simpan</button>
                <button className="text-button" type="button" disabled={staffBusy === item.id} onClick={() => void patchStaff(item.id, { active: item.active === false })}>{item.active === false ? 'Aktifkan' : 'Nyahaktif'}</button>
              </form>)}
            </div>
          </div>
        </section>}

        {admin && adminTab === 'correction' && <section className="admin-grid correction-grid" aria-label="Tambah atau pembetulan rekod kehadiran">
          <form className="panel admin-panel correction-form" onSubmit={saveCorrection}>
            <div className="panel-title"><div><h2>Tambah atau betulkan rekod kehadiran</h2><span>Satu rekod staf bagi satu tarikh</span></div></div>
            <label className="field">Nama staf<select value={correctionStaffId} onChange={(event) => setCorrectionStaffId(event.target.value)} required><option value="">Pilih staf</option>{activeStaff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="field">Status<select value={correctionStatus} onChange={(event) => setCorrectionStatus(event.target.value as SelectedStatus)} required><option value="">Pilih status</option>{STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
            <label className="field">Tarikh<input type="date" value={correctionDate} onChange={(event) => setCorrectionDate(event.target.value)} required /></label>
            <button className="save" type="submit" disabled={correctionBusy || activeStaff.length === 0}>{correctionBusy ? 'Menyimpan…' : 'Simpan pembetulan'}</button>
          </form>
          <section className="panel admin-panel correction-guide">
            <div className="panel-title"><div><h2>Semakan rekod</h2><span>Pilih Edit pada rekod harian</span></div></div>
            <p>Gunakan jalur tarikh di atas untuk memuatkan rekod lain, kemudian pilih Edit untuk menukar status atau tarikh.</p>
            <button className="admin-action" type="button" onClick={() => void selectAdminTab('dashboard')}>Kembali ke rekod harian</button>
          </section>
        </section>}

        {admin && adminTab === 'report' && <section className="panel admin-panel report-panel" aria-labelledby="report-title">
          <div className="panel-title"><div><h2 id="report-title">Laporan bulanan</h2><span>Jumlah rekod mengikut staf dan status</span></div><label className="mini-field">Bulan<input type="month" value={reportMonth} onChange={(event) => { if (!event.target.value) return; setReportMonth(event.target.value); void loadReport(event.target.value) }} /></label></div>
          {reportBusy ? <div className="state-message" role="status">Memuatkan laporan…</div> : reportRows.length === 0 ? <div className="state-message">Tiada data laporan untuk bulan ini.</div> : <div className="report-table-wrap"><table><thead><tr><th scope="col">Staf</th><th scope="col">Status</th><th scope="col">Jumlah</th></tr></thead><tbody>{reportRows.map((row) => <tr key={`${row.staffName}-${row.status}`}><td>{row.staffName}</td><td><span className="pill" data-status={row.status}>{statusLabel[row.status]}</span></td><td>{row.total}</td></tr>)}</tbody></table></div>}
        </section>}
      </main>

      {!admin && publicOpen && <><div className="scrim visible" onClick={closePublic} aria-hidden="true" /><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="public-form-title">
        <div className="handle" />
        <div className="sheet-top"><h2 id="public-form-title">Rekod Kehadiran</h2><button className="close" type="button" aria-label="Tutup borang" onClick={closePublic}>×</button></div>
        <div className="progress" aria-label="Borang satu langkah"><i className="active" /><i className="active" /><i className="active" /></div>
        <form className="sheet-form" onSubmit={submitPublic}>
          {publicNotice?.tone === 'error' && <div className="notice error" role="alert">{publicNotice.text}</div>}
          <label className="field" htmlFor="public-staff">Nama staf<select id="public-staff" autoFocus value={publicStaffId} onChange={(event) => setPublicStaffId(event.target.value)} required><option value="">Pilih nama</option>{activeStaff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <fieldset className="field"><legend>Status kehadiran</legend><div className="states" role="group" aria-label="Pilih status">{STATUSES.map((status) => <button className="state" key={status} type="button" aria-pressed={publicStatus === status} onClick={() => setPublicStatus(status)}>{statusLabel[status]}<small>{statusDetail[status]}</small></button>)}</div></fieldset>
          <label className="field" htmlFor="public-date">Tarikh<input id="public-date" type="date" value={publicDate} onChange={(event) => chooseDate(event.target.value)} required /></label>
          <button className="save" type="submit" disabled={publicBusy || !publicReady}>{publicBusy ? 'Menyimpan…' : 'Simpan kehadiran'}</button>
        </form>
      </section></>}

      {!admin && adminOpen && <><div className="scrim visible" onClick={closeAdmin} aria-hidden="true" /><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className="handle" />
        <div className="sheet-top"><h2 id="login-title">Masukkan PIN</h2><button className="close" type="button" aria-label="Tutup panel pentadbir" onClick={closeAdmin}>×</button></div>
        <form className="sheet-form" onSubmit={submitLogin}>
          <label className="field" htmlFor="admin-pin">PIN pentadbir<input id="admin-pin" autoFocus type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} required /></label>
          {adminNotice?.tone === 'error' && <div className="notice error" role="alert">{adminNotice.text}</div>}
          <button className="save" type="submit" disabled={loginBusy}>{loginBusy ? 'Menyemak…' : 'Masuk ke pentadbir'}</button>
        </form>
      </section></>}

      {editing && <><div className="scrim visible" onClick={closeEditing} aria-hidden="true" /><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div className="handle" />
        <div className="sheet-top"><h2 id="edit-title">{editing.staffName}</h2><button className="close" type="button" aria-label="Tutup pembetulan" onClick={closeEditing}>×</button></div>
        <form className="sheet-form" onSubmit={updateException}>
          <label className="field" htmlFor="edit-status">Status<select id="edit-status" name="status" autoFocus defaultValue={editing.status}>{STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
          <label className="field" htmlFor="edit-date">Tarikh<input id="edit-date" name="date" type="date" defaultValue={editing.date} required /></label>
          <button className="save" type="submit" disabled={correctionBusy}>{correctionBusy ? 'Menyimpan…' : 'Simpan rekod'}</button>
          <button className="delete-record" type="button" disabled={correctionBusy} onClick={() => void removeException(editing)}>Padam rekod</button>
        </form>
      </section></>}
    </>
  )
}

export default App
