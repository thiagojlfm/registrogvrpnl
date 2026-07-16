const { canalRegistroVeicularId, canalAuditoriaId } = require('../config/config');
const { lerVeiculos, removerCotacaoPorMensagem } = require('../services/database/db');
const { logApagouRegistro } = require('../services/auditoria');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    // Cotação apagada → remove do JSON + apaga log na auditoria
    const cotacao = removerCotacaoPorMensagem(message.id);
    if (cotacao?.auditoria_message_id && canalAuditoriaId) {
      try {
        const canal = await message.client.channels.fetch(canalAuditoriaId);
        const msgAuditoria = await canal.messages.fetch(cotacao.auditoria_message_id);
        await msgAuditoria.delete();
      } catch {}
    }

    // Registro oficial apagado do canal-registro-veicular → log na auditoria
    if (message.channelId !== canalRegistroVeicularId) return;
    const veiculos = lerVeiculos();
    const veiculo = veiculos.find(v => v.ativo && v.link_registro?.includes(message.id));
    if (!veiculo) return;
    await logApagouRegistro(message.client, { veiculo });
  },
};
