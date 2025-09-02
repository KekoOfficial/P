const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion, jidDecode } = require('@whiskeysockets/baileys')
const readline = require("readline")
const pino = require('pino')
const fs = require('fs')
const cron = require('node-cron')
const os = require('os')

const tickets = {}
let ticketCounter = 0
let currentMode = 'menu'
let activeJid = null
let groupCommandsEnabled = true
let isAntiLinkEnabled = true
let isWordFilterEnabled = true
const botVersion = '1.2.0'
let botMode = 'activo'
const startTime = new Date()

// ❗ DEBES REEMPLAZAR ESTE JID CON EL NÚMERO DEL CREADOR (con @s.whatsapp.net)
const CREATOR_JID = '595984495031@s.whatsapp.net' 

// Lista de palabras ofensivas (puedes editarla a tu gusto)
const OFFENSIVE_WORDS = ['puta', 'mierda', 'gilipollas', 'cabrón', 'estúpido', 'pendejo', 'imbécil', 'idiota', 'culiao', 'conchetumare']

// Mensaje de bienvenida por grupo con fecha y hora
const GROUP_WELCOME_MESSAGE = (name) => {
    const now = new Date()
    const weekday = now.toLocaleString('es-ES', { weekday: 'long' })
    const date = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

    return `
👋 ¡Bienvenido/a, ${name}!

Me uno al grupo el ${weekday}, ${date} a las ${time}.

Por favor, lee las reglas y si tienes alguna duda, usa ~menu para ver mis comandos.
`
}

// Asegura que la carpeta de logs exista
if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs')
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

async function startBot() {
    // Logo de inicio
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
            console.log("📌 Escanea este QR con tu WhatsApp:")
            qrcode.generate(qr, { small: true })
        }
        if (connection === "open") {
            console.log("✅ Bot conectado a WhatsApp")
            showMenu()
        } else if (connection === "close") {
            console.log("⚠️ Conexión cerrada. Reconectando...")
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
                console.log(`> 👋 Mensaje de bienvenida enviado a ${pushName} en el grupo ${id}.`)
            } catch (e) {
                console.log(`❌ Error al enviar mensaje de bienvenida: ${e.message}`)
            }
        }
    })

    // 🔹 Programar mensaje diario
    // SINTAXIA: cron.schedule('minuto hora * * *', () => { ... });
    // Aquí se enviará un mensaje todos los días a las 8:00 AM.
    // Para cambiar la hora, edita el '0 8 * * *'
    cron.schedule('0 8 * * *', async () => {
        const groupJid = 'TU_JID_DE_GRUPO@g.us' // ❗ CAMBIA ESTE JID POR EL DEL GRUPO
        const message = '¡Buenos días! Este es un recordatorio diario. ¡Que tengas un gran día!' // ❗ CAMBIA ESTE MENSAJE
        try {
            await sock.sendMessage(groupJid, { text: message })
            console.log(`> ✅ Mensaje diario enviado a [${groupJid}]`)
        } catch (e) {
            console.log(`❌ Error al enviar mensaje programado: ${e.message}`)
        }
    })

    // Función para mostrar el menú de comandos
    const sendMenu = async (jid) => {
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
    }

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
                console.log(`\n> 🗑️ ALERTA: Mensaje eliminado por ${senderName} en [${senderJid}].`)
                return
            }

            if (!m.key.fromMe) {
                const senderJid = m.key.remoteJid
                const isGroup = senderJid.endsWith('@g.us')
                const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
                const senderParticipant = m.key.participant || m.key.remoteJid
                const senderName = m.pushName || senderParticipant.split('@')[0]

                // 🔴 Sistema de Alerta de Palabras Ofensivas (solo si está activado)
                if (isWordFilterEnabled) {
                    for (const word of OFFENSIVE_WORDS) {
                        if (messageText.toLowerCase().includes(word.toLowerCase())) {
                            await sock.sendMessage(senderJid, { text: `⚠️ Por favor, mantén un lenguaje respetuoso. El uso de palabras ofensivas no está permitido.` })
                            console.log(`> 😠 Alerta: Palabra ofensiva detectada de ${senderName} en [${senderJid}]`)
                            return
                        }
                    }
                }

                // 🔴 Sistema Anti-Link (solo si está activado)
                if (isAntiLinkEnabled && isGroup && messageText.match(/(https?:\/\/[^\s]+)/gi)) {
                    try {
                        const groupMetadata = await sock.groupMetadata(senderJid)
                        const senderIsAdmin = groupMetadata.participants.find(p => p.id === senderParticipant)?.admin !== null

                        if (!senderIsAdmin) {
                            await sock.sendMessage(senderJid, { delete: m.key })
                            await sock.groupParticipantsUpdate(senderJid, [senderParticipant], 'remove')
                            console.log(`> 🚫 Anti-Link: Mensaje con enlace de ${senderName} eliminado en [${senderJid}]. Usuario expulsado.`)
                        } else {
                            console.log(`> ℹ️ Anti-Link: Enlace ignorado, el remitente es un administrador.`)
                        }
                    } catch (e) {
                        console.log(`❌ Error en Anti-Link: ${e.message}`)
                    }
                    return
                }

                // Manejo de comandos del Creador
                if (senderJid === CREATOR_JID) {
                    const command = messageText.toLowerCase().trim()
                    
                    if (command === '.on') {
                        groupCommandsEnabled = true
                        await sock.sendMessage(senderJid, { text: '✅ Comandos de grupo activados.' })
                        return
                    }
                    if (command === '.off') {
                        groupCommandsEnabled = false
                        await sock.sendMessage(senderJid, { text: '❌ Comandos de grupo desactivados.' })
                        return
                    }
                    
                    if (messageText.toLowerCase().startsWith('.e ')) {
                        const parts = messageText.split(' ')
                        const targetNumber = parts[1].replace(/\D/g, '')
                        const targetJid = `${targetNumber}@s.whatsapp.net`
                        const msgBody = parts.slice(2).join(' ')
                        
                        if (targetJid && msgBody) {
                            try {
                                await sock.sendMessage(targetJid, { text: msgBody })
                                console.log(`> ✅ Mensaje enviado a ${targetJid} desde el comando .e`)
                                await sock.sendMessage(senderJid, { text: `✅ Mensaje enviado a ${targetNumber}` })
                            } catch (e) {
                                console.log(`❌ Error al enviar mensaje con .e: ${e.message}`)
                                await sock.sendMessage(senderJid, { text: `❌ No se pudo enviar el mensaje a ${targetNumber}.` })
                            }
                        } else {
                            await sock.sendMessage(senderJid, { text: "Uso incorrecto del comando. Formato: .e número mensaje" })
                        }
                        return
                    }
                    
                    // NUEVO COMANDO PARA MOSTRAR TICKETS ABIERTOS
                    if (command === '!info') {
                        const openTickets = Object.values(tickets).filter(t => t.status === 'open')
                        let infoMessage = '📋 *Tickets Abiertos:*\n\n'
                        if (openTickets.length > 0) {
                            openTickets.forEach(t => {
                                infoMessage += `ID: ${t.id} - Contacto: ${t.name || 'Desconocido'}\n`
                            })
                        } else {
                            infoMessage += 'No hay tickets abiertos actualmente.'
                        }
                        await sock.sendMessage(senderJid, { text: infoMessage })
                        console.log(`> ✅ Comando !info ejecutado por el creador.`)
                        return
                    }

                    // NUEVO COMANDO PARA ENVIAR LOGS
                    if (messageText.toLowerCase().startsWith('!enviarlog ')) {
                        const parts = messageText.split(' ')
                        const ticketId = parts[1]
                        if (ticketId) {
                            const logFile = `./logs/ticket_${ticketId}.txt`
                            if (fs.existsSync(logFile)) {
                                const logContent = fs.readFileSync(logFile, 'utf8')
                                const logMessage = `📜 *Registro del Ticket ID ${ticketId}:*\n\n` + logContent
                                await sock.sendMessage(senderJid, { text: logMessage })
                                console.log(`> ✅ Registro del ticket ${ticketId} enviado al creador.`)
                            } else {
                                await sock.sendMessage(senderJid, { text: `❌ Error: No se encontró un registro para el ticket ID ${ticketId}.` })
                            }
                        } else {
                            await sock.sendMessage(senderJid, { text: `❌ Uso incorrecto. Formato: !enviarlog [id_del_ticket]` })
                        }
                        return
                    }

                    // 🆕 NUEVOS COMANDOS DE GESTIÓN AVANZADA
                    if (isGroup) {
                        const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
                        
                        if (messageText.toLowerCase().startsWith('.kick') && mentionedJid) {
                            await sock.groupParticipantsUpdate(senderJid, [mentionedJid], 'remove')
                            console.log(`> 👥 Comando: Miembro ${mentionedJid} expulsado por el creador.`)
                        } else if (messageText.toLowerCase().startsWith('.promover') && mentionedJid) {
                            await sock.groupParticipantsUpdate(senderJid, [mentionedJid], 'promote')
                            console.log(`> 👥 Comando: Miembro ${mentionedJid} promovido a admin por el creador.`)
                        } else if (messageText.toLowerCase().startsWith('.limpiar ')) {
                            const numMessages = parseInt(messageText.split(' ')[1], 10)
                            if (isNaN(numMessages) || numMessages <= 0) {
                                await sock.sendMessage(senderJid, { text: "Uso incorrecto. Formato: .limpiar [número de mensajes]" })
                                return
                            }
                            const messages = await sock.fetchMessages(senderJid, { count: numMessages })
                            const messageKeys = messages.map(msg => msg.key)
                            await sock.deleteMessages(senderJid, messageKeys)
                            await sock.sendMessage(senderJid, { text: `✅ Se eliminaron los últimos ${numMessages} mensajes.` })
                        } else if (messageText.toLowerCase().startsWith('.anuncio ')) {
                            const announcement = messageText.split(' ').slice(1).join(' ')
                            const groups = await sock.groupFetchAllParticipating()
                            for (const group of Object.values(groups)) {
                                await sock.sendMessage(group.id, { text: `📢 *ANUNCIO DEL CREADOR:*\n\n${announcement}` })
                            }
                            await sock.sendMessage(senderJid, { text: `✅ Anuncio enviado a ${Object.keys(groups).length} grupos.` })
                        }
                    }

                    if (messageText.toLowerCase().startsWith('.modo ')) {
                        const mode = messageText.toLowerCase().split(' ')[1]
                        if (['activo', 'silencioso', 'fiesta'].includes(mode)) {
                            botMode = mode
                            await sock.sendMessage(senderJid, { text: `✅ Modo del bot cambiado a: *${botMode.charAt(0).toUpperCase() + botMode.slice(1)}*.` })
                        } else {
                            await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Modos disponibles: `activo`, `silencioso`, `fiesta`.' })
                        }
                        return
                    }

                    if (messageText.toLowerCase().startsWith('.filtro-palabras ')) {
                        const status = messageText.toLowerCase().split(' ')[1]
                        if (status === 'on') {
                            isWordFilterEnabled = true
                            await sock.sendMessage(senderJid, { text: '✅ Filtro de palabras activado.' })
                        } else if (status === 'off') {
                            isWordFilterEnabled = false
                            await sock.sendMessage(senderJid, { text: '❌ Filtro de palabras desactivado.' })
                        } else {
                            await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Formato: `.filtro-palabras [on/off]`' })
                        }
                        return
                    }

                    if (messageText.toLowerCase().startsWith('.bloquear-links ')) {
                        const status = messageText.toLowerCase().split(' ')[1]
                        if (status === 'on') {
                            isAntiLinkEnabled = true
                            await sock.sendMessage(senderJid, { text: '✅ Bloqueo de enlaces activado.' })
                        } else if (status === 'off') {
                            isAntiLinkEnabled = false
                            await sock.sendMessage(senderJid, { text: '❌ Bloqueo de enlaces desactivado.' })
                        } else {
                            await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Formato: `.bloquear-links [on/off]`' })
                        }
                        return
                    }
                }

                // Manejo de comandos de grupo para el creador (solo si están activados)
                if (isGroup && senderJid === CREATOR_JID && groupCommandsEnabled) {
                    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
                    
                    if (messageText.toLowerCase().startsWith('!kick') && mentionedJid) {
                        await sock.groupParticipantsUpdate(senderJid, [mentionedJid], 'remove')
                        console.log(`> 👥 Comando: Miembro ${mentionedJid} expulsado por el creador.`)
                    } else if (messageText.toLowerCase().startsWith('!promover') && mentionedJid) {
                        await sock.groupParticipantsUpdate(senderJid, [mentionedJid], 'promote')
                        console.log(`> 👥 Comando: Miembro ${mentionedJid} promovido a admin por el creador.`)
                    } else if (messageText.toLowerCase() === '!lista') {
                        const groupMetadata = await sock.groupMetadata(senderJid)
                        let participantsList = '👥 *Lista de Miembros:*\n\n'
                        for (const p of groupMetadata.participants) {
                            const participantName = (await sock.getName(p.id)) || p.id.split('@')[0]
                            participantsList += `- ${participantName} (${p.id.split('@')[0]})\n`
                        }
                        await sock.sendMessage(senderJid, { text: participantsList })
                        console.log(`> 👥 Comando: Lista de miembros enviada al grupo.`)
                    }
                } else if (isGroup && senderJid === CREATOR_JID && !groupCommandsEnabled) {
                    if (messageText.toLowerCase().startsWith('!kick') || messageText.toLowerCase().startsWith('!promover')) {
                        await sock.sendMessage(senderJid, { text: 'Los comandos de grupo están desactivados. Usa `.On` para activarlos.' })
                    }
                }

                // Manejo de comandos generales (sin importar si es grupo o privado)
                if (messageText.toLowerCase().startsWith('!') || messageText.toLowerCase().startsWith('~') || messageText.toLowerCase().startsWith('.')) {
                    const command = messageText.toLowerCase().trim()
                    
                    switch (true) {
                        case command === '~menu' || command === '!ayuda' || command === '!help':
                            await sendMenu(senderJid)
                            break
                        case command === '!p':
                            const privateJid = m.key.participant || m.key.remoteJid
                            await sock.sendMessage(privateJid, { text: "Por favor, ingresa tu número de teléfono con código de país para generar el código de 8 dígitos." })
                            console.log(`> 🤖 Servidor: Comando !p recibido de [${privateJid}]`)
                            break
                        case command === '!abrir':
                            if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                                await sock.sendMessage(senderJid, { text: "Este ticket ya está abierto." })
                            } else {
                                ticketCounter = (ticketCounter % 900) + 1
                                tickets[senderJid] = { id: ticketCounter, status: 'open' }
                                await sock.sendMessage(senderJid, { text: `Ticket abierto. ID: ${tickets[senderJid].id}` })
                                console.log(`> 🎟️ Ticket: Se abrió un ticket para [${senderJid}]`)
                            }
                            break
                        case command === '!cerrar':
                            if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                                tickets[senderJid].status = 'closed'
                                await sock.sendMessage(senderJid, { text: `El ticket ha sido cerrado. ¡Gracias!` })
                                console.log(`> 🎟️ Ticket: Se cerró el ticket para [${senderJid}]`)
                            } else {
                                await sock.sendMessage(senderJid, { text: "No hay un ticket abierto para cerrar." })
                            }
                            break
                        // 🆕 NUEVO COMANDO PARA EL USUARIO
                        case command === '!tickets':
                            const userOpenTickets = Object.values(tickets).filter(t => t.status === 'open')
                            let userTicketMessage = '📋 *Mis tickets abiertos:*\n\n'
                            if (userOpenTickets.length > 0) {
                                userOpenTickets.forEach(t => {
                                    userTicketMessage += `ID: ${t.id} - Contacto: ${t.name || 'Desconocido'}\n`
                                })
                                userTicketMessage += '\nPara contactar un ticket, envía el ID con un guion bajo (ej: _123).'
                            } else {
                                userTicketMessage += 'No tienes tickets abiertos actualmente.'
                            }
                            await sock.sendMessage(senderJid, { text: userTicketMessage })
                            break
                        case command === '!estado' || command === '.estado':
                            const uptime = process.uptime()
                            const uptimeDays = Math.floor(uptime / (3600 * 24))
                            const uptimeHours = Math.floor((uptime % (3600 * 24)) / 3600)
                            const uptimeMinutes = Math.floor((uptime % 3600) / 60)
                            const uptimeSeconds = Math.floor(uptime % 60)
                            const freeMem = (os.freemem() / 1024 / 1024).toFixed(2)
                            const totalMem = (os.totalmem() / 1024 / 1024).toFixed(2)
                            const statusMessage = `*🤖 Estado del Bot:*\n\n✅ En línea\n⏰ Tiempo en línea: ${uptimeDays}d, ${uptimeHours}h, ${uptimeMinutes}m, ${uptimeSeconds}s\n🧠 Memoria Libre: ${freeMem} MB / ${totalMem} MB\n\nVersión: ${botVersion}\nModo actual: ${botMode.charAt(0).toUpperCase() + botMode.slice(1)}`
                            await sock.sendMessage(senderJid, { text: statusMessage })
                            break
                        case command === '!dado':
                            const roll = Math.floor(Math.random() * 6) + 1
                            await sock.sendMessage(senderJid, { text: `🎲 Has lanzado un dado y ha caído en: *${roll}*` })
                            break
                        case messageText.toLowerCase().startsWith('!8ball'):
                            const responses = [
                                "Sí, definitivamente.", "Es una certeza.", "Sin duda.", "Probablemente.",
                                "No estoy seguro, pregúntame de nuevo.", "Mejor no te digo ahora.",
                                "No cuentes con ello.", "Mi respuesta es no.", "Mis fuentes dicen que no."
                            ]
                            const randomResponse = responses[Math.floor(Math.random() * responses.length)]
                            await sock.sendMessage(senderJid, { text: `🎱 La bola mágica dice: *${randomResponse}*` })
                            break
                        case command === '!adivina':
                            const riddles = [
                                { question: "¿Qué tiene ciudad, pero no casa; monte, pero no árboles; y agua, pero no peces?", answer: "Un mapa." },
                                { question: "¿Qué es algo que, cuando lo tienes, no lo compartes; pero si lo compartes, no lo tienes?", answer: "Un secreto." },
                                { question: "¿Qué tiene muchas llaves pero no puede abrir ninguna puerta?", answer: "Un piano." }
                            ]
                            const randomRiddle = riddles[Math.floor(Math.random() * riddles.length)]
                            await sock.sendMessage(senderJid, { text: `🧠 *Adivinanza:*\n${randomRiddle.question}` })
                            break
                        case command === '~play':
                            try {
                                const audioBuffer = fs.readFileSync('./music.mp3');
                                await sock.sendMessage(senderJid, { audio: audioBuffer, mimetype: 'audio/mp4' });
                                console.log(`> 🎶 Comando: Audio de música enviado a [${senderJid}].`);
                            } catch (e) {
                                await sock.sendMessage(senderJid, { text: '❌ Error: No se encontró el archivo music.mp3. Asegúrate de que el archivo esté en la misma carpeta y tenga ese nombre.' });
                                console.log(`❌ Error al enviar audio: ${e.message}`);
                            }
                            break;
                    }
                }

                // 🆕 SELECCIÓN DE TICKET POR ID PARA EL USUARIO
                if (messageText.startsWith('_') && !isGroup) {
                    const ticketId = parseInt(messageText.substring(1).trim(), 10)
                    const ticketEntry = Object.entries(tickets).find(([jid, ticket]) => ticket.id === ticketId && ticket.status === 'open')
                    
                    if (ticketEntry) {
                        const [ticketJid, ticketData] = ticketEntry
                        const isTicketForThisUser = ticketJid === senderJid
                        
                        if (isTicketForThisUser) {
                             await sock.sendMessage(senderJid, { text: `Has seleccionado el ticket ID ${ticketId}. Ya puedes enviar tus mensajes.` })
                        } else {
                            await sock.sendMessage(senderJid, { text: "No puedes gestionar un ticket que no te pertenece." })
                        }
                    } else {
                        await sock.sendMessage(senderJid, { text: `No se encontró un ticket abierto con el ID ${ticketId}.` })
                    }
                    return
                }

                // Creación y manejo de tickets
                if (!tickets[senderJid] && !isGroup) {
                    ticketCounter = (ticketCounter % 900) + 1
                    tickets[senderJid] = { id: ticketCounter, status: 'open', name: senderName }
                    console.log(`\n\n🎟️ Nuevo Ticket Creado: ID ${tickets[senderJid].id} (de ${senderName})`)
                    const logFile = `./logs/ticket_${tickets[senderJid].id}.txt`
                    fs.appendFileSync(logFile, `--- Ticket abierto con ${senderName} (${senderJid}) ---\n`)
                }

                if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                    console.log(`[➡️ ${senderName}: ${messageText}]`)
                    // Guarda la conversación en un log
                    const logFile = `./logs/ticket_${tickets[senderJid].id}.txt`
                    fs.appendFileSync(logFile, `[${new Date().toLocaleString()}] Usuario: ${messageText}\n`)
                }
            }
        }
    })
    
    // Función para manejar la consola de forma interactiva
    rl.on('line', async (input) => {
        if (currentMode === 'menu') {
            const command = input.trim()
            if (command === '1') {
                currentMode = 'privado'
                console.log(`\n📱 Modo: Privado`)
                console.log(`Ingrese el número de teléfono (ej: 595XXXXXXXX)`)
            } else if (command === '2') {
                currentMode = 'ticket'
                console.log(`\n🎟️ Opción Tickets`)
                const openTickets = Object.keys(tickets).filter(jid => tickets[jid].status === 'open')
                if (openTickets.length > 0) {
                    console.log(`Tickets abiertos (${openTickets.length}):`)
                    openTickets.forEach((jid, index) => {
                        console.log(`${index + 1} - Ticket ${tickets[jid].id} | Contacto: ${tickets[jid].name}`)
                    })
                    console.log("\nIngrese el número del ticket para interactuar.")
                    console.log("Use .1 para volver al menú principal.")
                } else {
                    console.log("No hay tickets abiertos.")
                    showMenu()
                }
            } else if (command === '3') {
                currentMode = 'grupo'
                console.log(`\n👥 Modo: Grupo`)
                console.log(`Obteniendo lista de grupos...`)
                const groups = await sock.groupFetchAllParticipating()
                for (const jid in groups) {
                    console.log(`Grupo: ${groups[jid].subject} | ID: ${jid}`)
                }
                console.log(`\nUse .1 para volver al menú principal.`)
            } else if (command === '4') {
                currentMode = 'abrir-ticket'
                console.log(`\n➕ Abrir Ticket`)
                console.log(`Ingrese el número de la persona (ej: 595XXXXXXXX)`)
            } else if (command === '!p') {
                currentMode = 'pairing'
                console.log("\n💬 Ingrese su número de teléfono con código de país para generar el código de 8 dígitos.")
            } else {
                console.log("Comando no reconocido. Opciones: 1, 2, 3, 4 o !p")
            }
        } else {
            // Manejo de comandos de salida
            if (input === '.1') {
                currentMode = 'menu'
                activeJid = null
                showMenu()
            } else if (input === '.2') {
                if (currentMode === 'ticket' && activeJid && tickets[activeJid] && tickets[activeJid].status === 'open') {
                    tickets[activeJid].status = 'closed'
                    console.log(`🎟️ Ticket ${tickets[activeJid].id} cerrado.`)
                    const logFile = `./logs/ticket_${tickets[activeJid].id}.txt`
                    fs.appendFileSync(logFile, `--- Ticket cerrado ---\n`)
                    activeJid = null
                } else {
                    console.log("No hay un ticket abierto para cerrar.")
                }
            } else {
                // Envío de mensajes basado en el modo
                let jidToSend = null
                if (currentMode === 'pairing') {
                    const phoneNumber = input.replace(/\D/g, '')
                    try {
                        const pairingCode = await sock.usePairingCode(phoneNumber)
                        console.log(`\n🔗 Código de 8 dígitos: ${pairingCode}`)
                        console.log("Vaya a WhatsApp en su teléfono > Dispositivos vinculados > Vincular un dispositivo > Vincular con número de teléfono > Ingrese el código.")
                    } catch (e) {
                        console.log("❌ Error al generar el código de vinculación:", e.message)
                    }
                    currentMode = 'menu'
                    showMenu()
                    return
                } else if (currentMode === 'abrir-ticket') {
                    const number = input.replace(/\D/g, '')
                    const jid = `${number}@s.whatsapp.net`
                    
                    ticketCounter = (ticketCounter % 900) + 1
                    const name = (await sock.getName(jid)) || `Usuario ${number}`
                    tickets[jid] = { id: ticketCounter, status: 'open', name: name }
                    
                    console.log(`\n🎟️ Nuevo Ticket Abierto con ${name} (${number}).`)
                    console.log(`\n💬 Mensaje para ${name}:`)
                    
                    const logFile = `./logs/ticket_${tickets[jid].id}.txt`
                    fs.appendFileSync(logFile, `--- Ticket abierto con ${name} (${jid}) ---\n`)

                    rl.question("", async (msg) => {
                        try {
                            await sock.sendMessage(jid, { text: msg })
                            console.log(`> ✅ Mensaje enviado a [${jid}]`)
                            fs.appendFileSync(logFile, `[${new Date().toLocaleString()}] Creador: ${msg}\n`)
                        } catch (e) {
                            console.log("❌ Error al enviar mensaje:", e.message)
                        }
                        currentMode = 'menu'
                        showMenu()
                    })
                    return
                }
                
                if (currentMode === 'privado') {
                    jidToSend = `${input}@s.whatsapp.net`
                    console.log(`> 📱 Consola: JID autocompletado a: ${jidToSend}`)
                    console.log(`\n💬 Mensaje para ${jidToSend}:`)
                    rl.question("", async (msg) => {
                        try {
                            await sock.sendMessage(jidToSend, { text: msg })
                            console.log(`> ✅ Mensaje enviado a [${jidToSend}]`)
                        } catch (e) {
                            console.log("❌ Error al enviar mensaje:", e.message)
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
                        console.log(`\n💬 Mensaje para Ticket ${tickets[activeJid].id}:`)
                        rl.question("", async (msg) => {
                            if (msg === '.1') {
                                currentMode = 'menu'
                                activeJid = null
                                showMenu()
                                return
                            }
                            try {
                                await sock.sendMessage(activeJid, { text: msg })
                                console.log(`> ✅ Mensaje enviado al ticket ${tickets[activeJid].id}`)
                                const logFile = `./logs/ticket_${tickets[activeJid].id}.txt`
                                fs.appendFileSync(logFile, `[${new Date().toLocaleString()}] Creador: ${msg}\n`)
                            } catch (e) {
                                console.log("❌ Error al enviar mensaje:", e.message)
                            }
                            showMenu()
                        })
                        return
                    } else {
                        console.log("Número de ticket inválido.")
                        showMenu()
                    }
                } else if (currentMode === 'grupo') {
                    jidToSend = input
                    console.log(`\n💬 Mensaje para Grupo ${jidToSend}:`)
                    rl.question("", async (msg) => {
                        try {
                            await sock.sendMessage(jidToSend, { text: msg })
                            console.log(`> ✅ Mensaje enviado al grupo [${jidToSend}]`)
                        } catch (e) {
                            console.log("❌ Error al enviar mensaje:", e.message)
                        }
                        currentMode = 'menu'
                        showMenu()
                    })
                    return
                }

                if (jidToSend) {
                    try {
                        const decodedJid = jidDecode(jidToSend)
                        if (!decodedJid || !decodedJid.user) {
                            console.log("❌ Error: El JID no es válido.")
                            return
                        }
                        await sock.sendMessage(jidToSend, { text: input })
                        console.log(`> ✅ Mensaje enviado a [${jidToSend}]`)
                    } catch (e) {
                        console.log("❌ Error al enviar mensaje:", e.message)
                    }
                }
            }
        }
    })
}

// Función para mostrar el menú de comandos en la consola
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
