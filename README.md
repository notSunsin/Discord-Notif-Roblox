# Roblox Future Windows + Potassium Discord Webhook Monitor (v3, role mention fixed)

Webhook Discord untuk **dua** notifikasi otomatis:

1. **Future Roblox Version, khusus Windows** dari `GET https://weao.xyz/api/versions/future`.
2. **Update executor Potassium, khusus Windows** dari `GET https://weao.xyz/api/status/exploits` dan changelog `GET https://weao.xyz/api/status/exploits/changelogs/potassium`.

Tidak memantau Mac, Madium, Photon, atau executor lainnya.

## Persiapan

- Node.js **20+** dengan `fetch` bawaan.
- URL webhook dari **Discord Server Settings → Integrations → Webhooks → New Webhook**.

## Instalasi

1. Ekstrak ZIP lalu buka folder ini di terminal VS Code.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env` (di Windows: `copy .env.example .env`).
4. Isi `DISCORD_WEBHOOK_URL` dengan URL webhook milikmu.
5. Jalankan `npm run test` untuk mengirim **dua embed DEMO sekaligus mention role** yang dikonfigurasi.
6. Jalankan `npm start` untuk memonitor setiap 5 menit. Gunakan `npm run once` untuk sekali pengecekan saja.

Tes terpisah:

- `npm run test:future` — kirim hanya demo Future Windows.
- `npm run test:potassium` — kirim hanya demo Potassium.
- `npm run unit` — tes logika lokal tanpa jaringan dan tanpa webhook.
- `npm run check` — pengecekan sintaks.

## Konfigurasi .env

```dotenv
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
WEBHOOK_NAME=Roblox Future & Potassium Tracker
POLL_MINUTES=5
ROLE_FUTURE_WINDOWS_ID=
ROLE_UPDATE_ID=
ROLE_POTASSIUM_ID=
AVATAR_URL=
FUTURE_THUMBNAIL_URL=
POTASSIUM_THUMBNAIL_URL=
```

- **Future Windows** akan ping `ROLE_FUTURE_WINDOWS_ID` jika diisi.
- **Potassium** akan ping `ROLE_UPDATE_ID` dan `ROLE_POTASSIUM_ID` jika diisi.
- Role kosong = tanpa mention. Role ID harus berasal dari server yang sama dan dapat di-mention.
- URL gambar HTTPS bersifat opsional.
- Tidak perlu membuat aplikasi Discord Bot: webhook cukup untuk notifikasi keluar.

## Kapan notifikasi dikirim?

### Future Windows

Membaca `Windows`, `WindowsDate`, `WindowsResponse.version` dari endpoint WEAO. Hash `Windows` dibandingkan dengan versi tersimpan di `state.json`. Jika berubah, kirim embed biru. Tidak membaca atau membandingkan field `Mac` sama sekali.

### Potassium Windows

Filter **title=Potassium** dan **platform=Windows** pada daftar WEAO. Kirim embed hijau bila `updateStatus` bernilai `true` dan salah satu berikut terjadi:

- versi Potassium (`version`) berubah;
- versi Roblox yang didukung (`rbxversion`) berubah; atau
- status sebelumnya `false` berubah menjadi `true`.

Perubahan tanggal saja tidak menimbulkan notifikasi. Jika `updateStatus=false`, status terbaru tetap disimpan tanpa notifikasi; saat kembali `true`, perubahan status memicu notifikasi.

### Pencegah spam

Pada eksekusi pertama tiap monitor, sistem hanya menyimpan baseline, **tanpa pesan live pertama**. `state.json` berisi status terakhir dan dipakai lagi setelah restart. Status hanya diperbarui setelah webhook yang diperlukan berhasil dikirim. Jika API/webhook error, status lama dipertahankan untuk percobaan berikutnya. Kedua monitor berjalan independen sehingga kegagalan satu API tidak menghentikan yang lain.

> File `state.json` tidak boleh dihapus setiap restart jika kamu ingin mencegah notifikasi yang tidak perlu.

## Sumber

- Future Windows: https://weao.xyz/api/versions/future
- Potassium status: https://weao.xyz/api/status/exploits
- Potassium changelog: https://weao.xyz/api/status/exploits/changelogs/potassium
- WEAO Exploits Docs: https://docs.weao.xyz/weao-api-reference/exploits.md
- WEAO membutuhkan `User-Agent: WEAO-3PService` untuk request API.

Respons API WEAO bisa berubah. Pengambilan data memvalidasi format JSON dan tidak membuat data versi atau changelog palsu. Bila rate limited (HTTP 429), perbesar `POLL_MINUTES`.

## Keamanan

- Jangan pernah membagikan URL webhook atau meng-commit `.env` ke GitHub.
- **Mode test juga melakukan ping role** jika ID terisi. Jangan terlalu sering menguji karena anggota role dapat menerima notifikasi berulang.
- Jika webhook tersebar, regenerasi/hapus webhook lama di Discord.
- Untuk monitoring 24/7, proses Node.js harus tetap berjalan pada perangkat/VPS.

## Memperbaiki role tidak ter-mention (v3)

Pada v2 mode test sengaja mengosongkan role ID. Pada v3, `npm run test`, `npm run test:future`, dan `npm run test:potassium` menggunakan role yang sama dengan monitoring live.

Payload Discord mengirim `content` berisi `<@&ROLE_ID>` **dan** `allowed_mentions` dengan `roles: ["ROLE_ID"]`. Sebagai contoh, role konfigurasi default adalah `1573713591826386976`. Discord membalas dengan `mention_roles`; script akan memperingatkan jika role tidak dikenali sebagai mention.

Jika role tidak menjadi ping aktif, periksa:

1. ID role benar dan berasal dari server yang sama dengan channel webhook.
2. Server Settings → Roles → pilih role → aktifkan **Allow anyone to @mention this role**, atau pastikan pengirim memiliki izin yang sesuai.
3. Channel tempat webhook mengirim pesan benar dan role dapat mengakses channel.
4. Notifikasi push bisa dipengaruhi pengaturan notifikasi anggota meski role mention sudah terdeteksi.

Gunakan `npm run unit` untuk pengujian logika **tanpa** mengirim pesan/ping ke Discord.
