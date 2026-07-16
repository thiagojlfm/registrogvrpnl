const { idBotImportacao, canalImportacaoId } = require('../config/config');
const { parsearMensagemImportacao } = require('../utils/parser');
const { gerarVin } = require('../utils/vinGenerator');
const { getPendente, setPendente } = require('../services/database/db');
const { msgImportacaoRegistrada } = require('../utils/formatter');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.id !== idBotImportacao) return;
    if (message.channelId !== canalImportacaoId) return;

    const dados = parsearMensagemImportacao(message);

    if (!dados.comprador_id) {
      console.warn('[messageCreate] Não foi possível extrair comprador_id da mensagem de importação.');
      return;
    }

    let vin;
    try {
      vin = gerarVin();
    } catch (err) {
      console.error('[messageCreate] Erro ao gerar VIN:', err.message);
      return;
    }

    const pendente = {
      vin,
      importador_id: dados.importador_id || null,
      veiculo: dados.veiculo || 'Desconhecido',
      modelo: dados.modelo || '',
      obs: dados.obs || '',
      comprovante: dados.comprovante || '',
      valor_pago: dados.valor_pago || '',
      criado_em: Date.now(),
    };

    setPendente(dados.comprador_id, pendente);
    console.log(`[messageCreate] Pendente criado para ${dados.comprador_id} | VIN: ${vin}`);

    await message.channel.send(
      msgImportacaoRegistrada({
        compradorId: dados.comprador_id,
        veiculo: pendente.veiculo,
        modelo: pendente.modelo,
        vin,
      })
    );
  },
};
