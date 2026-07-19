require('dotenv').config();
const fs = require('fs');
const path = require('path');
const client = require('./client');
const { token } = require('./config/config');

const eventsDir = path.join(__dirname, 'events');
const arquivos = fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'));

for (const arquivo of arquivos) {
  const evento = require(path.join(eventsDir, arquivo));
  if (evento.once) {
    client.once(evento.name, (...args) => evento.execute(...args));
  } else {
    client.on(evento.name, (...args) => evento.execute(...args));
  }
}

client.login(token);

const { iniciarApiServer } = require('./services/apiServer');
iniciarApiServer();

// Graceful shutdown — aguarda writes pendentes antes de morrer
process.once('SIGTERM', async () => {
  console.log('[shutdown] SIGTERM recebido — aguardando writes pendentes...');
  // Pequena janela para a write-queue do db.js drenar
  await new Promise(r => setTimeout(r, 500));
  console.log('[shutdown] Encerrando.');
  process.exit(0);
});

process.once('SIGINT', () => process.exit(0));
