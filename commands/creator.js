// commands/creator.js
const { log, logError } = require('../utils/logger');
const { CREATOR_JID } = require('../config');

const handleCreatorCommands = async (sock, m, messageText) => {
    const senderJid = m.key.remoteJid;
    const isGroup = senderJid.endsWith('@g.us');
    const command = messageText.toLowerCase().trim();

    if (senderJid !== CREATOR_JID) {
        return false;
    }

    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    switch (true) {
        case command === '.on':
            return { type: 'config', key: 'groupCommandsEnabled', value: true, response: '✅ Comandos de grupo activados.' };
        case command === '.off':
            return { type: 'config', key: 'groupCommandsEnabled', value: false, response: '❌ Comandos de grupo desactivados.' };
        case command.startsWith('.e '):
            const parts = messageText.split(' ');
            const targetNumber = parts[1].replace(/\D/g, '');
            const targetJid = `${targetNumber}@s.whatsapp.net`;
            const msgBody = parts.slice(2).join(' ');
            if (targetJid && msgBody) {
                try {
                    await sock.sendMessage(targetJid, { text: msgBody });
                    log(`Mensaje enviado a ${targetJid} desde el comando .e`);
                    await sock.sendMessage(senderJid, { text: `✅ Mensaje enviado a ${targetNumber}` });
                } catch (e) {
                    logError(`Error al enviar mensaje con .e: ${e.message}`);
                    await sock.sendMessage(senderJid, { text: `❌ No se pudo enviar el mensaje a ${targetNumber}.` });
                }
            } else {
                await sock.sendMessage(senderJid, { text: "Uso incorrecto del comando. Formato: .e número mensaje" });
            }
            return true;
        case command.startsWith('.modo '):
            const mode = command.split(' ')[1];
            if (['activo', 'silencioso', 'fiesta'].includes(mode)) {
                return { type: 'config', key: 'botMode', value: mode, response: `✅ Modo del bot cambiado a: *${mode.charAt(0).toUpperCase() + mode.slice(1)}*.` };
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Modos disponibles: `activo`, `silencioso`, `fiesta`.' });
                return true;
            }
        case command.startsWith('.filtro-palabras '):
            const filterStatus = command.split(' ')[1];
            if (filterStatus === 'on') {
                return { type: 'config', key: 'isWordFilterEnabled', value: true, response: '✅ Filtro de palabras activado.' };
            } else if (filterStatus === 'off') {
                return { type: 'config', key: 'isWordFilterEnabled', value: false, response: '❌ Filtro de palabras desactivado.' };
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Formato: `.filtro-palabras [on/off]`' });
                return true;
            }
        case command.startsWith('.bloquear-links '):
            const linkStatus = command.split(' ')[1];
            if (linkStatus === 'on') {
                return { type: 'config', key: 'isAntiLinkEnabled', value: true, response: '✅ Bloqueo de enlaces activado.' };
            } else if (linkStatus === 'off') {
                return { type: 'config', key: 'isAntiLinkEnabled', value: false, response: '❌ Bloqueo de enlaces desactivado.' };
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Formato: `.bloquear-links [on/off]`' });
                return true;
            }
        // Group management commands
        case isGroup && command.startsWith('.kick') && mentionedJid !== undefined:
            await sock.groupParticipantsUpdate(senderJid, [mentionedJid], 'remove');
            log(`Miembro ${mentionedJid} expulsado por el creador.`);
            await sock.sendMessage(senderJid, { text: `✅ Usuario expulsado.` });
            return true;
        case isGroup && command.startsWith('.promover') && mentionedJid !== undefined:
            await sock.groupParticipantsUpdate(senderJid, [mentionedJid], 'promote');
            log(`Miembro ${mentionedJid} promovido a admin.`);
            await sock.sendMessage(senderJid, { text: `✅ Usuario promovido a admin.` });
            return true;
        case isGroup && command.startsWith('.limpiar '):
            const numMessages = parseInt(command.split(' ')[1], 10);
            if (isNaN(numMessages) || numMessages <= 0) {
                await sock.sendMessage(senderJid, { text: "Uso incorrecto. Formato: `.limpiar [número de mensajes]`" });
                return true;
            }
            const messages = await sock.fetchMessages(senderJid, { count: numMessages });
            const messageKeys = messages.map(msg => msg.key);
            await sock.deleteMessages(senderJid, messageKeys);
            await sock.sendMessage(senderJid, { text: `✅ Se eliminaron los últimos ${numMessages} mensajes.` });
            return true;
        case isGroup && command.startsWith('.anuncio '):
            const announcement = messageText.split(' ').slice(1).join(' ');
            const groups = await sock.groupFetchAllParticipating();
            for (const group of Object.values(groups)) {
                await sock.sendMessage(group.id, { text: `📢 *ANUNCIO DEL CREADOR:*\n\n${announcement}` });
            }
            await sock.sendMessage(senderJid, { text: `✅ Anuncio enviado a ${Object.keys(groups).length} grupos.` });
            return true;
        default:
            return false;
    }
};

module.exports = {
    handleCreatorCommands,
};
