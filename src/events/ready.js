const { REST, Routes } = require('discord.js');
const { token, clientId, guildId } = require('../config/config');
const { sincronizarCanal, agendarSyncMeiaNoite, recuperarPendentes } = require('../utils/syncCanal');
const { sincronizarImportacoes } = require('../utils/syncImportacoes');
const { logDeploy } = require('../services/auditoria');
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

    // Diagnóstico de persistência do volume
    const { dbPath } = require('../config/config');
    const veiculosFile = path.join(dbPath, 'veiculos.json');
    const existe = fs.existsSync(veiculosFile);
    const tamanho = existe ? fs.statSync(veiculosFile).size : 0;
    console.log(`[db] path=${dbPath} veiculos.json existe=${existe} tamanho=${tamanho}b`);

    await registrarComandos();

    // Sync no startup com reconciliação completa (adiciona novos e remove apagados)
    sincronizarCanal(client, { reconciliar: true })
      .then(({ novos, removidos }) => {
        console.log(`[sync/startup] novos=${novos} removidos=${removidos}`);
        return logDeploy(client, { novos, removidos });
      })
      .catch(err => console.error('[sync/startup] Erro:', err));

    // Recupera pendentes perdidos no redeploy
    recuperarPendentes(client)
      .catch(err => console.error('[startup] Erro ao recuperar pendentes:', err));

    // Varre canal de importações e gera VINs para importações não processadas
    sincronizarImportacoes(client)
      .catch(err => console.error('[startup] Erro ao sincronizar importações:', err));

    // Agenda sync de reconciliação toda meia-noite
    agendarSyncMeiaNoite(client);
  },
};
