// index.js

const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const readline = require("readline")
const pino = require('pino')
const fs = require('fs')
const cron = require('node-cron')
const qrcode = require('qrcode-terminal')
const os = require('os')

// Importa módulos
const config = require('./config')
const { log, logError, appendLogFile } = require('./utils/logger')
const { handleCreatorCommands } = require('./commands/creator')
const { handleGeneralCommands, sendMenu } = require('./commands/general')

const tickets = {}
let ticketCounter = 0
let currentMode = 'menu'
let activeJid = null

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
} = config

// Asegura que la carpeta de logs exista
if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs')
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

async function startBot() {
    console.log(`
███████╗███████╗██████╗ ███████╗██████╗ ███████╗
██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔════╝
███████╗█████╗  ██████╔╝█████╗  ██████╔╝███████╗
╚════██║██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗╚════██║
███████║███████╗██║  ██║███████╗██║  ██║███████║
╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝                                                                   
    `)

    const sessionPath = './session'
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.macOS("Desktop"),
        logger: pino({ level: 'silent' })
    })

    sock.ev.on('creds.update', saveCreds)
    
    // 🔹 Manejo de conexión y QR
    sock.ev.on("connection.update", async ({ connection, qr }) => {
        if (qr) {
            log("📌 Escanea este QR con tu WhatsApp:")
            qrcode.generate(qr, { small: true })
        }
        if (connection === "open") {
            log("✅ Bot conectado a WhatsApp")
            showMenu()
        } else if (connection === "close") {
            log("⚠️ Conexión cerrada. Reconectando...")
            startBot()
        }
    })

    // 🔹 Detección de nuevos miembros en grupos
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (action === 'add') {
            const addedUser = participants[0]
            const pushName = (await sock.getName(addedUser)) || addedUser.split('@')[0]
            try {
                await sock.sendMessage(id, { text: GROUP_WELCOME_MESSAGE(pushName) })
                log(`Mensaje de bienvenida enviado a ${pushName} en el grupo ${id}.`)
            } catch (e) {
                logError(`Error al enviar mensaje de bienvenida: ${e.message}`)
            }
        }
    })

    // 🔹 Programar mensaje diario
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
            const m = messages[0]
            
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
                const senderJid = m.key.remoteJid
                const isGroup = senderJid.endsWith('@g.us')
                const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
                const senderParticipant = m.key.participant || m.key.remoteJid
                const senderName = m.pushName || senderParticipant.split('@')[0]

                // 🔴 Filtro de Palabras
                if (IS_WORD_FILTER_ENABLED) {
                    for (const word of OFFENSIVE_WORDS) {
                        if (messageText.toLowerCase().includes(word.toLowerCase())) {
                            await sock.sendMessage(senderJid, { text: `⚠️ Por favor, mantén un lenguaje respetuoso. El uso de palabras ofensivas no está permitido.` })
                            log(`😠 Alerta: Palabra ofensiva detectada de ${senderName} en [${senderJid}]`)
                            return
                        }
                    }
                }

                // 🔴 Sistema Anti-Link
                if (IS_ANTI_LINK_ENABLED && isGroup && messageText.match(/(https?:\/\/[^\s]+)/gi)) {
                    try {
                        const groupMetadata = await sock.groupMetadata(senderJid)
                        const senderIsAdmin = groupMetadata.participants.find(p => p.id === senderParticipant)?.admin !== null

                        if (!senderIsAdmin) {
                            await sock.sendMessage(senderJid, { delete: m.key })
                            await sock.groupParticipantsUpdate(senderJid, [senderParticipant], 'remove')
                            log(`🚫 Anti-Link: Mensaje con enlace de ${senderName} eliminado en [${senderJid}]. Usuario expulsado.`)
                        } else {
                            log(`ℹ️ Anti-Link: Enlace ignorado, el remitente es un administrador.`)
                        }
                    } catch (e) {
                        logError(`Error en Anti-Link: ${e.message}`)
                    }
                    return
                }

                // Manejar comandos del creador
                const creatorCommandResult = await handleCreatorCommands(sock, m, messageText);
                if (creatorCommandResult) {
                    if (creatorCommandResult.type === 'config') {
                        // Actualiza el estado del bot con la respuesta del comando
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

                // Creación y manejo de tickets
                if (!tickets[senderJid] && !isGroup) {
                    ticketCounter = (ticketCounter % 900) + 1
                    tickets[senderJid] = { id: ticketCounter, status: 'open', name: senderName }
                    log(`🎟️ Nuevo Ticket Creado: ID ${tickets[senderJid].id} (de ${senderName})`)
                    const logFile = `./logs/ticket_${tickets[senderJid].id}.txt`
                    appendLogFile(logFile, `--- Ticket abierto con ${senderName} (${senderJid}) ---`)
                }

                if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                    log(`[➡️ ${senderName}: ${messageText}]`)
                    const logFile = `./logs/ticket_${tickets[senderJid].id}.txt`
                    appendLogFile(logFile, `[${new Date().toLocaleString()}] Usuario: ${messageText}`)
                }
            }
        }
    })
    
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
`)
}

startBot()
