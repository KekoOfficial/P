const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion, jidDecode } = require('@whiskeysockets/baileys')
const readline = require("readline")
const qrcode = require("qrcode-terminal")

const tickets = {}
let ticketCounter = 0

async function startBot() {
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
            manualChat(sock)
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

                // 🌟 Manejo de comandos
                if (messageText.toLowerCase().startsWith('!')) {
                    const command = messageText.toLowerCase().trim()
                    
                    if (command === '!p') {
                        const qrData = "https://wa.me/"
                        let qrCodeText = ''
                        qrcode.generate(qrData, { small: true }, (qr) => { qrCodeText = qr })
                        
                        const privateJid = m.key.participant || m.key.remoteJid
                        await sock.sendMessage(privateJid, { text: `Aquí tienes tu código QR para el sub-bot.\n\n${qrCodeText}` })
                        console.log(`> Server: QR enviado a [${privateJid}] en respuesta al comando !p\n`)
                        return
                    }
                    if (command === '!abrir') {
                        if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                            await sock.sendMessage(senderJid, { text: "Este ticket ya está abierto." })
                        } else {
                            tickets[senderJid] = { id: ++ticketCounter, status: 'open' }
                            await sock.sendMessage(senderJid, { text: `Ticket abierto. ID: ${tickets[senderJid].id}` })
                            console.log(`> Server: Se abrió un ticket para [${senderJid}]\n`)
                        }
                        return
                    }
                    if (command === '!cerrar') {
                        if (tickets[senderJid] && tickets[senderJid].status === 'open') {
                            tickets[senderJid].status = 'closed'
                            await sock.sendMessage(senderJid, { text: `El ticket ha sido cerrado. ¡Gracias!` })
                            console.log(`> Server: Se cerró el ticket para [${senderJid}]\n`)
                        } else {
                            await sock.sendMessage(senderJid, { text: "No hay un ticket abierto para cerrar." })
                        }
                        return
                    }
                }

                // 🌟 Creación y manejo de tickets
                if (!tickets[senderJid]) {
                    tickets[senderJid] = { id: ++ticketCounter, status: 'open' }
                    console.log(`🎫 Nuevo ticket creado. ID: ${tickets[senderJid].id}`)
                    await sock.sendMessage(senderJid, { text: "Tickets abierto por el Creador" })
                    console.log(`> Server: Mensaje de bienvenida enviado a [${senderJid}]\n`)
                    
                    // Log del primer mensaje
                    console.log(`[> ${messageText}]\n`)
                    return
                }

                if (tickets[senderJid].status === 'open') {
                    console.log(`[> ${messageText}]\n`)
                    return
                }
            }
        }
    })
}

// 📌 Escribir manualmente mensajes desde la consola
function manualChat(sock) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    const ask = () => {
        rl.question("📱 JID (ej: 595XXXXXXXX o grupo@g.us): ", async (jid) => {
            rl.question("💬 Mensaje: ", async (msg) => {
                let formattedJid = jid
                if (!jid.includes('@') && !jid.includes('-')) {
                    formattedJid = `${jid}@s.whatsapp.net`
                    console.log(`> Consola: JID autocompletado a: ${formattedJid}`)
                }

                const decodedJid = jidDecode(formattedJid)
                if (!decodedJid || !decodedJid.user) {
                    console.log("❌ Error: El JID ingresado no es válido. Verifica el número o ID de grupo.")
                    ask()
                    return
                }

                try {
                    await sock.sendMessage(formattedJid, { text: msg })
                    console.log(`> Consola: Mensaje enviado a [${formattedJid}]\n`)
                } catch (e) {
                    console.log("❌ Error al enviar mensaje:", e.message)
                }
                ask()
            })
        })
    }
    ask()
}

startBot()
