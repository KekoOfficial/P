// config.js

module.exports = {
    // ❗ DEBES REEMPLAZAR ESTE JID CON EL NÚMERO DEL CREADOR
    CREATOR_JID: '595984495031@s.whatsapp.net',

    // Comandos de grupo activados/desactivados
    GROUP_COMMANDS_ENABLED: true,

    // Sistema Anti-Link
    IS_ANTI_LINK_ENABLED: true,

    // Sistema de Filtro de Palabras
    IS_WORD_FILTER_ENABLED: true,
    OFFENSIVE_WORDS: ['puta', 'mierda', 'gilipollas', 'cabrón', 'estúpido', 'pendejo', 'imbécil', 'idiota', 'culiao', 'conchetumare'],

    // Información del Bot
    BOT_VERSION: '1.2.0',
    BOT_MODE: 'activo',

    // Mensaje de bienvenida del grupo
    GROUP_WELCOME_MESSAGE: (name) => {
        const now = new Date()
        const weekday = now.toLocaleString('es-ES', { weekday: 'long' })
        const date = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
        const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    
        return `
👋 ¡Bienvenido/a, ${name}!
Me uno al grupo el ${weekday}, ${date} a las ${time}.
Por favor, lee las reglas y si tienes alguna duda, usa ~menu para ver mis comandos.`
    }
};
