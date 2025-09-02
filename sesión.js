// sesion.js

const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const { log, logError } = require('./utils/logger');

async function connectToWhatsApp() {
    const sessionPath = './session';
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.macOS("Desktop"),
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", ({ connection, qr }) => {
        if (qr) {
            log("📌 Escanea este QR con tu WhatsApp:");
            qrcode.generate(qr, { small: true });
        }
        if (connection === "open") {
            log("✅ Bot conectado a WhatsApp");
        } else if (connection === "close") {
            log("⚠️ Conexión cerrada. Reconectando...");
            setTimeout(() => connectToWhatsApp(), 3000);
        }
    });

    return sock;
}

module.exports = { connectToWhatsApp };
