// index.js

const { jidDecode } = require('@whiskeysockets/baileys');
const readline = require("readline");
const fs = require('fs');
const cron = require('node-cron');
const os = require('os');

// Importa módulos
const config = require('./config');
const { log, logError, appendLogFile } = require('./utils/logger');
const { handleCreatorCommands } = require('./commands/creator');
const { handleGeneralCommands, sendMenu } = require('./commands/general');
const { connectToWhatsApp } = require('./sesion'); // Importa el nuevo módulo de sesión

const tickets = {};
let ticketCounter = 0;
let currentMode = 'menu';
let activeJid = null;

// Variables de estado del bot (ahora desde config.js)
let {
    CREATOR_JID,
    GROUP_COMMANDS_ENABLED,
    IS_ANTI_LINK_ENABLED,
    IS_WORD_FILTER_ENABLED,
    OFFENSIVE_WORDS,
    BOT_VERSION,
    BOT_MODE,
    GROUP_WELCOME_MESSAGE
} = config;

// Asegura que la carpeta de logs exista
if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs');
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function startBot() {
    console.log(`
███████╗███████╗██████╗ ███████╗██████╗ ███████╗
██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔════╝
███████╗█████╗  ██████╔╝█████╗  ██████╔╝███████╗
╚════██║██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗╚════██║
███████║███████╗██║  ██║███████╗██║  ██║███████║
╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝                                                                   
    `);

    const sock = await connectToWhatsApp();

    // 🔹 Detección de nuevos miembros en grupos
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (action === 'add') {
            const addedUser = participants[0];
            const pushName = (await sock.getName(addedUser)) || addedUser.split('@')[0];
            try {
                await sock.sendMessage(id, { text: GROUP_WELCOME_MESSAGE(pushName) });
                log(`Mensaje de bienvenida enviado a ${pushName} en el grupo ${id}.`);
            } catch (e) {
                logError(`Error al enviar mensaje de bienvenida: ${e.message}`);
            }
        }
    });

    // 🔹 Programar mensaje diario
    cron.schedule('0 8 * * *', async () => {
        const groupJid = 'TU_JID_DE_GRUPO@g.us'; // ❗ CAMBIA ESTE JID POR EL DEL GRUPO
        const message = '¡Buenos días! Este es un recordatorio diario. ¡Que tengas un gran día!'; // ❗ CAMBIA ESTE MENSAJE
        try {
            await sock.sendMessage(groupJid, { text: message });
            log(`Mensaje diario enviado a [${groupJid}]`);
        } catch (e) {
            logError(`Error al enviar mensaje programado: ${e.message}`);
        }
    });

    // 🔹 Sistema de logs y manejo de tickets
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "notify") {
            const m = messages[0];

            if (!m.key.fromMe) {
                const senderJid = m.key.remoteJid;
                const isGroup = senderJid.endsWith('@g.us');
                const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
                const senderParticipant = m.key.participant || m.key.remoteJid;
                const senderName = m.pushName || senderParticipant.split('@')[0];

                // 🔴 Filtro de Palabras
                if (IS_WORD_FILTER_ENABLED) {
                    for (const word of OFFENSIVE_WORDS) {
                        if (messageText.toLowerCase().includes(word.toLowerCase())) {
                            await sock.sendMessage(senderJid, { text: `⚠️ Por favor, mantén un lenguaje respetuoso. El uso de palabras ofensivas no está permitido.` });
                            log(`😠 Alerta: Palabra ofensiva detectada de ${senderName} en [${senderJid}]`);
                            return;
                        }
                    }
                }

                // 🔴 Sistema Anti-Link
                if (IS_ANTI_LINK_ENABLED && isGroup && messageText.match(/(https?:\/\/[^\s]+)/gi)) {
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
                const creatorCommandResult = await handleCreatorCommands(sock, m, messageText);
                if (creatorCommandResult) {
                    if (creatorCommandResult.type === 'config') {
                        if (creatorCommandResult.key === 'groupCommandsEnabled') GROUP_COMMANDS_ENABLED = creatorCommandResult.value;
                        if (creatorCommandResult.key === 'isWordFilterEnabled') IS_WORD_FILTER_ENABLED = creatorCommandResult.value;
                        if (creatorCommandResult.key === 'isAntiLinkEnabled') IS_ANTI_LINK_ENABLED = creatorCommandResult.value;
                        if (creatorCommandResult.key === 'botMode') BOT_MODE = creatorCommandResult.value;
                        await sock.sendMessage(senderJid, { text: creatorCommandResult.response });
                    }
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

                // Creación y manejo de tickets
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
        // Lógica de la consola para los diferentes modos
        // ... (el resto del código de la consola se mantiene igual, no necesita cambios aquí) ...
    });
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
