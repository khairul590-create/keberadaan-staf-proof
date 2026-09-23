from collections import Counter
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return


def run_viewport(browser, base, label, viewport):
    staff = [{'id': 'staff-1', 'name': 'Cikgu Ujian', 'active': True}]
    records = []
    calls = []

    def reply(route, status, data):
        route.fulfill(status=status, content_type='application/json', body=__import__('json').dumps(data))

    def api(route):
        request = route.request
        parsed = urlparse(request.url)
        path, method = parsed.path, request.method
        body = request.post_data_json if request.post_data else {}
        calls.append((method, path, body))

        if path == '/api/staff' and method == 'GET':
            return reply(route, 200, {'staff': [item for item in staff if item['active']]})
        if path == '/api/admin/staff' and method == 'GET':
            return reply(route, 200, {'staff': staff})
        if path == '/api/admin/login' and method == 'POST':
            return reply(route, 200, {'ok': True})
        if path == '/api/admin/logout' and method == 'POST':
            return reply(route, 200, {'ok': True})
        if path == '/api/dashboard' and method == 'GET':
            date = parse_qs(parsed.query).get('date', [''])[0]
            return reply(route, 200, {'date': date, 'records': [item for item in records if item['date'] == date]})
        if path == '/api/admin/dashboard' and method == 'GET':
            date = parse_qs(parsed.query).get('date', [''])[0]
            return reply(route, 200, {'date': date, 'records': [item for item in records if item['date'] == date]})
        if path == '/api/admin/report' and method == 'GET':
            month = parse_qs(parsed.query).get('month', [''])[0]
            counts = Counter((item['staffName'], item['status']) for item in records if item['date'].startswith(month))
            return reply(route, 200, {'month': month, 'rows': [{'staffName': name, 'status': status, 'total': total} for (name, status), total in counts.items()]})
        if path == '/api/admin/staff' and method == 'POST':
            row = {'id': f'staff-{len(staff) + 1}', 'name': body['name'], 'active': True}
            staff.append(row)
            return reply(route, 201, {'staff': row})
        if path == '/api/admin/import' and method == 'POST':
            created = []
            for name in body['names']:
                if not any(item['name'] == name for item in staff):
                    row = {'id': f'staff-{len(staff) + 1}', 'name': name, 'active': True}
                    staff.append(row)
                    created.append(row)
            return reply(route, 200, {'created': created, 'skipped': len(body['names']) - len(created)})
        if path.startswith('/api/admin/staff/') and method == 'PATCH':
            item = next(item for item in staff if item['id'] == path.rsplit('/', 1)[1])
            item.update(body)
            return reply(route, 200, {'staff': item})
        if path in ('/api/exceptions', '/api/admin/exceptions') and method == 'POST':
            record = next((item for item in records if item['staffId'] == body['staffId'] and item['date'] == body['date']), None)
            staff_name = next(item['name'] for item in staff if item['id'] == body['staffId'])
            if record:
                record.update({'status': body['status'], 'staffName': staff_name})
            else:
                record = {'id': f'record-{len(records) + 1}', 'staffId': body['staffId'], 'staffName': staff_name, 'status': body['status'], 'date': body['date'], 'updatedAt': '2026-09-23T00:00:00Z'}
                records.append(record)
            return reply(route, 201, {'record': record})
        if path.startswith('/api/admin/exceptions/') and method == 'PATCH':
            record = next(item for item in records if item['id'] == path.rsplit('/', 1)[1])
            record.update(body)
            return reply(route, 200, {'record': record})
        if path.startswith('/api/admin/exceptions/') and method == 'DELETE':
            record_id = path.rsplit('/', 1)[1]
            records[:] = [item for item in records if item['id'] != record_id]
            return reply(route, 200, {'ok': True})
        return reply(route, 404, {'error': f'unmocked {method} {path}'})

    page = browser.new_page(viewport=viewport)
    page.add_init_script("window.__printCount = 0; window.print = () => { window.__printCount += 1 }")
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/**', api)
    page.goto(base, wait_until='networkidle')

    page.locator('.week .date.active').click()
    page.get_by_role('button', name='Rekod Kehadiran').click()
    page.locator('#public-date').fill('')
    page.get_by_role('heading', name='Siapa tidak berada di sekolah hari ini?').wait_for()
    page.locator('.sheet .close').focus()
    page.keyboard.press('Shift+Tab')
    assert page.evaluate("document.activeElement?.classList.contains('save')")
    page.keyboard.press('Escape')
    assert page.evaluate("document.activeElement?.classList.contains('fab')")
    page.get_by_role('button', name='Rekod Kehadiran').click()
    page.locator('#public-staff').select_option('staff-1')
    page.locator('.sheet .state').filter(has_text='Cuti').click()
    page.locator('.sheet .save').click()
    page.get_by_text('Rekod kehadiran Cikgu Ujian telah diterima.').wait_for()
    assert page.locator('.daily-panel .entry').count() == 1
    assert page.get_by_role('button', name='Edit').count() == 0
    assert page.get_by_role('button', name='Padam').count() == 0
    assert page.get_by_role('button', name='Muat turun Excel (CSV)').count() == 0
    assert page.get_by_role('button', name='Cetak / Simpan PDF').count() == 0
    name_trigger = page.get_by_role('button', name='Cikgu Ujian')
    name_trigger.click()
    page.get_by_role('heading', name='Kad Kehadiran').wait_for()
    assert page.locator('.profile-card').get_by_text('Cuti', exact=True).count() >= 1
    assert page.locator('.profile-card').get_by_text('Tiada di sekolah', exact=True).count() == 1
    assert page.locator('.profile-card').get_by_role('button', name='Edit').count() == 0
    assert page.locator('.profile-card').get_by_role('button', name='Padam').count() == 0
    page.screenshot(path=f'/tmp/keberadaan-hero-card-{label}.png', full_page=True)
    page.keyboard.press('Escape')
    assert page.evaluate("document.activeElement?.textContent?.trim() === 'Cikgu Ujian'")
    page.locator('.metric[data-status="MC"]').click()
    assert page.get_by_text('Tiada rekod sepadan.').count() == 1
    page.locator('.metric[data-status="CUTI"]').click()
    assert page.locator('.daily-panel .entry').count() == 1
    page.get_by_label('Cari nama dalam rekod').fill('tiada')
    assert page.get_by_text('Tiada rekod sepadan.').count() == 1
    page.get_by_label('Cari nama dalam rekod').fill('ujian')
    assert page.locator('.daily-panel .entry').count() == 1
    page.get_by_label('Cari nama dalam rekod').fill('')
    page.locator('.metric[data-status="ALL"]').click()
    public_dashboard_fetches = sum(method == 'GET' and path == '/api/dashboard' for method, path, _ in calls)
    page.wait_for_timeout(15_200)
    assert sum(method == 'GET' and path == '/api/dashboard' for method, path, _ in calls) > public_dashboard_fetches

    page.get_by_role('button', name='Pentadbir').click()
    page.locator('#admin-pin').fill('40074007')
    page.locator('.sheet .save').click()
    page.get_by_role('button', name='Log keluar').wait_for()
    page.get_by_text('Cikgu Ujian').wait_for()
    assert page.get_by_role('button', name='Edit').count() == 1
    assert page.get_by_role('button', name='Padam').count() == 1
    for name in ['Muat turun Excel (CSV)', 'Cetak / Simpan PDF']:
        assert page.get_by_role('button', name=name).evaluate('(element) => element.getBoundingClientRect().right <= window.innerWidth')
    page.get_by_role('button', name='Cetak / Simpan PDF').click()
    assert page.evaluate('window.__printCount') == 1
    with page.expect_download() as download_info:
        page.get_by_role('button', name='Muat turun Excel (CSV)').click()
    download = download_info.value
    assert download.suggested_filename.endswith('.csv')
    csv = Path(download.path()).read_text(encoding='utf-8-sig')
    assert 'Nama staf' in csv and 'Cikgu Ujian' in csv and 'Cuti' in csv
    dashboard_fetches = sum(method == 'GET' and path == '/api/admin/dashboard' for method, path, _ in calls)
    page.wait_for_timeout(15_200)
    assert sum(method == 'GET' and path == '/api/admin/dashboard' for method, path, _ in calls) > dashboard_fetches
    dashboard_date = page.locator('.daily-panel .mini-field input[type=date]')
    assert dashboard_date.evaluate('(element) => element.getBoundingClientRect().height >= 44')
    dashboard_date.fill('')
    page.get_by_role('heading', name='Keberadaan hari ini').wait_for()

    page.get_by_role('button', name='Senarai staf').click()
    page.locator('#new-staff').fill('Cikgu Baharu')
    page.locator('.inline-form .admin-action').click()
    page.get_by_text('Staf telah ditambah.').wait_for()

    page.get_by_role('button', name='Pembetulan').click()
    page.locator('.correction-form select').nth(0).select_option('staff-1')
    page.locator('.correction-form select').nth(1).select_option('KURSUS')
    page.locator('.correction-form .save').click()
    page.get_by_text('Rekod kehadiran dikemas kini.').wait_for()

    page.get_by_role('button', name='Hari ini').click()
    page.get_by_role('button', name='Edit').click()
    page.keyboard.press('Escape')
    assert page.evaluate("document.activeElement?.textContent?.trim() === 'Edit'")
    page.get_by_role('button', name='Edit').click()
    page.locator('#edit-status').select_option('MC')
    page.locator('.sheet .save').click()
    page.get_by_text('Rekod disimpan.').wait_for()
    page.get_by_role('button', name='Laporan').click()
    page.get_by_role('heading', name='Laporan bulanan').wait_for()
    page.get_by_text('Laporan visual').wait_for()
    assert page.locator('.report-bars .report-bar').count() == 5
    page.screenshot(path=f'/tmp/keberadaan-monthly-visual-{label}.png', full_page=True)
    report_month = page.locator('.report-panel .mini-field input[type=month]')
    assert report_month.evaluate('(element) => element.getBoundingClientRect().height >= 44')
    report_month.fill('')
    page.get_by_role('heading', name='Laporan bulanan').wait_for()

    page.get_by_role('button', name='Hari ini').click()
    page.once('dialog', lambda dialog: dialog.accept())
    page.get_by_role('button', name='Padam').click()
    page.get_by_text('Rekod kehadiran telah dipadam.').wait_for()
    assert page.get_by_text('Tiada rekod bagi tarikh ini.').count() == 1
    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
    assert not errors, errors
    page.close()

    assert any(method == 'GET' and path == '/api/dashboard' for method, path, _ in calls)
    assert any(method == 'POST' and path == '/api/exceptions' for method, path, _ in calls)
    assert any(method == 'POST' and path == '/api/admin/login' for method, path, _ in calls)
    assert any(method == 'POST' and path == '/api/admin/staff' for method, path, _ in calls)
    assert any(method == 'POST' and path == '/api/admin/exceptions' for method, path, _ in calls)
    assert any(method == 'PATCH' and path.startswith('/api/admin/exceptions/') for method, path, _ in calls)
    assert any(method == 'DELETE' and path.startswith('/api/admin/exceptions/') for method, path, _ in calls)


def run():
    dist = Path(__file__).parents[1] / 'dist'
    if not (dist / 'index.html').exists():
        raise SystemExit('Run npm run build before python3 tests/runtime-ui.py.')
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(dist)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            run_viewport(browser, base, 'mobile', {'width': 390, 'height': 844})
            run_viewport(browser, base, 'desktop', {'width': 1280, 'height': 900})
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print('RUNTIME_UI_PASS public+admin desktop+mobile')


if __name__ == '__main__':
    run()
