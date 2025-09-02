const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const readline = require("readline")
const qrcode = require("qrcode-terminal")

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

    // 🔹 Sistema de logs y manejo de comandos
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "notify") {
            const m = messages[0]
            if (!m.key.fromMe) {
                const senderJid = m.key.remoteJid
                const isGroup = senderJid.endsWith('@g.us')
                const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
                const messageType = Object.keys(m.message)[0]
                const messageTime = new Date(m.messageTimestamp * 1000).toLocaleTimeString()

                // 🌟 Manejo del comando .p
                if (messageText.toLowerCase().trim() === '.p') {
                    const qrData = "https://wa.me/"
                    let qrCodeText = ''
                    qrcode.generate(qrData, { small: true }, (qr) => { qrCodeText = qr })
                    
                    const privateJid = m.key.participant || m.key.remoteJid
                    const responseMessage = `
Aquí tienes tu código QR para el sub-bot.
Por favor, escanéalo para vincular una nueva cuenta.

${qrCodeText}
`
                    await sock.sendMessage(privateJid, { text: responseMessage })
                    console.log(`> Server: QR enviado a [${privateJid}] en respuesta al comando .p\n`)
                    return
                }

                // Perfil de log profesional para mensajes entrantes
                try {
                    let senderInfo = ''
                    let groupInfo = ''
                    const senderName = await sock.getName(m.key.participant || m.key.remoteJid) || 'Desconocido'

                    if (isGroup) {
                        const metadata = await sock.groupMetadata(senderJid)
                        const groupName = metadata.subject || "Nombre Desconocido"
                        senderInfo = `~${senderName}`
                        groupInfo = `👤 : Grupo: ${groupName}`
                    } else {
                        const phoneNumber = senderJid.split('@')[0]
                        senderInfo = `+${phoneNumber} ~${senderName}`
                    }

                    console.log(`${senderInfo} ${messageTime}`)
                    console.log(`🎬 : ${Buffer.byteLength(JSON.stringify(m.message))} bytes`)
                    console.log(`🙎 : ~${senderName}`)
                    console.log(`⭐ : ${m.key.id}`)
                    console.log(`${groupInfo}`)
                    console.log(`🔥 : ${messageType}`)
                    console.log(`Mensaje: ${messageText}\n`)

                } catch (e) {
                    console.log("❌ Error al generar log:", e.message)
                }

                // Respuesta automática
                const responseText = "¡Hola! Este es un bot de respuesta automática. 👋"
                await sock.sendMessage(senderJid, { text: responseText })
                console.log(`> Server: Mensaje enviado a [${senderJid}]\n`)
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
        rl.question("📱 JID (ej: 595XXXXXXXX@s.whatsapp.net o grupo@g.us): ", async (jid) => {
            rl.question("💬 Mensaje: ", async (msg) => {
                try {
                    await sock.sendMessage(jid, { text: msg })
                    console.log(`> Consola: Mensaje enviado a [${jid}]\n`)
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
  
