const { REST, Routes } = require('discord.js');
const { token, clientId, guildId } = require('../config/config');
const fs = require('fs');
const path = require('path');

async function registrarComandos() {
  const comandos = [];
  const dirs = ['public', 'private'];

  for (const dir of dirs) {
    const pasta = path.join(__dirname, '../commands', dir);
    if (!fs.existsSync(pasta)) continue;
    const arquivos = fs.readdirSync(pasta).filter(f => f.endsWith('.js'));
    for (const arquivo of arquivos) {
      const cmd = require(path.join(pasta, arquivo));
      if (cmd.data) comandos.push(cmd.data.toJSON());
    }
  }

  const rest = new REST().setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: comandos });
  console.log(`[ready] ${comandos.length} comando(s) registrado(s) no guild.`);
}

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[ready] Logado como ${client.user.tag}`);
    await registrarComandos();
  },
};
