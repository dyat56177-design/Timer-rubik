# CubeFlow – Timer Rubik

Timer speedcubing statis (HTML + CSS + JS), tanpa build step.

## Fitur
- Scramble 3×3 acak (20 langkah) + pratinjau pola kubus
- Tahan spasi / sentuh layar → merah → hijau → lepas untuk mulai; tekan apa saja untuk berhenti
- Inspeksi 15 detik opsional (+2 / DNF otomatis)
- Statistik: Terbaik, Ao5, Ao12, Rata-rata, grafik, +2 / DNF / hapus per solve
- Progres tersimpan otomatis di browser (localStorage), ekspor/impor JSON

## Jalankan lokal
Buka `index.html`, atau `npx serve .`

## Deploy ke Vercel via GitHub
1. `git init && git add . && git commit -m "CubeFlow"`
2. Buat repo di GitHub, lalu `git remote add origin <url> && git push -u origin main`
3. Di vercel.com → **Add New → Project** → pilih repo → **Deploy** (Framework: *Other*, tanpa build command).
