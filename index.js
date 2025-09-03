// index.js

const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    DisconnectReason,
    delay
} = require('@whiskeysockets/baileys');
const P = require('pino');

// Se usa makeCacheStore que es la forma actual de Baileys
const { makeCacheStore } = require('@whiskeysockets/baileys');
const store = makeCacheStore({
    logger: P({ level: 'silent' })
});

// Variables de configuración
const ownerNumbers = ['595984495031', '595986114722']; // ⚠️ CAMBIA ESTE NÚMERO POR TUS NÚMEROS
const warnLimit = 2; // Número de advertencias antes de expulsar al usuario

// Bases de datos temporales en memoria
const antiLink = {}; // Estado del AntiLink por grupo
const antiSpam = {}; // Estado del AntiSpam por grupo
const slowMode = {}; // Duración del SlowMode por grupo
const warnings = {}; // Advertencias por usuario

// Menús del bot
const ownerMenu = `
🤖 *MENÚ PRINCIPAL (OWNER)* 🤖

🛡️ *MODERACIÓN*
1. /antilink on|off
2. /antispam on|off
3. /warn @user [razón]
4. /warns @user
5. /kick @user
6. /ban @user
7. /unban @user
8. /kickall confirm

⚙️ *ADMINISTRACIÓN*
9. /bot on|off
10. /slowmode [seg]
11. /lock
12. /unlock
13. /config
14. /logs

`;

const adminMenu = `
🛡️ *MENÚ DE ADMINISTRADOR* 🛡️

1. /antilink on|off
2. /antispam on|off
3. /warn @user [razón]
4. /warns @user
5. /kick @user
6. /ban @user
7. /unban @user

⚙️ *ADMINISTRACIÓN*
8. /slowmode [seg]
9. /lock
10. /unlock
11. /config
12. /logs
`;

const memberMenu = `
📋 *MENÚ DE USUARIO* 📋

1. /config
2. /logs
3. .ticket
`;

// Función para generar la marca de tiempo
function createTimestamp() {
    const now = new Date();
    const date = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}:${now.getMilliseconds().toString().padStart(3, '0')}`;
    return `[${date} ${time}]`;
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        browser: Browsers.macOS('Desktop'),
    });

    store.bind(sock.ev);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. ¿Reconectando?', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado a WhatsApp');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Evento para cuando un nuevo miembro se une al grupo (incluido el bot)
    sock.ev.on('group-participants.update', async (update) => {
        const botId = sock.user.id;
        const groupId = update.id;

        // Comprueba si el bot fue añadido al grupo
        if (update.action === 'add' && update.participants.includes(botId)) {
            const groupMetadata = await sock.groupMetadata(groupId);
            const groupSubject = groupMetadata.subject;

            const welcomeMessage = `🎉 ¡Hola a todos en el grupo *${groupSubject}*!
            
Un bot de moderación ha sido añadido para mantener el orden y la seguridad.
Soy un bot de grupo, así que todos los comandos funcionan aquí.
Escribe */menu* para ver la lista de comandos disponibles.
¡Bienvenidos a usarlo!`;

            sock.sendMessage(groupId, { text: welcomeMessage });
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const senderId = m.key.participant || m.key.remoteJid;
        const groupId = m.key.remoteJid;
        const isGroup = groupId.endsWith('@g.us');
        if (!isGroup) return;

        const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
        const botId = sock.user.id;
        const senderNumber = senderId.split('@')[0];
        const isOwner = ownerNumbers.includes(senderNumber);

        // Obtener metadatos del grupo
        const groupMetadata = await sock.groupMetadata(groupId);
        const groupMembers = groupMetadata.participants;
        const isAdmin = groupMembers.some(member => member.id === senderId && member.admin);

        // --- Lógica del AntiLink (NO EXPULSA A ADMINS) ---
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        if (antiLink[groupId] && body && urlRegex.test(body) && !isAdmin) {
            await sock.sendMessage(groupId, { delete: m.key });
            await sock.groupParticipantsUpdate(groupId, [senderId], "remove");
            return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ ¡Enlace detectado! El AntiLink está activo y no se permite ninguna URL.` });
        }

        if (body.startsWith('/')) {
            const [command, ...args] = body.slice(1).split(' ');
            const mentionedJid = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

            // Verificación de permisos
            if (!isOwner && !isAdmin) {
                if (command !== 'menu' && command !== 'config') {
                    return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ No tienes permiso para usar este comando.` });
                }
            }

            switch (command) {
                case 'menu':
                    if (isOwner) {
                        sock.sendMessage(groupId, { text: `${createTimestamp()}\n\n${ownerMenu}` });
                    } else if (isAdmin) {
                        sock.sendMessage(groupId, { text: `${createTimestamp()}\n\n${adminMenu}` });
                    } else {
                        sock.sendMessage(groupId, { text: `${createTimestamp()}\n\n${memberMenu}` });
                    }
                    break;
                case 'antilink':
                    if (!isAdmin) return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ Solo un administrador puede usar este comando.` });
                    antiLink[groupId] = args[0] === 'on';
                    sock.sendMessage(groupId, { text: `${createTimestamp()} ${antiLink[groupId] ? '✅ AntiLink activado.' : '❌ AntiLink desactivado.'}` });
                    break;
                case 'kick':
                    if (!isAdmin) return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ Solo un administrador puede usar este comando.` });
                    if (!mentionedJid) return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ Debes mencionar a un usuario.` });
                    await sock.groupParticipantsUpdate(groupId, [mentionedJid], "remove");
                    sock.sendMessage(groupId, { text: `${createTimestamp()} ✅ Usuario con ${mentionedJid.split('@')[0]} expulsado.` });
                    break;
                case 'warn':
                    if (!isAdmin) return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ Solo un administrador puede usar este comando.` });
                    if (!mentionedJid) return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ Debes mencionar a un usuario.` });
                    if (!warnings[mentionedJid]) warnings[mentionedJid] = 0;
                    warnings[mentionedJid]++;
                    if (warnings[mentionedJid] >= warnLimit) {
                        await sock.groupParticipantsUpdate(groupId, [mentionedJid], "remove");
                        delete warnings[mentionedJid];
                        sock.sendMessage(groupId, { text: `${createTimestamp()} ⚠️ ¡Límite de advertencias alcanzado! Usuario con ${mentionedJid.split('@')[0]} expulsado.` });
                    } else {
                        sock.sendMessage(groupId, { text: `${createTimestamp()} ⚠️ Advertencia ${warnings[mentionedJid]}/${warnLimit}.` });
                    }
                    break;
                case 'warns':
                    if (!isAdmin) return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ Solo un administrador puede usar este comando.` });
                    if (!mentionedJid) return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ Debes mencionar a un usuario.` });
                    const userWarnings = warnings[mentionedJid] || 0;
                    sock.sendMessage(groupId, { text: `${createTimestamp()} El usuario con ${mentionedJid.split('@')[0]} tiene ${userWarnings} advertencia(s).` });
                    break;
                case 'kickall':
                    if (!isOwner) return sock.sendMessage(groupId, { text: `${createTimestamp()} ❌ Este comando es solo para el Owner.` });
                    if (args[0] !== 'confirm') return sock.sendMessage(groupId, { text: `${createTimestamp()} ⚠️ Usa: /kickall confirm` });

                    const membersToKick = groupMembers.filter(member => member.id !== senderId && member.id !== botId);
                    for (const member of membersToKick) {
                        await sock.groupParticipantsUpdate(groupId, [member.id], "remove");
                        await delay(500); // Pequeña pausa para evitar errores
                    }
                    sock.sendMessage(groupId, { text: `${createTimestamp()} ✅ ¡Todos los miembros han sido expulsados!` });
                    break;
                case '.ticket':
                    const ticketMessage = `📢 *TICKET DE SOPORTE*
                    
*Usuario:* ${senderId}
*Grupo:* ${groupMetadata.subject}
*Mensaje:* El usuario necesita ayuda.`;

                    for (const owner of ownerNumbers) {
                        sock.sendMessage(`${owner}@s.whatsapp.net`, { text: ticketMessage });
                    }
                    sock.sendMessage(groupId, { text: `${createTimestamp()} ✅ Tu ticket ha sido enviado al Owner del bot.` });
                    break;
            }
        }
    });
}

startBot();