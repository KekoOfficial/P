// commands/general.js
const os = require('os');
const { log } = require('../utils/logger');
const config = require('../config');

const sendMenu = async (sock, jid) => {
    const menuMessage = `
╔════════════════════╗
🌟 ⚙️ MENÚ DE COMANDOS 🌟
Creado por NoaDevStudio
╚════════════════════╝

✨ Comandos Generales:

📝 ~menu  —  Muestra este menú de comandos.
📊 !estado — Muestra el estado del bot y su versión.
🎲 !dado  — Lanza un dado.
🎱 !8ball — Haz una pregunta y recibe una respuesta.

💡 Para usar los comandos, solo escribe el comando en el chat.
`
    await sock.sendMessage(jid, { text: menuMessage });
};

const handleGeneralCommands = async (sock, m, messageText) => {
    const senderJid = m.key.remoteJid;
    const command = messageText.toLowerCase().trim();

    switch (true) {
        case command === '~menu':
        case command === '!ayuda':
        case command === '!help':
            await sendMenu(sock, senderJid);
            break;
        case command === '!estado':
            const uptime = process.uptime();
            const uptimeDays = Math.floor(uptime / (3600 * 24));
            const uptimeHours = Math.floor((uptime % (3600 * 24)) / 3600);
            const uptimeMinutes = Math.floor((uptime % 3600) / 60);
            const uptimeSeconds = Math.floor(uptime % 60);
            const freeMem = (os.freemem() / 1024 / 1024).toFixed(2);
            const totalMem = (os.totalmem() / 1024 / 1024).toFixed(2);
            const statusMessage = `*🤖 Estado del Bot:*\n\n✅ En línea\n⏰ Tiempo en línea: ${uptimeDays}d, ${uptimeHours}h, ${uptimeMinutes}m, ${uptimeSeconds}s\n🧠 Memoria Libre: ${freeMem} MB / ${totalMem} MB\n\nVersión: ${config.BOT_VERSION}\nModo actual: ${config.BOT_MODE.charAt(0).toUpperCase() + config.BOT_MODE.slice(1)}`;
            await sock.sendMessage(senderJid, { text: statusMessage });
            break;
        case command === '!dado':
            const roll = Math.floor(Math.random() * 6) + 1;
            await sock.sendMessage(senderJid, { text: `🎲 Has lanzado un dado y ha caído en: *${roll}*` });
            break;
        case command.startsWith('!8ball'):
            const responses = [
                "Sí, definitivamente.", "Es una certeza.", "Sin duda.", "Probablemente.",
                "No estoy seguro, pregúntame de nuevo.", "Mejor no te digo ahora.",
                "No cuentes con ello.", "Mi respuesta es no.", "Mis fuentes dicen que no."
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            await sock.sendMessage(senderJid, { text: `🎱 La bola mágica dice: *${randomResponse}*` });
            break;
        case command === '!abrir':
        case command === '!cerrar':
        case command === '!tickets':
            // Estos comandos son manejados por el archivo principal debido a la dependencia del objeto 'tickets'.
            break;
        default:
            // No hacer nada si el comando no es reconocido.
            break;
    }
};

module.exports = {
    handleGeneralCommands,
    sendMenu
};
