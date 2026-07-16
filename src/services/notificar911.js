const { idBot911 } = require('../config/config');

/**
 * Notifica o 911-bot sobre um registro ou transferência.
 * Canal de integração a ser definido — lógica preparada para fácil ativação.
 *
 * @param {import('discord.js').Client} client
 * @param {{ tipo: 'registro'|'transferencia', discord_id: string, placa: string, vin: string, modelo: string }} dados
 */
async function notificar911(client, dados) {
  if (!idBot911) return;

  // TODO: definir CANAL_INTEGRACAO_911_ID no .env e descomentar abaixo
  // const canalId = process.env.CANAL_INTEGRACAO_911_ID;
  // if (!canalId) return;
  // try {
  //   const canal = await client.channels.fetch(canalId);
  //   await canal.send(JSON.stringify(dados));
  // } catch (err) {
  //   console.error('[911] Falha ao notificar 911-bot:', err.message);
  // }
}

module.exports = { notificar911 };
