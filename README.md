# Compliance Perizinan Tambang Batubara

Dashboard edukatif dan alat bantu kontrol internal untuk kepatuhan perizinan usaha pertambangan batubara di Indonesia. Dashboard ini menyesuaikan diri dengan **tahap kegiatan** dan **karakteristik kegiatan** yang dipilih perusahaan, lalu menunjukkan:

- izin dan dokumen yang harus dilengkapi, beserta konsekuensi hukum bila belum ada;
- kelengkapan dokumen RKAB tahap operasi produksi per matrik dan aspek evaluasi (Kepmen ESDM 341.K/2025);
- timeline pengurusan dari tanggal mulai pengajuan, berdasarkan batas waktu layanan (SLA) dalam regulasi, termasuk jalur kritis dan jendela pengajuan RKAB;
- peta keterkaitan antar izin dan simulasi dampak bila satu izin belum terpenuhi;
- kalender kepatuhan tahunan dan peta status regulasi.

> **Disclaimer.** Bahan edukasi, bukan nasihat hukum. Isi disarikan dari regulasi per **21 Oktober 2026** dan dapat berubah. Selalu verifikasi ke JDIH Kementerian ESDM dan instansi penerbit sebelum mengambil keputusan.

---

## Isi repositori

```
.
├── index.html          # Halaman dashboard (markup + gaya)
├── app.js              # Logika dashboard
├── dash-shim.js        # Runtime ringan: memuat data/*.json, menyimpan pilihan di browser
├── data/               # Seluruh konten dashboard (JSON)
│   ├── izin.json           # 37 izin/dokumen: tahap, kondisi pemicu, dasar hukum, dokumen, SLA, sanksi
│   ├── relasi.json         # Keterkaitan antar izin (prasyarat, mengikat, gerbang, turunan)
│   ├── tahap.json          # 7 tahap kegiatan
│   ├── kondisi.json        # Pertanyaan karakteristik kegiatan + dasar hukum tiap pilihan
│   ├── dokumen_rkab.json   # 26 dokumen RKAB OP per matrik (Kepmen 341.K/2025)
│   ├── aspek_rkab.json     # 8 aspek evaluasi RKAB OP
│   ├── syarat_rkab.json    # 8 syarat Pasal 5 Permen ESDM 17/2025
│   ├── sanksi.json         # Konsekuensi hukum (pidana & administratif)
│   ├── eskalasi.json       # Tangga sanksi administratif
│   ├── kalender.json       # Tenggat tahunan, tenggat sejak peristiwa, tata waktu evaluasi RKAB
│   └── regulasi.json       # Daftar regulasi beserta statusnya
├── tools/gen_data.py   # Skrip sumber yang menghasilkan file data/*.json
└── .nojekyll           # Agar GitHub Pages menyajikan file apa adanya
```

Tidak ada proses build. Semua file statis; satu-satunya dependensi eksternal adalah **d3 v7** (dari CDN jsDelivr) dan font dari Google Fonts.

---

## Deploy ke GitHub Pages

1. Buat repositori baru di GitHub, misalnya `compliance-tambang-batubara`.
2. Unggah seluruh isi folder ini ke branch `main` (lewat tombol **Add file → Upload files**, atau dengan git):
   ```bash
   git init
   git add .
   git commit -m "Dashboard compliance perizinan tambang batubara"
   git branch -M main
   git remote add origin https://github.com/<username>/compliance-tambang-batubara.git
   git push -u origin main
   ```
3. Buka **Settings → Pages**. Pada **Build and deployment**, pilih **Source: Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
4. Tunggu 1–2 menit. Dashboard tersedia di `https://<username>.github.io/compliance-tambang-batubara/`.

**Catatan visibilitas:** di akun GitHub gratis, GitHub Pages hanya untuk repositori **publik**, sehingga siapa pun yang tahu tautannya dapat membuka dashboard dan isi `data/`. Isi bawaan hanya berupa ringkasan regulasi publik. **Jangan menyimpan data internal perusahaan** (status izin aktual, nomor SK, nilai jaminan) di folder `data/` repositori publik. Status yang diisi pengguna di dashboard tidak dikirim ke mana pun; status itu tersimpan di browser masing-masing pengguna.

---

## Menjalankan secara lokal

Dashboard memuat file JSON dengan `fetch`, sehingga **tidak bisa dibuka langsung dengan klik dua kali** (`file://`). Jalankan server lokal dari folder repositori:

```bash
python -m http.server 8000
```

Lalu buka `http://localhost:8000`.

---

## Cara pakai singkat

1. **Pilih tahap kegiatan**: pendirian & wilayah, eksplorasi, peningkatan ke OP, konstruksi, penambangan, pengangkutan & penjualan, atau penutupan tambang.
2. **Jawab 9 pertanyaan karakteristik kegiatan**, misalnya status kawasan hutan, jetty, peledakan, kontraktor, sumber air, hauling, BBM/impor, pencampuran, dan ekspor. Tiap pilihan menampilkan izin yang dipicu dan dasar hukumnya.
3. **Isi tanggal mulai pengajuan** untuk menghitung timeline.
4. Tandai **status** tiap izin (Belum dicek, Lengkap, Proses, Belum ada, Tidak berlaku) dan centang **dokumen RKAB** yang siap. Ringkasan, timeline, dan risiko hukum ikut diperbarui.

Pilihan profil, status izin, centang dokumen, dan durasi yang diubah **tersimpan di localStorage browser** pengguna masing-masing. Data ini tidak dibagikan antar pengguna atau antar perangkat. Tombol **Hapus data tersimpan** ada di bagian bawah halaman.

---

## Memperbarui konten

Konten ada di `data/*.json` dan bisa diedit langsung. Beberapa kolom penting di `izin.json`:

| Kolom | Arti |
|---|---|
| `tahap` | Tahap yang membutuhkan izin ini, misalnya `"T4,T5,T6"` |
| `sifat` | `Wajib`, `Kondisional`, atau `Tujuan` (titik mulai kegiatan fisik) |
| `kondisi_key` | Flag pemicu izin kondisional (harus cocok dengan kolom `flags` di `kondisi.json`) |
| `durasi`, `durasi_satuan` | Lama pengurusan (`hari kerja` / `hari kalender`); `null` untuk kewajiban berulang |
| `durasi_jenis` | `Regulasi` (SLA tertulis) atau `Estimasi` (SLA tidak ditemukan) |
| `sanksi_ids` | Rujukan ke `sanksi.json` |

Keterkaitan antar izin, yang menentukan urutan di timeline dan peta, diatur di `relasi.json` dengan kolom `dari`, `ke`, dan `jenis`.

Cara lain adalah mengubah `tools/gen_data.py` lalu menjalankan:

```bash
python tools/gen_data.py data
```

Perintah ini menulis ulang **semua** file di `data/`, jadi pilih salah satu cara saja (edit JSON langsung atau lewat skrip) agar perubahan tidak tertimpa.

---

## Asumsi dan keterbatasan

- **Durasi timeline** adalah batas waktu layanan pemerintah sejak dokumen dinyatakan lengkap. Waktu penyusunan dokumen oleh perusahaan **tidak termasuk**, kecuali item yang ditandai pihak "Perusahaan".
- Durasi bertanda **Estimasi** dipakai untuk izin yang SLA-nya tidak ditemukan dalam regulasi yang ditelusuri: studi kelayakan, IUP OP, KTT, pertek/SLO, bahan peledak, Tersus, SDA, Andalalin, IUJP, dan pencampuran batubara. Angkanya bisa diubah di tab Timeline.
- **Hari kerja** dihitung Senin–Jumat, belum memperhitungkan libur nasional dan cuti bersama.
- Aturan **jendela RKAB** mengikuti Permen ESDM 17/2025 Pasal 4: pengajuan 1 Oktober–15 November untuk tahun berikutnya, atau paling lambat 30 hari sejak IUP terbit.
- Pemetaan izin kondisional dan sanksi adalah ringkasan. Beberapa butir perlu diverifikasi ke teks resmi: ketentuan DMO tahunan, ancaman pidana lingkungan/kehutanan, dan ketentuan teknis pencampuran batubara yang menunggu Kepmen pelaksana.

---

## Regulasi utama yang dirujuk

- UU 4/2009 jo UU 3/2020 jo UU 2/2025 (Minerba); PP 96/2021 jo PP 25/2024 jo PP 39/2025
- PP 28/2025 (Perizinan Berusaha Berbasis Risiko: SLA AMDAL, KKPR, PPKH)
- Permen ESDM 17/2025 jo Permen ESDM 6/2026 (RKAB & pelaporan)
- Kepmen ESDM 341.K/MB.01/MEM.B/2025 (pedoman teknis RKAB), menggantikan acuan Kepmen 373.K/2023
- Kepmen ESDM 344.K/MB.01/MEM.B/2025 (reklamasi & pascatambang)
- Kepmen ESDM 365.K/MB.01/MEM.B/2026 (kontraktor afiliasi & jasa pertambangan lokal)
- Permen ESDM 26/2018 dan Kepmen ESDM 1827 K/30/MEM/2018 (kaidah pertambangan yang baik)
- UU 32/2009, UU 41/1999, UU 18/2013 (masing-masing jo UU 6/2023); PP 22/2021, PP 23/2021, PP 24/2021 jo PP 45/2025, PP 21/2021

Daftar lengkap beserta status dan tautan sumber ada di tab **Regulasi** dan file `data/regulasi.json`.

---

## Lisensi

Tambahkan lisensi sesuai kebutuhan organisasi Anda sebelum dipublikasikan, misalnya MIT untuk kode dan CC BY 4.0 untuk konten.
