const { idBotImportacao, idBotEconomia, canalImportacaoId } = require('../config/config');
const { parsearMensagemImportacao } = require('../utils/parser');
const { gerarVin } = require('../utils/vinGenerator');
const { setPendente } = require('../services/database/db');
const { msgImportacaoRegistrada } = require('../utils/formatter');
const { valoresConferem, extrairValorEmbed, parsearUrlDiscord } = require('../utils/valorParser');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.id !== idBotImportacao) return;
    if (message.channelId !== canalImportacaoId) return;

    const dados = parsearMensagemImportacao(message);

    if (!dados.comprador_id) {
      console.warn('[importacao] Não foi possível extrair comprador_id.');
      return;
    }

    // 1. Comprovante obrigatório
    if (!dados.comprovante?.trim()) {
      await message.channel.send('⚠️ Importação ignorada: comprovante de pagamento ausente.');
      return;
    }

    // 2. Fetch da mensagem do comprovante
    const ids = parsearUrlDiscord(dados.comprovante);
    if (!ids) {
      await message.channel.send('⚠️ Importação ignorada: link do comprovante inválido.');
      return;
    }

    let msgComprovante;
    try {
      const canal = await message.client.channels.fetch(ids.channelId);
      msgComprovante = await canal.messages.fetch(ids.messageId);
    } catch (err) {
      console.error('[importacao] Erro ao buscar comprovante:', err.message);
      await message.channel.send('⚠️ Importação ignorada: não foi possível acessar o comprovante.');
      return;
    }

    // 3. Se for do bot de economia, valida o valor; caso contrário (msg do atendente/bot
    //    interno), a importação já foi aprovada manualmente — aceita sem comparação
    if (msgComprovante.author.id === idBotEconomia) {
      let valorComp = null;

      // Tenta embed clássico primeiro
      const embed = msgComprovante.embeds?.[0];
      if (embed) {
        valorComp = extrairValorEmbed(embed);
      }

      // Fallback: mensagem V2 (Components V2 sem embeds) — extrai texto dos componentes
      if (!valorComp) {
        try {
          const raw = msgComprovante.toJSON?.() ?? {};
          const textoV2 = JSON.stringify(raw.components || raw.embeds || '');
          const match = textoV2.match(/\$\s*[\d,. ]+/);
          if (match) valorComp = match[0].replace(/\s/g, '');
        } catch {}
      }

      // Fallback: content puro
      if (!valorComp && msgComprovante.content) {
        const match = msgComprovante.content.match(/\$\s*[\d,. ]+/);
        if (match) valorComp = match[0].replace(/\s/g, '');
      }

      if (!valorComp || !valoresConferem(valorComp, dados.valor_pago)) {
        await message.channel.send(
          `⚠️ Importação ignorada: valor no comprovante (**${valorComp || 'não encontrado'}**) não confere com o valor informado (**${dados.valor_pago}**).`
        );
        return;
      }
    }

    // 5. Tudo ok — gera VIN e salva pendente
    let vin;
    try { vin = gerarVin(); } catch (err) {
      console.error('[importacao] Erro ao gerar VIN:', err.message);
      return;
    }

    setPendente(dados.comprador_id, {
      vin,
      importador_id: dados.importador_id || null,
      veiculo: dados.veiculo || 'Desconhecido',
      modelo: dados.modelo || '',
      obs: dados.obs || '',
      comprovante: dados.comprovante,
      valor_pago: dados.valor_pago,
      criado_em: Date.now(),
    });

    console.log(`[importacao] Pendente criado para ${dados.comprador_id} | VIN: ${vin}`);

    // Notifica no tópico da conce onde o !pay foi feito
    try {
      const canalNotif = await message.client.channels.fetch(ids.channelId);
      await canalNotif.send(msgImportacaoRegistrada({
        compradorId: dados.comprador_id,
        veiculo: dados.veiculo || 'Desconhecido',
        modelo: dados.modelo || '',
        vin,
      }));
    } catch {
      await message.channel.send(msgImportacaoRegistrada({
        compradorId: dados.comprador_id,
        veiculo: dados.veiculo || 'Desconhecido',
        modelo: dados.modelo || '',
        vin,
      })).catch(() => {});
    }
  },
};
