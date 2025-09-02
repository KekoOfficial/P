// commands/general.js
const os = require('os');
const { log } = require('../utils/logger');
const { BOT_VERSION, BOT_MODE } = require('../config');

const sendMenu = async (sock, jid) => {
    const menuMessage = `
╔════════════════════╗
🌟 ⚙️ MENÚ DE COMANDOS 🌟
Creado por NoaDevStudio
╚════════════════════╝

✨ Opciones Principales:
1️⃣ PRIVADO — ✉️ Enviar mensaje a un contacto
2️⃣ TICKETS — 🎫 Gestionar tickets abiertos
3️⃣ GRUPO — 👥 Ver tus grupos
4️⃣ ABRIR TICKET — 🆕 Abrir un ticket a un contacto


---

ℹ️ Indicaciones:

📝 Usa ~menu para ver todos los comandos

🔙 Usa .1 para salir de un modo

❌ Usa .2 para cerrar un ticket
`
    await sock.sendMessage(jid, { text: menuMessage });
};

const handleGeneralCommands = async (sock, m, command) => {
    const senderJid = m.key.remoteJid;
    const isGroup = senderJid.endsWith('@g.us');

    switch (command) {
        case '~menu':
        case '!ayuda':
        case '!help':
            await sendMenu(sock, senderJid);
            break;
        case '!estado':
        case '.estado':
            const uptime = process.uptime();
            const uptimeDays = Math.floor(uptime / (3600 * 24));
            const uptimeHours = Math.floor((uptime % (3600 * 24)) / 3600);
            const uptimeMinutes = Math.floor((uptime % 3600) / 60);
            const uptimeSeconds = Math.floor(uptime % 60);
            const freeMem = (os.freemem() / 1024 / 1024).toFixed(2);
            const totalMem = (os.totalmem() / 1024 / 1024).toFixed(2);
            const statusMessage = `*🤖 Estado del Bot:*\n\n✅ En línea\n⏰ Tiempo en línea: ${uptimeDays}d, ${uptimeHours}h, ${uptimeMinutes}m, ${uptimeSeconds}s\n🧠 Memoria Libre: ${freeMem} MB / ${totalMem} MB\n\nVersión: ${BOT_VERSION}\nModo actual: ${BOT_MODE.charAt(0).toUpperCase() + BOT_MODE.slice(1)}`;
            await sock.sendMessage(senderJid, { text: statusMessage });
            break;
        case '!dado':
            const roll = Math.floor(Math.random() * 6) + 1;
            await sock.sendMessage(senderJid, { text: `🎲 Has lanzado un dado y ha caído en: *${roll}*` });
            break;
        case '!abrir':
            // Logic for opening a ticket will remain in index.js for now
            // because it uses the 'tickets' object which is not exported.
            break;
        case '!cerrar':
            // Logic for closing a ticket will remain in index.js for now.
            break;
        // More commands can be added here
        default:
            if (command.startsWith('!8ball')) {
                const responses = [
                    "Sí, definitivamente.", "Es una certeza.", "Sin duda.", "Probablemente.",
                    "No estoy seguro, pregúntame de nuevo.", "Mejor no te digo ahora.",
                    "No cuentes con ello.", "Mi respuesta es no.", "Mis fuentes dicen que no."
                ];
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                await sock.sendMessage(senderJid, { text: `🎱 La bola mágica dice: *${randomResponse}*` });
            }
            break;
    }
};

module.exports = {
    handleGeneralCommands,
    sendMenu
};
