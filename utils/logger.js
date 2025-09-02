// utils/logger.js
const fs = require('fs');

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

module.exports = {
    log,
    logError,
    appendLogFile,
};
