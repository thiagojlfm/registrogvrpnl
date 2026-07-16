const { canalRegistroVeicularId } = require('../config/config');
const { lerVeiculos } = require('../services/database/db');
const { logApagouRegistro } = require('../services/auditoria');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (message.channelId !== canalRegistroVeicularId) return;

    // Encontra o veículo pelo link_registro que contém o ID da mensagem apagada
    const veiculos = lerVeiculos();
    const veiculo = veiculos.find(v => v.ativo && v.link_registro?.includes(message.id));
    if (!veiculo) return;

    await logApagouRegistro(message.client, { veiculo });
  },
};
