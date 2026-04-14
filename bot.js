const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const readline = require('readline');

// ===== KONFIGURASI =====
const SESSION_DIR = 'auth_info_baileys';
const GAMBAR_DIR = path.join(__dirname, 'gambar');

// Mapping kategori ke file gambar
const kategoriGambar = {
    '1': { nama: 'Paling Murah', file: 'murah.jpg' },
    '2': { nama: 'Tebus Heboh', file: 'tebus.jpg' },
    '3': { nama: 'Hemat Minggu Ini', file: 'hemat.jpg' },
    '4': { nama: 'Beli Banyak', file: 'borong.jpg' }
};

// ===== FUNGSI UTILITY =====

// Delay random agar seperti manusia (2-5 detik)
function delayRandom() {
    const min = 2000;  // 2 detik
    const max = 5000;  // 5 detik
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

// Delay pendek untuk jeda antar aksi (0.5-1.5 detik)
function delayPendek() {
    const delay = Math.floor(Math.random() * 1000) + 500;
    return new Promise(resolve => setTimeout(resolve, delay));
}

// Simulasi "sedang mengetik"
async function simulateTyping(sock, jid) {
    await sock.sendPresenceUpdate('composing', jid);
    await delayPendek();
    await sock.sendPresenceUpdate('paused', jid);
}

// Cek apakah file gambar ada
function cekGambar(namaFile) {
    const filePath = path.join(GAMBAR_DIR, namaFile);
    return fs.existsSync(filePath);
}

// Kirim menu 4 kategori
async function kirimMenu(sock, jid) {
    const menuText = `🛍️ *PROMO SPESIAL HARI INI* 🛍️
    
Silakan pilih kategori promo yang Anda inginkan:

1️⃣ *Paling Murah* - Harga termurah sepanjang masa
2️⃣ *Tebus Heboh* - Diskon gila-gilaan
3️⃣ *Hemat Minggu Ini* - Promo mingguan
4️⃣ *Beli Banyak* - Paket borongan lebih hemat

_Balas dengan angka 1, 2, 3, atau 4 untuk melihat detail promo_`;

    await sock.sendMessage(jid, { text: menuText });
}

// Kirim gambar promo
async function kirimGambarPromo(sock, jid, kategori) {
    const data = kategoriGambar[kategori];
    const filePath = path.join(GAMBAR_DIR, data.file);
    
    // Cek apakah gambar ada
    if (!cekGambar(data.file)) {
        await sock.sendMessage(jid, { 
            text: `⚠️ Maaf, gambar untuk kategori "${data.nama}" belum tersedia.\n\nSilakan upload file "${data.file}" ke folder gambar.` 
        });
        return;
    }

    // Kirim gambar dengan caption
    const caption = `📢 *${data.nama}*\n\nBerikut adalah promo terbaru untuk kategori ${data.nama}.`;
    
    await sock.sendMessage(jid, {
        image: { url: filePath },
        caption: caption
    });

    // Tanya mau lihat promo lain
    await delayPendek();
    await sock.sendMessage(jid, { 
        text: `✨ Ingin melihat promo lainnya?\nKetik *menu* untuk kembali ke daftar kategori.` 
    });
}

// ===== FUNGSI INPUT PAIRING CODE =====
function tanyaPairingCode() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Gunakan pairing code (tautkan dengan nomor)? (y/n): ', (jawaban) => {
            rl.close();
            resolve(jawaban.toLowerCase() === 'y');
        });
    });
}

async function mintaNomor() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Masukkan nomor WhatsApp untuk bot (contoh: 6281234567890): ', (nomor) => {
            rl.close();
            // Hapus karakter non-digit
            const cleanNumber = nomor.replace(/\D/g, '');
            resolve(cleanNumber);
        });
    });
}

// ===== KONEKSI WHATSAPP =====
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // akan kita handle manual
        logger: pino({ level: 'silent' }),
        browser: ['Termux Bot', 'Chrome', '1.0.0']
    });

    // Tanyakan metode login
    const pakaiPairing = await tanyaPairingCode();
    
    if (pakaiPairing) {
        const nomorBot = await mintaNomor();
        console.log(`\n📱 Meminta kode pairing untuk nomor: ${nomorBot}`);
        
        // Minta kode pairing
        const pairingCode = await sock.requestPairingCode(nomorBot);
        console.log('\n✅ Kode pairing Anda: *' + pairingCode + '*');
        console.log('\n📲 Buka WhatsApp di HP Anda, masuk ke:');
        console.log('   Pengaturan > Perangkat Tertaut > Tautkan Perangkat');
        console.log('   Pilih "Tautkan dengan Nomor Telepon"');
        console.log('   Masukkan kode 8 digit di atas.');
        console.log('\n⏳ Menunggu konfirmasi dari WhatsApp...');
    } else {
        console.log('\n📱 Gunakan QR Code untuk login.');
    }

    // Handle event koneksi
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Tampilkan QR jika diperlukan (hanya jika tidak pakai pairing)
        if (qr && !pakaiPairing) {
            console.log('\n📱 Scan QR Code ini dengan WhatsApp Anda:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Koneksi terputus. Mencoba reconnect...');
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('❌ Logout. Hapus folder auth_info_baileys untuk login ulang.');
                process.exit(0);
            }
        } else if (connection === 'open') {
            console.log('\n✅ Bot berhasil terhubung ke WhatsApp!');
            console.log('🤖 Bot siap menerima pesan promo...');
            console.log('💡 Kirim pesan apa saja ke nomor bot untuk menampilkan menu.\n');
        }
    });

    // Simpan kredensial
    sock.ev.on('creds.update', saveCreds);

    // Handle pesan masuk
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        
        // Abaikan pesan dari bot sendiri atau pesan tanpa teks
        if (!msg.message || msg.key.fromMe) return;
        
        // Ambil teks pesan
        const messageType = Object.keys(msg.message)[0];
        let pesanText = '';
        
        if (messageType === 'conversation') {
            pesanText = msg.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            pesanText = msg.message.extendedTextMessage.text;
        } else if (messageType === 'imageMessage') {
            // Jika user kirim gambar, kasih balasan default
            pesanText = 'menu';
        }
        
        const jid = msg.key.remoteJid;
        const pesan = pesanText.toLowerCase().trim();
        
        console.log(`📨 Pesan dari ${jid}: "${pesan}"`);

        // Cek apakah pesan mengandung kata kunci atau angka
        const isMenu = pesan.includes('menu') || pesan.includes('halo') || pesan.includes('hai') || 
                       pesan.includes('promo') || pesan.includes('start') || pesan.includes('mulai');
        
        // Jika user kirim angka 1-4
        if (['1', '2', '3', '4'].includes(pesan)) {
            await delayRandom();
            await simulateTyping(sock, jid);
            await kirimGambarPromo(sock, jid, pesan);
        }
        // Jika user kirim perintah menu atau kata sapaan
        else if (isMenu) {
            await delayRandom();
            await simulateTyping(sock, jid);
            await kirimMenu(sock, jid);
        }
        // Jika user kirim pesan lain (customer chat apapun muncul menu)
        else if (pesan.length > 0) {
            await delayRandom();
            await simulateTyping(sock, jid);
            await kirimMenu(sock, jid);
        }
    });

    return sock;
}

// Jalankan bot
console.log('🤖 Memulai WhatsApp Bot Promo...');
connectToWhatsApp().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
