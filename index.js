const { makeWASocket, useMultiFileAuthState, DisconnectReason, jidNormalizedUser, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys')
const readline = require("readline")
const pino = require('pino')
const fs = require('fs')
const cron = require('node-cron')
const qrcode = require('qrcode-terminal')
const os = require('os')

// === Configuración del Bot (Variables Globales) ===
// ❗ DEBES REEMPLAZAR ESTE JID CON EL NÚMERO DEL CREADOR
const CREATOR_JID = '595984495031@s.whatsapp.net' 

let groupCommandsEnabled = true
let isAntiLinkEnabled = true
let isWordFilterEnabled = true
const botVersion = '1.2.0'
let botMode = 'activo'
const OFFENSIVE_WORDS = ['puta', 'mierda', 'gilipollas', 'cabrón', 'estúpido', 'pendejo', 'imbécil', 'idiota', 'culiao', 'conchetumare']
const GROUP_WELCOME_MESSAGE = (name) => {
    const now = new Date()
    const weekday = now.toLocaleString('es-ES', { weekday: 'long' })
    const date = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    return `
👋 ¡Bienvenido/a, ${name}!
Me uno al grupo el ${weekday}, ${date} a las ${time}.
Por favor, lee las reglas y si tienes alguna duda, usa ~menu para ver mis comandos.`
}

// === Variables y Funciones para el Manejo de Tickets, Consola y Mensajes de Bienvenida ===
const SENT_FILE = './sentUsers.json';
let sentUsers = [];
const tickets = {}
let ticketCounter = 0
let currentMode = 'menu'
let activeJid = null

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

// Asegura que las carpetas existan
if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs')
}
if (!fs.existsSync('./session')) {
    fs.mkdirSync('./session')
}

// === Funciones de utilidad y persistencia ===

/**
 * Carga los registros de usuarios desde el archivo de persistencia.
 */
function loadSentRecords() {
    try {
        if (fs.existsSync(SENT_FILE)) {
            sentUsers = JSON.parse(fs.readFileSync(SENT_FILE, 'utf-8'));
            console.log(`✅ Registros cargados: ${sentUsers.length} usuarios ya contactados.`);
        } else {
            console.log('⚠️ No se encontraron registros previos. Se creará un nuevo archivo.');
        }
    } catch (err) {
        console.error(`❌ Error al leer el archivo de registros: ${err.message}`);
    }
}

/**
 * Guarda los registros de usuarios en el archivo de persistencia.
 */
function saveSentRecords() {
    try {
        fs.writeFileSync(SENT_FILE, JSON.stringify(sentUsers, null, 2));
    } catch (err) {
        console.error(`❌ Error al guardar los registros: ${err.message}`);
    }
}

const log = (message) => {
    console.log(`> ✅ Log: ${message}`);
};

const logError = (message) => {
    console.error(`> ❌ Error: ${message}`);
};

const appendLogFile = (filePath, content) => {
    try {
        fs.appendFileSync(filePath, content + '\n');
    } catch (e) {
        logError(`Error al escribir en el archivo de log: ${e.message}`);
    }
};

/**
 * Obtiene la fecha y hora actual en formato local.
 * @returns {string} Fecha y hora formateada.
 */
function getDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString('es-ES');
    const time = now.toLocaleTimeString('es-ES');
    return `${date} ${time}`;
}

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
            const statusMessage = `*🤖 Estado del Bot:*\n\n✅ En línea\n⏰ Tiempo en línea: ${uptimeDays}d, ${uptimeHours}h, ${uptimeMinutes}m, ${uptimeSeconds}s\n🧠 Memoria Libre: ${freeMem} MB / ${totalMem} MB\n\nVersión: ${botVersion}\nModo actual: ${botMode.charAt(0).toUpperCase() + botMode.slice(1)}`;
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
        default:
            break;
    }
};

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
            groupCommandsEnabled = true;
            await sock.sendMessage(senderJid, { text: '✅ Comandos de grupo activados.' });
            return true;
        case command === '.off':
            groupCommandsEnabled = false;
            await sock.sendMessage(senderJid, { text: '❌ Comandos de grupo desactivados.' });
            return true;
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
                botMode = mode;
                await sock.sendMessage(senderJid, { text: `✅ Modo del bot cambiado a: *${mode.charAt(0).toUpperCase() + mode.slice(1)}*.` });
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Modos disponibles: `activo`, `silencioso`, `fiesta`.' });
            }
            return true;
        case command.startsWith('.filtro-palabras '):
            const filterStatus = command.split(' ')[1];
            if (filterStatus === 'on') {
                isWordFilterEnabled = true;
                await sock.sendMessage(senderJid, { text: '✅ Filtro de palabras activado.' });
            } else if (filterStatus === 'off') {
                isWordFilterEnabled = false;
                await sock.sendMessage(senderJid, { text: '❌ Filtro de palabras desactivado.' });
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Formato: `.filtro-palabras [on/off]`' });
            }
            return true;
        case command.startsWith('.bloquear-links '):
            const linkStatus = command.split(' ')[1];
            if (linkStatus === 'on') {
                isAntiLinkEnabled = true;
                await sock.sendMessage(senderJid, { text: '✅ Bloqueo de enlaces activado.' });
            } else if (linkStatus === 'off') {
                isAntiLinkEnabled = false;
                await sock.sendMessage(senderJid, { text: '❌ Bloqueo de enlaces desactivado.' });
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Formato: `.bloquear-links [on/off]`' });
            }
            return true;
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

/**
 * Envia un mensaje de bienvenida a un usuario específico y lo registra con persistencia.
 */
async function sendWelcomeMessageWithPersistence(user, groupName) {
    const normalizedUser = jidNormalizedUser(user);
    if (!sentUsers.includes(normalizedUser)) {
        try {
            const { date, time } = getFormattedDateTime();
            const message = `
╔═══════════════════╗
║       🤖 SUBBOT       ║
╠═══════════════════╣
║ ¡Hola! Soy tu Subbot. ║
║ Puedes usar mis comandos: ║
║       .help           ║
╠═══════════════════╣
║ 👥 Grupo: ${groupName}
║ 📅 Fecha: ${date}
║ ⏰ Hora: ${time}
╚═══════════════════╝`;

            await sock.sendMessage(normalizedUser, { text: message });
            sentUsers.push(normalizedUser);
            saveSentRecords(); // Guarda el registro
            log(`✅ Mensaje de bienvenida enviado a ${normalizedUser} del grupo ${groupName}`);
        } catch (error) {
            logError(`❌ Error enviando mensaje a ${normalizedUser}: ${error.message}`);
        }
    } else {
        log(`✅ Usuario ${normalizedUser} ya contactado. Omitiendo.`);
    }
}

// === Lógica Principal del Bot ===
async function startBot() {
    console.log(`
███████╗███████╗██████╗ ███████╗██████╗ ███████╗
██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔════╝
███████╗█████╗  ██████╔╝█████╗  ██████╔╝███████╗
╚════██║██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗╚════██║
███████║███████╗██║  ██║███████╗██║  ██║███████║
╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝                                                                   
    `);
    
    loadSentRecords();

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

    sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
        if (qr) {
            log("📌 Escanea este QR con tu WhatsApp:");
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`Conexión cerrada. Razón: ${statusCode}`);
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('Reconectando...');
                startBot();
            } else {
                console.log('Sesión cerrada. Por favor, elimina la carpeta session e inicia de nuevo.');
            }
        } else if (connection === "open") {
            log("✅ Bot conectado a WhatsApp");
            showMenu()
        }
    });

    // 🔹 Detección de nuevos miembros en grupos
    sock.ev.on('group-participants.update', async (update) => {
        const groupId = update.id;
        if (update.action === 'add') {
            const groupMetadata = await sock.groupMetadata(groupId);
            const groupName = groupMetadata.subject;
            for (const participant of update.participants) {
                await sendWelcomeMessageWithPersistence(participant, groupName);
            }
        }
    });

    // 🔹 Mensaje diario programado
    cron.schedule('0 8 * * *', async () => {
        const groupJid = 'TU_JID_DE_GRUPO@g.us' // ❗ CAMBIA ESTE JID POR EL DEL GRUPO
        const message = '¡Buenos días! Este es un recordatorio diario. ¡Que tengas un gran día!' // ❗ CAMBIA ESTE MENSAJE
        try {
            await sock.sendMessage(groupJid, { text: message })
            log(`Mensaje diario enviado a [${groupJid}]`)
        } catch (e) {
            logError(`Error al enviar mensaje programado: ${e.message}`)
        }
    })

    // 🔹 Sistema de logs y manejo de tickets
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "notify") {
            const m = messages[0];
            
            // 🔴 Alerta de mensajes eliminados
            if (m.message?.protocolMessage?.type === 'REVOKE') {
                const deletedMsgKey = m.message.protocolMessage.key
                const senderJid = deletedMsgKey.remoteJid
                const participantJid = deletedMsgKey.participant || senderJid
                const senderName = m.pushName || participantJid.split('@')[0]
                log(`🗑️ ALERTA: Mensaje eliminado por ${senderName} en [${senderJid}].`)
                return
            }

            if (!m.key.fromMe) {
                const senderJid = m.key.remoteJid;
                const isGroup = senderJid.endsWith('@g.us');
                const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
                const senderParticipant = m.key.participant || m.key.remoteJid;
                const senderName = m.pushName || senderParticipant.split('@')[0];

                // 🔴 Filtro de Palabras
                if (isWordFilterEnabled) {
                    for (const word of OFFENSIVE_WORDS) {
                        if (messageText.toLowerCase().includes(word.toLowerCase())) {
                            await sock.sendMessage(senderJid, { text: `⚠️ Por favor, mantén un lenguaje respetuoso. El uso de palabras ofensivas no está permitido.` });
                            log(`😠 Alerta: Palabra ofensiva detectada de ${senderName} en [${senderJid}]`);
                            return;
                        }
                    }
                }

                // 🔴 Sistema Anti-Link
                if (isAntiLinkEnabled && isGroup && messageText.match(/(https?:\/\/[^\s]+)/gi)) {
                    try {
                        const groupMetadata = await sock.groupMetadata(senderJid);
                        const senderIsAdmin = groupMetadata.participants.find(p => p.id === senderParticipant)?.admin !== null;

                        if (!senderIsAdmin) {
                            await sock.sendMessage(senderJid, { delete: m.key });
                            await sock.groupParticipantsUpdate(senderJid, [senderParticipant], 'remove');
                            log(`🚫 Anti-Link: Mensaje con enlace de ${senderName} eliminado en [${senderJid}]. Usuario expulsado.`);
                        } else {
                            log(`ℹ️ Anti-Link: Enlace ignorado, el remitente es un administrador.`);
                        }
                    } catch (e) {
                        logError(`Error en Anti-Link: ${e.message}`);
                    }
                    return;
                }

                // Manejar comandos del creador
                const isCreatorCommand = await handleCreatorCommands(sock, m, messageText);
                if (isCreatorCommand) {
                    return;
                }

                // Manejar comandos generales
                await handleGeneralCommands(sock, m, messageText);

                // Lógica de tickets
                if (messageText.toLowerCase().trim() === '!abrir' && !isGroup) {
                    if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                        await sock.sendMessage(senderJid, { text: "Este ticket ya está abierto." });
                    } else {
                        ticketCounter = (ticketCounter % 900) + 1;
                        tickets[senderJid] = { id: ticketCounter, status: 'open', name: senderName };
                        await sock.sendMessage(senderJid, { text: `Ticket abierto. ID: ${tickets[senderJid].id}` });
                        log(`🎟️ Ticket: Se abrió un ticket para [${senderJid}]`);
                    }
                } else if (messageText.toLowerCase().trim() === '!cerrar' && !isGroup) {
                    if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                        tickets[senderJid].status = 'closed';
                        await sock.sendMessage(senderJid, { text: `El ticket ha sido cerrado. ¡Gracias!` });
                        log(`🎟️ Ticket: Se cerró el ticket para [${senderJid}]`);
                    } else {
                        await sock.sendMessage(senderJid, { text: "No hay un ticket abierto para cerrar." });
                    }
                } else if (messageText.toLowerCase().trim() === '!tickets' && senderJid === CREATOR_JID) {
                    const openTickets = Object.values(tickets).filter(t => t.status === 'open');
                    let userTicketMessage = '📋 *Tickets Abiertos:*\n\n';
                    if (openTickets.length > 0) {
                        openTickets.forEach(t => {
                            userTicketMessage += `ID: ${t.id} - Contacto: ${t.name || 'Desconocido'}\n`;
                        });
                        userTicketMessage += '\nPara contactar un ticket, envía el ID con un guion bajo (ej: _123).';
                    } else {
                        userTicketMessage += 'No tienes tickets abiertos actualmente.';
                    }
                    await sock.sendMessage(senderJid, { text: userTicketMessage });
                }

                if (!tickets[senderJid] && !isGroup && !messageText.startsWith('!')) {
                    ticketCounter = (ticketCounter % 900) + 1;
                    tickets[senderJid] = { id: ticketCounter, status: 'open', name: senderName };
                    log(`🎟️ Nuevo Ticket Creado: ID ${tickets[senderJid].id} (de ${senderName})`);
                    const logFile = `./logs/ticket_${tickets[senderJid].id}.txt`;
                    appendLogFile(logFile, `--- Ticket abierto con ${senderName} (${senderJid}) ---`);
                }

                if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                    log(`[➡️ ${senderName}: ${messageText}]`);
                    const logFile = `./logs/ticket_${tickets[senderJid].id}.txt`;
                    appendLogFile(logFile, `[${new Date().toLocaleString()}] Usuario: ${messageText}`);
                }
            }
        }
    });
    
    // Función para manejar la consola
    rl.on('line', async (input) => {
        if (currentMode === 'menu') {
            const command = input.trim()
            if (command === '1') {
                currentMode = 'privado'
                log(`\n📱 Modo: Privado`)
                log(`Ingrese el número de teléfono (ej: 595XXXXXXXX)`)
            } else if (command === '2') {
                currentMode = 'ticket'
                log(`\n🎟️ Opción Tickets`)
                const openTickets = Object.keys(tickets).filter(jid => tickets[jid].status === 'open')
                if (openTickets.length > 0) {
                    log(`Tickets abiertos (${openTickets.length}):`)
                    openTickets.forEach((jid, index) => {
                        log(`${index + 1} - Ticket ${tickets[jid].id} | Contacto: ${tickets[jid].name}`)
                    })
                    log("\nIngrese el número del ticket para interactuar.")
                    log("Use .1 para volver al menú principal.")
                } else {
                    log("No hay tickets abiertos.")
                    showMenu()
                }
            } else if (command === '3') {
                currentMode = 'grupo'
                log(`\n👥 Modo: Grupo`)
                log(`Obteniendo lista de grupos...`)
                const groups = await sock.groupFetchAllParticipating()
                for (const jid in groups) {
                    log(`Grupo: ${groups[jid].subject} | ID: ${jid}`)
                }
                log(`\nUse .1 para volver al menú principal.`)
            } else if (command === '4') {
                currentMode = 'abrir-ticket'
                log(`\n➕ Abrir Ticket`)
                log(`Ingrese el número de la persona (ej: 595XXXXXXXX)`)
            } else {
                log("Comando no reconocido. Opciones: 1, 2, 3 o 4")
            }
        } else {
            if (input === '.1') {
                currentMode = 'menu'
                activeJid = null
                showMenu()
            } else if (input === '.2') {
                if (currentMode === 'ticket' && activeJid && tickets[activeJid] && tickets[activeJid].status === 'open') {
                    tickets[activeJid].status = 'closed'
                    log(`🎟️ Ticket ${tickets[activeJid].id} cerrado.`)
                    const logFile = `./logs/ticket_${tickets[activeJid].id}.txt`
                    appendLogFile(logFile, `--- Ticket cerrado ---`)
                    activeJid = null
                } else {
                    log("No hay un ticket abierto para cerrar.")
                }
            } else {
                let jidToSend = null
                if (currentMode === 'abrir-ticket') {
                    const number = input.replace(/\D/g, '')
                    const jid = `${number}@s.whatsapp.net`
                    ticketCounter = (ticketCounter % 900) + 1
                    const name = (await sock.getName(jid)) || `Usuario ${number}`
                    tickets[jid] = { id: ticketCounter, status: 'open', name: name }
                    log(`\n🎟️ Nuevo Ticket Abierto con ${name} (${number}).`)
                    log(`\n💬 Mensaje para ${name}:`)
                    const logFile = `./logs/ticket_${tickets[jid].id}.txt`
                    appendLogFile(logFile, `--- Ticket abierto con ${name} (${jid}) ---`)
                    rl.question("", async (msg) => {
                        try {
                            await sock.sendMessage(jid, { text: msg })
                            log(`Mensaje enviado a [${jid}]`)
                            appendLogFile(logFile, `[${new Date().toLocaleString()}] Creador: ${msg}`)
                        } catch (e) {
                            logError("Error al enviar mensaje:", e.message)
                        }
                        currentMode = 'menu'
                        showMenu()
                    })
                    return
                }
                
                if (currentMode === 'privado') {
                    jidToSend = `${input}@s.whatsapp.net`
                    log(`📱 Consola: JID autocompletado a: ${jidToSend}`)
                    log(`\n💬 Mensaje para ${jidToSend}:`)
                    rl.question("", async (msg) => {
                        try {
                            await sock.sendMessage(jidToSend, { text: msg })
                            log(`Mensaje enviado a [${jidToSend}]`)
                        } catch (e) {
                            logError("Error al enviar mensaje:", e.message)
                        }
                        currentMode = 'menu'
                        showMenu()
                    })
                    return
                } else if (currentMode === 'ticket') {
                    const ticketIndex = parseInt(input) - 1
                    const openTickets = Object.keys(tickets).filter(jid => tickets[jid].status === 'open')
                    if (ticketIndex >= 0 && ticketIndex < openTickets.length) {
                        activeJid = openTickets[ticketIndex]
                        log(`\n💬 Mensaje para Ticket ${tickets[activeJid].id}:`)
                        rl.question("", async (msg) => {
                            if (msg === '.1') {
                                currentMode = 'menu'
                                activeJid = null
                                showMenu()
                                return
                            }
                            try {
                                await sock.sendMessage(activeJid, { text: msg })
                                log(`Mensaje enviado al ticket ${tickets[activeJid].id}`)
                                const logFile = `./logs/ticket_${tickets[activeJid].id}.txt`
                                appendLogFile(logFile, `[${new Date().toLocaleString()}] Creador: ${msg}`)
                            } catch (e) {
                                logError("Error al enviar mensaje:", e.message)
                            }
                            showMenu()
                        })
                        return
                    } else {
                        log("Número de ticket inválido.")
                        showMenu()
                    }
                } else if (currentMode === 'grupo') {
                    jidToSend = input
                    log(`\n💬 Mensaje para Grupo ${jidToSend}:`)
                    rl.question("", async (msg) => {
                        try {
                            await sock.sendMessage(jidToSend, { text: msg })
                            log(`Mensaje enviado al grupo [${jidToSend}]`)
                        } catch (e) {
                            logError("Error al enviar mensaje:", e.message)
                        }
                        currentMode = 'menu'
                        showMenu()
                    })
                    return
                }

                if (jidToSend) {
                    try {
                        await sock.sendMessage(jidToSend, { text: input })
                        log(`Mensaje enviado a [${jidToSend}]`)
                    } catch (e) {
                        logError("Error al enviar mensaje:", e.message)
                    }
                }
            }
        }
    })
}

function showMenu() {
    console.log(`
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
`);
}

startBot();