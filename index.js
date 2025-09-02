const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion, jidDecode } = require('@whiskeysockets/baileys')
const readline = require("readline")
const qrcode = require("qrcode-terminal")

const tickets = {}
let ticketCounter = 0
let currentMode = 'menu'
let activeJid = null

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
        browser: Browsers.macOS("Desktop")
    })

    sock.ev.on('creds.update', saveCreds)
    
    // 🔹 Manejo de conexión y QR
    sock.ev.on("connection.update", ({ connection, qr }) => {
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

    // 🔹 Sistema de logs y manejo de tickets
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "notify") {
            const m = messages[0]
            if (!m.key.fromMe) {
                const senderJid = m.key.remoteJid
                const isGroup = senderJid.endsWith('@g.us')
                const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || ''

                // Manejo de comandos (ej: !p, !abrir, !cerrar)
                if (messageText.toLowerCase().startsWith('!')) {
                    const command = messageText.toLowerCase().trim()
                    
                    if (command === '!p') {
                        const qrData = "https://wa.me/"
                        let qrCodeText = ''
                        qrcode.generate(qrData, { small: true }, (qr) => { qrCodeText = qr })
                        
                        const privateJid = m.key.participant || m.key.remoteJid
                        await sock.sendMessage(privateJid, { text: `Aquí tienes tu código QR para el sub-bot.\n\n${qrCodeText}` })
                        console.log(`> 🤖 Servidor: QR enviado a [${privateJid}] en respuesta al comando !p`)
                        return
                    }
                    if (command === '!abrir') {
                        if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                            await sock.sendMessage(senderJid, { text: "Este ticket ya está abierto." })
                        } else {
                            ticketCounter = (ticketCounter % 900) + 1
                            tickets[senderJid] = { id: ticketCounter, status: 'open' }
                            await sock.sendMessage(senderJid, { text: `Ticket abierto. ID: ${tickets[senderJid].id}` })
                            console.log(`> 🎟️ Ticket: Se abrió un ticket para [${senderJid}]`)
                        }
                        return
                    }
                    if (command === '!cerrar') {
                        if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                            tickets[senderJid].status = 'closed'
                            await sock.sendMessage(senderJid, { text: `El ticket ha sido cerrado. ¡Gracias!` })
                            console.log(`> 🎟️ Ticket: Se cerró el ticket para [${senderJid}]`)
                        } else {
                            await sock.sendMessage(senderJid, { text: "No hay un ticket abierto para cerrar." })
                        }
                        return
                    }
                }

                // Creación y manejo de tickets
                if (!tickets[senderJid] && !isGroup) {
                    ticketCounter = (ticketCounter % 900) + 1
                    tickets[senderJid] = { id: ticketCounter, status: 'open' }
                    console.log(`\n\n🎟️ Nuevo Ticket Creado: ID ${tickets[senderJid].id}`)
                    await sock.sendMessage(senderJid, { text: "Tickets abierto por el Creador" })
                }

                if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                    console.log(`[➡️ ${messageText}]`)
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
                console.log(`\n🎟️ Modo: Tickets`)
                const openTickets = Object.keys(tickets).filter(jid => tickets[jid].status === 'open')
                if (openTickets.length > 0) {
                    activeJid = openTickets[0]
                    console.log(`Ticket activo: ID ${tickets[activeJid].id}. Escriba para enviar mensaje.`)
                    console.log(`\nUse .1 para salir y .2 para cerrar el ticket.`)
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
                console.log(`\nUse .1 para salir.`)
            } else {
                console.log("Comando no reconocido. Opciones: 1, 2, 3")
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
                    activeJid = null
                } else {
                    console.log("No hay un ticket abierto para cerrar.")
                }
            } else {
                // Envío de mensajes basado en el modo
                let jidToSend = null
                if (currentMode === 'privado') {
                    jidToSend = `${input}@s.whatsapp.net`
                    console.log(`> 📱 Consola: JID autocompletado a: ${jidToSend}`)
                } else if (currentMode === 'ticket') {
                    if (activeJid) {
                        jidToSend = activeJid
                    } else {
                        console.log("No hay un ticket activo. Salga del modo con .1")
                    }
                } else if (currentMode === 'grupo') {
                    jidToSend = input
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

function showMenu() {
    console.log(`\n--- ⚙️ MENÚ DE COMANDOS ---`)
    console.log(`Crea un nuevo proyecto con Baileys.`)
    console.log(`------------------------`)
    console.log(`1️⃣ PRIVADO: Enviar mensaje a un contacto.`)
    console.log(`2️⃣ TICKETS: Gestionar tickets abiertos.`)
    console.log(`3️⃣ GRUPO: Ver tus grupos.`)
    console.log(`------------------------`)
    console.log(`Para salir de un modo: .1`)
    console.log(`Para cerrar un ticket: .2`)
}

startBot()
