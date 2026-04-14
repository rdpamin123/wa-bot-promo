const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Konfigurasi folder auth untuk menyimpan sesi login
const AUTH_FOLDER = 'auth_info_wa';

// Folder tempat menyimpan gambar
const IMAGE_FOLDER = path.join(__dirname, 'gambar');

// Pastikan folder gambar ada
if (!fs.existsSync(IMAGE_FOLDER)) {
    fs.mkdirSync(IMAGE_FOLDER, { recursive: true });
}

// Interface untuk input/output terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Fungsi untuk membersihkan nomor telepon (hanya angka)
function sanitizePhoneNumber(phone) {
    return phone.replace(/\D/g, '');
}

// Fungsi koneksi dengan pairing code
async function connectWithPairingCode() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // Wajib false untuk pairing code
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Jika ada QR, gunakan pairing code
        if (qr) {
            if (!sock.authState.creds.registered) {
                console.log('\n📱 METODE PAIRING CODE (TANPA SCAN QR)');
                console.log('──────────────────────────────────────────');
                const phoneInput = await question('Masukkan nomor WA (contoh: 6281234567890): ');
                const phoneNumber = sanitizePhoneNumber(phoneInput);
                
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log('\n✅ KODE PAIRING ANDA:', code);
                    console.log('──────────────────────────────────────────');
                    console.log('📌 Cara memasukkan kode:');
                    console.log('1. Buka WhatsApp di HP Anda');
                    console.log('2. Masuk ke: Setelan > Perangkat Tertaut > Tautkan Perangkat');
                    console.log('3. Pilih "Tautkan dengan Kode" (bukan scan QR)');
                    console.log('4. Masukkan kode di atas');
                    console.log('──────────────────────────────────────────\n');
                } catch (error) {
                    console.error('❌ Gagal mendapatkan pairing code:', error.message);
                    process.exit(1);
                }
            }
        }
        
        if (connection === 'open') {
            console.log('🎉 Bot berhasil terhubung ke WhatsApp!\n');
            console.log('📌 BOT SIAP DIGUNAKAN. Perintah yang tersedia:');
            console.log('──────────────────────────────────────────');
            console.log('• !palingmurah   → Kirim gambar promo paling murah');
            console.log('• !tebusheboh    → Kirim gambar tebus heboh');
            console.log('• !belibanyak    → Kirim gambar beli banyak lebih hemat');
            console.log('• !promominggu   → Kirim gambar promo minggu ini');
            console.log('──────────────────────────────────────────\n');
        } else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) &&
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            
            console.log('Koneksi terputus. Mencoba menyambung ulang...', shouldReconnect);
            if (shouldReconnect) {
                connectWithPairingCode();
            } else {
                console.log('Koneksi ditutup. Jalankan ulang bot.');
                process.exit(1);
            }
        }
    });

    // Simpan kredensial saat update
    sock.ev.on('creds.update', saveCreds);

    return sock;
}

// Fungsi untuk mengirim gambar
async function sendImage(sock, jid, imageName, caption) {
    const imagePath = path.join(IMAGE_FOLDER, imageName);
    
    if (!fs.existsSync(imagePath)) {
        await sock.sendMessage(jid, { 
            text: `❌ Maaf, gambar "${imageName}" tidak ditemukan. Pastikan file ada di folder "gambar".` 
        });
        return;
    }
    
    try {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: caption
        });
        console.log(`✅ Gambar terkirim ke ${jid}`);
    } catch (error) {
        console.error('❌ Gagal mengirim gambar:', error.message);
        await sock.sendMessage(jid, { 
            text: '❌ Gagal mengirim gambar. Coba lagi nanti.' 
        });
    }
}

// Fungsi utama
async function startBot() {
    const sock = await connectWithPairingCode();
    
    // Mendengarkan pesan masuk
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return; // Abaikan pesan dari bot sendiri
        
        const messageType = Object.keys(msg.message)[0];
        if (messageType !== 'conversation' && messageType !== 'extendedTextMessage') return;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const sender = msg.key.remoteJid;
        
        console.log(`📨 Pesan dari ${sender}: ${text}`);
        
        // Respon berdasarkan perintah
        const lowerText = text.toLowerCase();
        
        if (lowerText === '!palingmurah') {
            await sendImage(sock, sender, 'paling-murah.jpg', 
                '💰 *PALING MURAH*\n\nDapatkan produk terbaik dengan harga termurah! Jangan lewatkan kesempatan ini.\n\n_Promo terbatas, pesan sekarang!_');
        } 
        else if (lowerText === '!tebusheboh') {
            await sendImage(sock, sender, 'tebus-heboh.jpg', 
                '🔥 *TEBUS HEBOH*\n\nPenawaran spesial yang bikin heboh! Harga gila-gilaan hanya untuk Anda.\n\n_Buruan sebelum kehabisan!_');
        }
        else if (lowerText === '!belibanyak') {
            await sendImage(sock, sender, 'beli-banyak.jpg', 
                '🛒 *BELI BANYAK LEBIH HEMAT*\n\nSemakin banyak beli, semakin hemat! Cocok untuk stok atau usaha.\n\n_Hubungi admin untuk harga grosir!_');
        }
        else if (lowerText === '!promominggu') {
            await sendImage(sock, sender, 'promo-minggu.jpg', 
                '📅 *PROMO MINGGU INI*\n\nUpdate promo terbaru minggu ini! Cek terus karena promo bisa berubah setiap minggu.\n\n_Tunggu apa lagi? Order sekarang!_');
        }
        else if (lowerText === '!ping') {
            await sock.sendMessage(sender, { text: '🏓 Pong! Bot aktif dan siap melayani.' });
        }
        else if (lowerText === '!help' || lowerText === '!menu') {
            const helpText = `🤖 *BOT PROMO - DAFTAR PERINTAH*

📌 *Perintah Kategori Gambar:*
• !palingmurah   → Kirim gambar promo paling murah
• !tebusheboh    → Kirim gambar tebus heboh
• !belibanyak    → Kirim gambar beli banyak lebih hemat
• !promominggu   → Kirim gambar promo minggu ini

📌 *Perintah Lain:*
• !ping          → Cek status bot
• !help / !menu  → Tampilkan menu ini

──────────────────
💡 Bot menggunakan metode pairing code, tidak perlu scan QR.`;
            await sock.sendMessage(sender, { text: helpText });
        }
    });
}

// Jalankan bot
startBot().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
