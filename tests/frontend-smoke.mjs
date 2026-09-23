import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
for (const endpoint of [
  '/api/staff',
  '/api/exceptions',
  '/api/admin/login',
  '/api/admin/logout',
  '/api/admin/staff',
  '/api/admin/dashboard?',
  '/api/admin/report?',
  '/api/admin/import',
  '/api/admin/exceptions',
]) assert.ok(app.includes(endpoint), `missing ${endpoint}`)
assert.match(app, /credentials: 'include'/)
assert.doesNotMatch(app, /Get started|Cikgu Hana Ramli|Cikgu Farid Hakim|Puan Noraini Binti Hassan/)
console.log('FRONTEND_SMOKE_PASS')
