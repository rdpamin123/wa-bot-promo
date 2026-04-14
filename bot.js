const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const readline = require('readline');

// Konfigurasi
const SESSION_DIR = 'auth_info_baileys';
const GAMBAR_DIR = path.join(__dirname, 'gambar');

const kategoriGambar = {
    '1': { nama: 'Paling Murah', file: 'murah.jpg' },
    '2': { nama: 'Tebus Heboh', file: 'tebus.jpg' },
    '3': { nama: 'Hemat Minggu Ini', file: 'hemat.jpg' },
    '4': { nama: 'Beli Banyak', file: 'borong.jpg' }
};

// Fungsi delay
function delayRandom() {
    return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 3000) + 2000));
}
function delayPendek() {
    return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 500));
}

// Simulasi mengetik
async function simulateTyping(sock, jid) {
    await sock.sendPresenceUpdate('composing', jid);
    await delayPendek();
    await sock.sendPresenceUpdate('paused', jid);
}

// Cek gambar
function cekGambar(namaFile) {
    return fs.existsSync(path.join(GAMBAR_DIR, namaFile));
}

// Kirim menu
async function kirimMenu(sock, jid) {
    const menuText = `🛍️ *PROMO SPESIAL HARI INI* 🛍️
    
Silakan pilih kategori promo:

1️⃣ *Paling Murah*
2️⃣ *Tebus Heboh*
3️⃣ *Hemat Minggu Ini*
4️⃣ *Beli Banyak*

_Balas angka 1, 2, 3, atau 4_`;

    await sock.sendMessage(jid, { text: menuText });
}

// Kirim gambar promo
async function kirimGambarPromo(sock, jid, kategori) {
    const data = kategoriGambar[kategori];
    const filePath = path.join(GAMBAR_DIR, data.file);
    
    if (!cekGambar(data.file)) {
        await sock.sendMessage(jid, { text: `⚠️ Gambar "${data.nama}" belum tersedia.` });
        return;
    }

    await sock.sendMessage(jid, {
        image: { url: filePath },
        caption: `📢 *${data.nama}*\n\nPromo terbaru untuk Anda.`
    });

    await delayPendek();
    await sock.sendMessage(jid, { text: `✨ Ketik *menu* untuk lihat kategori lain.` });
}

// Tanya metode login
function tanyaPairing() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question('Gunakan pairing code? (y/n): ', ans => {
        rl.close();
        resolve(ans.toLowerCase() === 'y');
    }));
}

async function mintaNomor() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question('Nomor WA bot (contoh: 62812xxx): ', ans => {
        rl.close();
        resolve(ans.replace(/\D/g, ''));
    }));
}

// Koneksi WA
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Termux Bot', 'Chrome', '1.0.0']
    });

    const pakaiPairing = await tanyaPairing();
    if (pakaiPairing) {
        const nomor = await mintaNomor();
        const code = await sock.requestPairingCode(nomor);
        console.log(`\n✅ Kode pairing: *${code}*`);
        console.log('📲 Buka WA > Perangkat Tertaut > Tautkan dengan Nomor Telepon');
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && !pakaiPairing) {
            console.log('\n📱 Scan QR:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
            else console.log('Logout. Hapus folder auth_info_baileys untuk login ulang.');
        } else if (connection === 'open') {
            console.log('✅ Bot terhubung!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        let pesan = '';
        const type = Object.keys(msg.message)[0];
        if (type === 'conversation') pesan = msg.message.conversation;
        else if (type === 'extendedTextMessage') pesan = msg.message.extendedTextMessage.text;
        else pesan = 'menu';
        
        const jid = msg.key.remoteJid;
        const teks = pesan.toLowerCase().trim();
        console.log(`📨 ${jid}: ${teks}`);

        if (['1','2','3','4'].includes(teks)) {
            await delayRandom();
            await simulateTyping(sock, jid);
            await kirimGambarPromo(sock, jid, teks);
        } else {
            await delayRandom();
            await simulateTyping(sock, jid);
            await kirimMenu(sock, jid);
        }
    });
}

console.log('🤖 Memulai WA Bot Promo...');
connectToWhatsApp().catch(err => console.error('Error:', err));
