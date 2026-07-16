const fs = require('fs');
const path = require('path');

const comandos = new Map();

function carregarComandos() {
  const dirs = ['public', 'private'];
  for (const dir of dirs) {
    const pasta = path.join(__dirname, '../commands', dir);
    if (!fs.existsSync(pasta)) continue;
    const arquivos = fs.readdirSync(pasta).filter(f => f.endsWith('.js'));
    for (const arquivo of arquivos) {
      const cmd = require(path.join(pasta, arquivo));
      if (cmd.data) comandos.set(cmd.data.name, cmd);
    }
  }
}

carregarComandos();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const cmd = comandos.get(interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction);
    } catch (err) {
      console.error(`[interactionCreate] Erro em /${interaction.commandName}:`, err);
      const resposta = { content: '❌ Ocorreu um erro ao executar este comando.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(resposta);
      } else {
        await interaction.reply(resposta);
      }
    }
  },
};
