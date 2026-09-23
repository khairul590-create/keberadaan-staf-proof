import assert from 'node:assert/strict'
import { VALID_STATUSES, isValidDate, normaliseName } from '../functions/api/[[path]].js'

assert.deepEqual([...VALID_STATUSES], ['CUTI', 'MC', 'KURSUS', 'URUSAN_RASMI', 'KELUAR_SEMENTARA'])
assert.equal(isValidDate('2026-09-22'), true)
assert.equal(isValidDate('22/09/2026'), false)
assert.equal(isValidDate('2026-02-30'), false)
assert.equal(normaliseName('  Cikgu   Hana  Ramli '), 'CIKGU HANA RAMLI')
console.log('API_CORE_PASS')
