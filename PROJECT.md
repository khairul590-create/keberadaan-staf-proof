# Sistem Keberadaan Staf SK Darau — Project Brief

## Problem and V1 outcome
Pentadbir perlu melihat segera staf yang mempunyai rekod keberadaan pada sesuatu tarikh: Cuti, MC, Kursus, Urusan Rasmi atau Keluar Sementara. Staf mengisytiharkan status sendiri melalui borang ringkas tanpa login; semua staf melihat papan harian yang sama, manakala pentadbir membetulkan atau memadam rekod melalui dashboard dilindungi PIN.

V1 berjaya apabila seorang staf boleh memilih namanya, memasukkan status dan tarikh dari telefon, lalu rekod itu muncul pada papan hari yang sama untuk semua staf; hanya pentadbir boleh membetulkan atau memadamkannya.

## Users and permissions

| User | Read | Create | Update | Delete |
|---|---|---|---|---|
| Staf (tanpa login) | Papan harian: nama, status, tarikh, Hero Card | Satu rekod keberadaan bagi nama/tarikh yang dipilih | Tiada | Tiada |
| Pentadbir (satu PIN bersama) | Semua rekod, ringkasan harian, laporan visual bulanan | Rekod bagi pihak staf; staf baharu | Betulkan rekod dan roster | Padam rekod dengan audit |

## Core journeys
1. Staf buka URL → lihat/tapis/cari papan hari ini → tekan nama untuk Hero Card → pilih nama sendiri → status + tarikh → hantar → lihat rekod yang sama pada papan.
2. Pentadbir masukkan PIN → lihat papan hari ini → muat turun Excel-compatible CSV atau Cetak/Save PDF → buka rekod → betulkan status/tarikh atau padam dengan confirmation.
3. Pentadbir import CSV roster → semak staf aktif → lihat laporan bulanan visual mengikut status dan jadual staf.

## V1 modules
- Borang staf tanpa login dan papan harian bersama: Hero Card read-only, carian nama serta filter status.
- Dashboard pentadbir: ringkasan hari ini, Excel-compatible CSV, Print/Save PDF, pembetulan dan pemadaman rekod diaudit.
- Roster staf: import CSV dan tambah/edit staf.
- Laporan bulanan jadual + visual status native CSS.
- Audit rekod: masa cipta, kemas kini dan pemadaman; sumber staf atau pentadbir.

## Explicit V1 boundary
- Status hanya: `CUTI`, `MC`, `KURSUS`, `URUSAN_RASMI`, `KELUAR_SEMENTARA`.
- Rekod menyimpan status dan tarikh sahaja; tiada nota, diagnosis, sijil MC atau fail.
- Roster mula melalui CSV/Excel (andaian diterima; boleh ditukar sebelum build jika Bos beri sumber lain).

## Out of scope
- Akaun staf/DELIMa login.
- Pengesahan rasmi identiti staf.
- Dokumen MC, fail/R2, notifikasi, HRMIS/Calendar, multi-sekolah.

## Data, ownership and security boundary
- Satu sekolah sahaja: SK Darau.
- Data: nama staf, status keberadaan dan tarikh; tiada IC, telefon atau rekod perubatan.
- Borang terbuka ialah pengisytiharan kehormatan; ia tidak membuktikan orang sebenar yang memilih nama.
- Semua staf boleh melihat nama, status dan tarikh pada papan hari semasa. PIN pentadbir dan rahsia sesi disimpan sebagai Cloudflare Pages Secrets (`ADMIN_PIN`, `SESSION_SECRET`), bukan dalam D1 atau source. Sesi admin bertanda tangan, HTTP-only dan tamat tempoh. Percubaan PIN dilimitkan. Semua input disahkan server-side.
- Hanya pentadbir boleh memadam rekod. Pemadaman memerlukan confirmation UI, berlaku atomik bersama satu audit `EXCEPTION_DELETED`; PIN bersama tidak boleh mengenal pasti pentadbir individu.

## Chosen stack and deployment
- Frontend: React + TypeScript + Vite.
- Hosting: Cloudflare Pages.
- API: Pages Functions (Cloudflare Workers runtime).
- Database: Cloudflare D1.
- File storage: tiada R2 dalam V1.
- Deployment: akaun Cloudflare SK Darau/Bos; URL sebenar diputuskan sebelum release.

## Design direction
- Sumber rujukan: design-mcp `screenshot-dribbble-7b5a35da83`, dashboard web corporate/flat/minimal.
- Struktur yang diambil: ringkasan operasi dahulu, senarai tindakan utama, sidebar desktop yang jadi navigasi bawah pada telefon.
- Penyesuaian penting: tiada sidebar atau KPI grid berlebihan pada telefon. Skrin staf ialah satu tugasan ringkas; skrin admin memaparkan pengecualian hari ini dahulu.
- Minimum kebolehcapaian: 44px sentuhan, teks fungsi sekurang-kurangnya 16px pada telefon, status tidak bergantung kepada warna sahaja, reduced motion.
- Motion sistem ialah state-driven sahaja: dialog masuk, button press, filter, rekod baharu dan bar laporan. SVG inline ikut `currentColor`; tiada icon CDN, loop, parallax atau motion hiasan.

## Acceptance and release gate
- Browser telefon 390px dan desktop tiada overflow/overlap.
- Server menolak status/tarikh/nama tidak sah, percubaan admin PIN berlebihan dan panggilan admin tanpa sesi.
- Ujian unit bagi logik status/pembetulan; ujian browser bagi borang staf dan pembetulan admin.
- Production release: staf tulis satu rekod ujian yang dibenarkan → admin baca dan betulkan → D1 readback + audit dibuktikan.

## Upgrade triggers
- Perlu bukti siapa mengisi → tambah login DELIMa / Access.
- Perlu dokumen MC → tambah R2, akses fail dan retention policy.
- Perlu staf membetulkan rekod sendiri → login atau token per staf diperlukan.
- Perlu lebih daripada SK Darau → tambah tenant/school isolation sebelum data sekolah kedua.
