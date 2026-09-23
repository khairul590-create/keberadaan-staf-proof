import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const [app, css] = await Promise.all([
  readFile(new URL('src/App.tsx', root), 'utf8'),
  readFile(new URL('src/App.css', root), 'utf8'),
])

for (const control of ['fab', 'week', 'date', 'summary', 'metric', 'list', 'entry', 'entry-name', 'dashboard-tools', 'status-filter', 'aside', 'sheet', 'profile-card', 'states', 'state', 'report-bars', 'report-bar', 'export-actions']) {
  assert.match(`${app}\n${css}`, new RegExp(`\\.${control}|className=["\\"][^"\\"]*${control}`), `missing Proof V3 ${control} control`)
}
for (const endpoint of ['/api/staff', '/api/dashboard?', '/api/exceptions', '/api/admin/login', '/api/admin/logout', '/api/admin/dashboard?', '/api/admin/staff', '/api/admin/import', '/api/admin/report?', '/api/admin/exceptions']) {
  assert.ok(app.includes(endpoint), `missing ${endpoint}`)
}
assert.match(app, /Rekod Kehadiran/)
assert.match(app, /Rekod hari ini dipaparkan kepada semua staf/)
assert.doesNotMatch(app, /hanya boleh dilihat oleh pentadbir/)
assert.match(app, /admin && <div className="entry-actions"/)
assert.match(app, /method: 'DELETE'/)
assert.match(app, /auto-refresh 15 saat/)
assert.match(app, /entry-delete/)
assert.match(css, /\.entry-delete/)
assert.match(css, /\.delete-record/)
assert.match(app, /credentials: 'include'/)
assert.match(app, /function validDate/)
assert.match(app, /event\.key === 'Tab'/)
assert.match(app, /function closeEditing/)
assert.match(app, /function closeProfile/)
assert.match(app, /Muat turun Excel \(CSV\)/)
assert.match(app, /Cetak \/ Simpan PDF/)
assert.match(app, /Cari nama dalam rekod/)
assert.match(app, /Laporan visual/)
assert.match(app, /function exportDailyCsv/)
assert.match(app, /\^\[=\+\\-@\]/)
assert.match(app, /window\.print\(\)/)
assert.match(css, /\.mini-field input \{[^}]*min-height: 44px/s)
assert.match(app, /function Icon/)
assert.match(app, /stroke="currentColor"/)
assert.match(app, /data-fresh=/)
assert.match(css, /\.svg-icon/)
assert.match(css, /@keyframes sheet-in/)
assert.match(css, /@keyframes record-in/)
assert.match(css, /prefers-reduced-motion: reduce/)
assert.match(css, /animation: none !important/)
assert.match(css, /\.report-track i \{[^}]*animation:/s)
assert.match(css, /\.metric \{[^}]*transition:/s)
assert.match(css, /button:not\(\[disabled\]\):active/)
assert.doesNotMatch(app, /Cikgu Hana Ramli|Cikgu Farid Hakim|Puan Noraini Binti Hassan|rekod contoh/)
console.log('V3_UI_CONTRACT_PASS')
