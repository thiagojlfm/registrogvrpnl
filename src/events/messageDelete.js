const { canalRegistroVeicularId } = require('../config/config');
const { lerVeiculos, removerCotacaoPorMensagem } = require('../services/database/db');
const { logApagouRegistro } = require('../services/auditoria');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    // Cotação apagada do tópico → remove do registro para permitir nova cotação
    removerCotacaoPorMensagem(message.id);

    // Registro oficial apagado do canal-registro-veicular → log na auditoria
    if (message.channelId !== canalRegistroVeicularId) return;
    const veiculos = lerVeiculos();
    const veiculo = veiculos.find(v => v.ativo && v.link_registro?.includes(message.id));
    if (!veiculo) return;
    await logApagouRegistro(message.client, { veiculo });
  },
};
