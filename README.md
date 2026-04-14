# WA Bot Promo

Bot WhatsApp sederhana untuk menampilkan 4 kategori promo dengan gambar. Berjalan di Termux Android tanpa biaya.

## Fitur
- Menampilkan menu 4 kategori: Paling Murah, Tebus Heboh, Hemat Minggu Ini, Beli Banyak
- Mengirim gambar sesuai kategori yang dipilih
- Delay random seperti manusia mengetik
- Mendukung login via **QR Code** atau **Pairing Code** (Tautkan dengan Nomor Telepon)

## Cara Install di Termux

```bash
pkg update && pkg upgrade
pkg install nodejs git ffmpeg -y
termux-setup-storage
cd ~
git clone https://github.com/USERNAME/wa-bot-promo.git
cd wa-bot-promo
npm install
