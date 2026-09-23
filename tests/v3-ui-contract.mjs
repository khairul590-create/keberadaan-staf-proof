import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const [app, css] = await Promise.all([
  readFile(new URL('src/App.tsx', root), 'utf8'),
  readFile(new URL('src/App.css', root), 'utf8'),
])

for (const control of ['fab', 'week', 'date', 'summary', 'metric', 'list', 'entry', 'aside', 'sheet', 'states', 'state']) {
  assert.match(`${app}\n${css}`, new RegExp(`\\.${control}|className=["\\"][^"\\"]*${control}`), `missing Proof V3 ${control} control`)
}
for (const endpoint of ['/api/staff', '/api/exceptions', '/api/admin/login', '/api/admin/logout', '/api/admin/dashboard?', '/api/admin/staff', '/api/admin/import', '/api/admin/report?', '/api/admin/exceptions']) {
  assert.ok(app.includes(endpoint), `missing ${endpoint}`)
}
assert.match(app, /credentials: 'include'/)
assert.match(app, /function validDate/)
assert.match(app, /event\.key === 'Tab'/)
assert.match(app, /function closeEditing/)
assert.match(css, /\.mini-field input \{[^}]*min-height: 44px/s)
assert.doesNotMatch(app, /Cikgu Hana Ramli|Cikgu Farid Hakim|Puan Noraini Binti Hassan|rekod contoh/)
console.log('V3_UI_CONTRACT_PASS')
