const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, jidNormalizedUser, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');

const SENT_FILE = './sent.json';
let sent = [];

// ---------------------------------------------------------------------------------------------------
// Funciones de utilidad y persistencia
// ---------------------------------------------------------------------------------------------------

/**
 * Carga los registros de usuarios desde el archivo de persistencia.
 */
function loadSentRecords() {
    try {
        if (fs.existsSync(SENT_FILE)) {
            sent = JSON.parse(fs.readFileSync(SENT_FILE, 'utf-8'));
            console.log(`Registros cargados: ${sent.length} usuarios ya contactados.`);
        } else {
            console.log('No se encontraron registros previos. Se creará un nuevo archivo.');
        }
    } catch (err) {
        console.error(`Error al leer el archivo de registros: ${err.message}`);
    }
}

/**
 * Guarda los registros de usuarios en el archivo de persistencia.
 */
function saveSentRecords() {
    try {
        fs.writeFileSync(SENT_FILE, JSON.stringify(sent, null, 2));
    } catch (err) {
        console.error(`Error al guardar los registros: ${err.message}`);
    }
}

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

// ---------------------------------------------------------------------------------------------------
// Lógica de envío de mensajes y del bot
// ---------------------------------------------------------------------------------------------------

/**
 * Envía un mensaje de bienvenida a un usuario específico y lo registra.
 * @param {import('@whiskeysockets/baileys').WASocket} sock - Instancia de la conexión de Baileys.
 * @param {string} groupJid - JID del grupo.
 * @param {string} userJid - JID del usuario.
 * @returns {Promise<void>}
 */
async function sendMessageToUser(sock, groupJid, userJid) {
    if (sent.includes(userJid)) {
        console.log(`Omitiendo a ${userJid}: Ya se le ha enviado un mensaje.`);
        return;
    }

    try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const groupName = groupMetadata.subject;
        const messageText = `Hola, soy un subbot. Puedes usar mis comandos con .help\nGrupo: ${groupName}\nFecha y hora: ${getDateTime()}`;

        await sock.sendMessage(userJid, { text: messageText });
        
        sent.push(userJid);
        saveSentRecords();
        console.log(`Mensaje enviado a ${userJid} desde el grupo "${groupName}".`);
    } catch (err) {
        console.error(`No se pudo enviar mensaje a ${userJid}:`, err.message);
    }
}

/**
 * Envía un mensaje de bienvenida a todos los miembros actuales del grupo que no han sido contactados.
 * @param {import('@whiskeysockets/baileys').WASocket} sock - Instancia de la conexión de Baileys.
 * @param {string} groupJid - JID del grupo.
 * @returns {Promise<void>}
 */
async function sendToGroup(sock, groupJid) {
    try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const participants = groupMetadata.participants.map(p => jidNormalizedUser(p.id));
        
        console.log(`Verificando ${participants.length} participantes del grupo para el envío masivo...`);
        
        for (const userJid of participants) {
            await sendMessageToUser(sock, groupJid, userJid);
        }
    } catch (err) {
        console.error(`Error al enviar mensajes a todos los miembros del grupo: ${err.message}`);
    }
}

/**
 * Inicia el bot y gestiona la conexión a WhatsApp.
 */
async function startBot() {
    loadSentRecords();

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'silent' }),
    });

    // Manejar eventos de conexión
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Escanea este código QR con tu WhatsApp para vincular el dispositivo:');
            console.log(qr);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`Conexión cerrada. Razón: ${statusCode}`);
            
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('Reconectando...');
                startBot(); 
            } else {
                console.log('Sesión cerrada. Por favor, elimina la carpeta auth_info e inicia de nuevo.');
            }
        } else if (connection === 'open') {
            console.log('Bot conectado a WhatsApp ✅');
            
            const groupJid = 'XXXXXXX@g.us'; // ⚠️ Pon aquí el JID del grupo
            await sendToGroup(sock, groupJid);
        }
    });

    // Guarda las credenciales de la sesión.
    sock.ev.on('creds.update', saveCreds);

    // Evento para detectar nuevos miembros añadidos al grupo.
    sock.ev.on('group-participants.update', async (update) => {
        const groupJid = update.id;
        if (update.action === 'add') {
            for (const participant of update.participants) {
                const normalized = jidNormalizedUser(participant);
                await sendMessageToUser(sock, groupJid, normalized);
            }
        }
    });
}

// ---------------------------------------------------------------------------------------------------
// Ejecución del bot
// ---------------------------------------------------------------------------------------------------

startBot();