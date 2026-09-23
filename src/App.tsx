import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import schoolCrest from './assets/sk-darau-crest.jpg'

const STATUSES = ['CUTI', 'MC', 'KURSUS', 'URUSAN_RASMI', 'KELUAR_SEMENTARA'] as const
const WEEKDAY_LABELS = ['A', 'I', 'S', 'R', 'K', 'J', 'S']

type Status = (typeof STATUSES)[number]
type SelectedStatus = Status | ''
type StatusFilter = Status | 'ALL'
type AdminTab = 'dashboard' | 'roster' | 'correction' | 'report'
type Notice = { tone: 'error' | 'success'; text: string }
type Staff = { id: string; name: string; active?: boolean }
type ExceptionRecord = { id: string; staffId: string; staffName: string; status: Status; date: string; updatedAt: string }
type ReportRow = { staffName: string; status: Status; total: number }
type IconName = 'search' | 'download' | 'print' | 'close'

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

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('ms-MY')).join('') || 'S'
}

function csvCell(value: string | number) {
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

function dateCaption(date: string) {
  if (!validDate(date)) return 'Pilih tarikh'
  const value = new Date(`${date}T12:00:00`)
  const weekday = new Intl.DateTimeFormat('ms-MY', { weekday: 'long' }).format(value)
  const dayMonth = new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'long' }).format(value)
  return `${weekday} · ${dayMonth}`
}

function Icon({ name }: { name: IconName }) {
  if (name === 'search') return <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
  if (name === 'download') return <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M5 20h14" /></svg>
  if (name === 'print') return <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 8V3h10v5" /><path d="M6 17H4V9h16v8h-2" /><path d="M7 14h10v7H7z" /></svg>
  return <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [recordSearch, setRecordSearch] = useState('')
  const [profileRecord, setProfileRecord] = useState<ExceptionRecord | null>(null)
  const [freshRecordIds, setFreshRecordIds] = useState<Set<string>>(() => new Set())
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
  const profileTrigger = useRef<HTMLButtonElement | null>(null)
  const knownRecordIds = useRef<Set<string>>(new Set())
  const freshTimer = useRef<number | null>(null)

  const activeStaff = useMemo(() => staff.filter((item) => item.active !== false), [staff])
  const selectedDate = admin ? dashboardDate : publicDate
  const week = useMemo(() => weekDates(selectedDate), [selectedDate])
  const publicReady = staffState === 'ready' && activeStaff.length > 0
  const metricItems = useMemo(() => [
    { status: 'ALL' as const, label: 'Semua', total: records.length },
    ...STATUSES.map((status) => ({ status, label: statusLabel[status], total: records.filter((record) => record.status === status).length })),
  ], [records])
  const visibleRecords = useMemo(() => {
    const query = recordSearch.trim().toLocaleUpperCase('ms-MY')
    return records.filter((record) => (statusFilter === 'ALL' || record.status === statusFilter) && (!query || record.staffName.toLocaleUpperCase('ms-MY').includes(query)))
  }, [recordSearch, records, statusFilter])
  const reportVisual = useMemo(() => {
    const totals = STATUSES.map((status) => ({ status, total: reportRows.filter((row) => row.status === status).reduce((sum, row) => sum + Number(row.total), 0) }))
    return { total: totals.reduce((sum, item) => sum + item.total, 0), max: Math.max(1, ...totals.map((item) => item.total)), totals }
  }, [reportRows])

  function applyDashboardRecords(next: ExceptionRecord[], animateNew = false) {
    const nextIds = new Set(next.map((record) => record.id))
    const fresh = animateNew ? next.filter((record) => !knownRecordIds.current.has(record.id)).map((record) => record.id) : []
    knownRecordIds.current = nextIds
    setRecords(next)
    if (freshTimer.current !== null) window.clearTimeout(freshTimer.current)
    if (!fresh.length) {
      setFreshRecordIds(new Set())
      return
    }
    setFreshRecordIds(new Set(fresh))
    freshTimer.current = window.setTimeout(() => setFreshRecordIds(new Set()), 720)
  }

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

  async function loadDashboard(date = dashboardDate, quiet = false, animateNew = quiet) {
    if (!quiet) setDashboardBusy(true)
    try {
      const data = await api<{ date: string; records: ExceptionRecord[] }>(`/api/admin/dashboard?date=${encodeURIComponent(date)}`, {}, true)
      applyDashboardRecords(data.records, animateNew)
    } catch (error) {
      setAdminNotice({ tone: 'error', text: safeError(error) })
    } finally {
      if (!quiet) setDashboardBusy(false)
    }
  }

  async function loadPublicDashboard(date = publicDate, quiet = false, animateNew = quiet) {
    if (!quiet) setDashboardBusy(true)
    try {
      const data = await api<{ date: string; records: ExceptionRecord[] }>(`/api/dashboard?date=${encodeURIComponent(date)}`)
      applyDashboardRecords(data.records, animateNew)
    } catch (error) {
      setPublicNotice({ tone: 'error', text: safeError(error) })
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
    void Promise.all([loadStaff(), loadPublicDashboard()])
  }, [])

  useEffect(() => () => {
    if (freshTimer.current !== null) window.clearTimeout(freshTimer.current)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('keberadaan-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    if (admin && adminTab !== 'dashboard') return
    const refresh = admin
      ? () => void loadDashboard(dashboardDate, true)
      : () => void loadPublicDashboard(publicDate, true)
    const timer = window.setInterval(refresh, 15_000)
    return () => window.clearInterval(timer)
  }, [admin, adminTab, dashboardDate, publicDate])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab' && (profileRecord || editing || publicOpen || adminOpen)) {
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
      if (profileRecord) {
        closeProfile()
        return
      }
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
  }, [adminOpen, editing, profileRecord, publicOpen])

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
      await loadPublicDashboard(publicDate, false, true)
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
      setReportRows([])
      await Promise.all([loadStaff(), loadPublicDashboard(publicDate)])
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
      await loadDashboard(correctionDate, false, true)
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
    void loadPublicDashboard(date)
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

  function closeProfile() {
    setProfileRecord(null)
    profileTrigger.current?.focus()
  }

  function exportDailyCsv() {
    if (!admin) return
    const rows = [
      ['SK Darau', 'Ringkasan Kehadiran', dashboardDate],
      [],
      ['Bil.', 'Nama staf', 'Status', 'Keterangan', 'Tarikh'],
      ...records.map((record, index) => [index + 1, record.staffName, statusLabel[record.status], statusDetail[record.status], record.date]),
    ]
    const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `ringkasan-kehadiran-${dashboardDate}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const notice = admin ? adminNotice : publicNotice

  return (
    <>
      <main className="app">
        <header className="topbar">
          <div className="brand" aria-label="SK Darau, Keberadaan staf">
            <div className="mark school-mark"><img src={schoolCrest} alt="" /></div>
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
          <p>{admin ? 'Semak, betulkan dan urus rekod melalui akses pentadbir.' : 'Rekod hari ini dipaparkan kepada semua staf. Tambah rekod hanya bila perlu.'}</p>
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
              <div><h2 id="daily-title">Keberadaan hari ini</h2><span>{`${records.length} rekod · auto-refresh 15 saat`}</span></div>
              {admin && <label className="mini-field">Tarikh<input type="date" value={dashboardDate} onChange={(event) => chooseDate(event.target.value)} /></label>}
            </div>
            <div className="summary status-filter" aria-label="Tapis rekod mengikut status">
              {metricItems.map((item) => <button className="metric" data-active={statusFilter === item.status} data-status={item.status} key={item.status} type="button" aria-pressed={statusFilter === item.status} onClick={() => setStatusFilter(item.status)}><b>{item.total}</b><span>{item.label}</span></button>)}
            </div>
            <div className="dashboard-tools">
              <label className="search-field" htmlFor="record-search"><span className="visually-hidden">Cari nama dalam rekod</span><Icon name="search" /><input id="record-search" type="search" value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder="Cari nama dalam rekod" /></label>
              {admin && <div className="export-actions"><button className="text-button" type="button" onClick={exportDailyCsv}><Icon name="download" />Muat turun Excel (CSV)</button><button className="text-button" type="button" onClick={() => window.print()}><Icon name="print" />Cetak / Simpan PDF</button></div>}
            </div>
            {dashboardBusy ? <div className="state-message" role="status">Memuatkan rekod…</div> : <ul className="list">{visibleRecords.length === 0 ? <li className="empty-entry">{records.length === 0 ? 'Tiada rekod bagi tarikh ini.' : 'Tiada rekod sepadan.'}</li> : visibleRecords.map((record) => <li className="entry" data-fresh={freshRecordIds.has(record.id) || undefined} key={record.id}><i className="dot" data-status={record.status} aria-hidden="true" /><div><button className="entry-name" type="button" onClick={(event) => { profileTrigger.current = event.currentTarget; setProfileRecord(record) }}><b>{record.staffName}</b></button><small>{statusLabel[record.status]} · {record.date}</small></div><span className="pill" data-status={record.status}>{statusLabel[record.status]}</span>{admin && <div className="entry-actions"><button className="entry-edit" type="button" onClick={(event) => { editTrigger.current = event.currentTarget; setEditing(record) }}>Edit</button><button className="entry-delete" type="button" disabled={correctionBusy} onClick={() => void removeException(record)}>Padam</button></div>}</li>)}</ul>}
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
          {reportBusy ? <div className="state-message" role="status">Memuatkan laporan…</div> : reportRows.length === 0 ? <div className="state-message">Tiada data laporan untuk bulan ini.</div> : <><section className="report-visual" aria-labelledby="report-visual-title"><div><h3 id="report-visual-title">Laporan visual</h3><span>{reportVisual.total} rekod bagi bulan ini</span></div><div className="report-bars">{reportVisual.totals.map((item) => <div className="report-bar" data-status={item.status} key={item.status}><span>{statusLabel[item.status]}</span><div className="report-track"><i style={{ width: `${(item.total / reportVisual.max) * 100}%` }} /></div><b>{item.total}</b></div>)}</div></section><div className="report-table-wrap"><table><thead><tr><th scope="col">Staf</th><th scope="col">Status</th><th scope="col">Jumlah</th></tr></thead><tbody>{reportRows.map((row) => <tr key={`${row.staffName}-${row.status}`}><td>{row.staffName}</td><td><span className="pill" data-status={row.status}>{statusLabel[row.status]}</span></td><td>{row.total}</td></tr>)}</tbody></table></div></>}
        </section>}
      </main>

      {!admin && publicOpen && <><div className="scrim visible" onClick={closePublic} aria-hidden="true" /><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="public-form-title">
        <div className="handle" />
        <div className="sheet-top"><h2 id="public-form-title">Rekod Kehadiran</h2><button className="close" type="button" aria-label="Tutup borang" onClick={closePublic}><Icon name="close" /></button></div>
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
        <div className="sheet-top"><h2 id="login-title">Masukkan PIN</h2><button className="close" type="button" aria-label="Tutup panel pentadbir" onClick={closeAdmin}><Icon name="close" /></button></div>
        <form className="sheet-form" onSubmit={submitLogin}>
          <label className="field" htmlFor="admin-pin">PIN pentadbir<input id="admin-pin" autoFocus type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} required /></label>
          {adminNotice?.tone === 'error' && <div className="notice error" role="alert">{adminNotice.text}</div>}
          <button className="save" type="submit" disabled={loginBusy}>{loginBusy ? 'Menyemak…' : 'Masuk ke pentadbir'}</button>
        </form>
      </section></>}

      {profileRecord && <><div className="scrim visible" onClick={closeProfile} aria-hidden="true" /><section className="sheet profile-card" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="handle" />
        <div className="sheet-top"><h2 id="profile-title">Kad Kehadiran</h2><button className="close" type="button" autoFocus aria-label="Tutup kad kehadiran" onClick={closeProfile}><Icon name="close" /></button></div>
        <div className="profile-identity"><div className="profile-monogram" data-status={profileRecord.status} aria-hidden="true">{initials(profileRecord.staffName)}</div><div><p className="kicker">Rekod kehadiran</p><h3>{profileRecord.staffName}</h3><span className="pill" data-status={profileRecord.status}>{statusLabel[profileRecord.status]}</span></div></div>
        <dl className="profile-details"><div><dt>Status</dt><dd>{statusDetail[profileRecord.status]}</dd></div><div><dt>Tarikh</dt><dd>{dateCaption(profileRecord.date)}</dd></div></dl>
      </section></>}

      {editing && <><div className="scrim visible" onClick={closeEditing} aria-hidden="true" /><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div className="handle" />
        <div className="sheet-top"><h2 id="edit-title">{editing.staffName}</h2><button className="close" type="button" aria-label="Tutup pembetulan" onClick={closeEditing}><Icon name="close" /></button></div>
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
