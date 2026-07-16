const { canalImportacaoId, idBotImportacao, idBotEconomia } = require('../config/config');
const { lerVeiculos, lerPendentes, setPendente, lerImportsProcessados, marcarImportProcessado } = require('../services/database/db');
const { parsearMensagemImportacao } = require('./parser');
const { extrairValorEmbed, valoresConferem, parsearUrlDiscord } = require('./valorParser');
const { gerarVin } = require('./vinGenerator');
const { msgImportacaoRegistrada } = require('./formatter');

async function sincronizarImportacoes(client) {
  if (!canalImportacaoId) return 0;

  console.log(`[sync/import] iniciando — canal=${canalImportacaoId} idBotImportacao=${idBotImportacao}`);
  const canal = await client.channels.fetch(canalImportacaoId).catch(() => null);
  if (!canal) { console.log(`[sync/import] canal não encontrado`); return 0; }

  const veiculos          = lerVeiculos();
  const pendentes         = lerPendentes();
  const importsProcessados = lerImportsProcessados();

  // Compradores com pendente ativo (aguardando /registrar_veiculo)
  const compradoresAtivos = new Set(Object.keys(pendentes));

  let gerados = 0;
  let before  = undefined;

  while (true) {
    const opcoes = { limit: 100 };
    if (before) opcoes.before = before;

    const msgs = await canal.messages.fetch(opcoes);
    if (msgs.size === 0) break;

    for (const msg of msgs.values()) {
      if (msg.author.id !== idBotImportacao) continue;

      // Extrai texto bruto de mensagens V2 para o filtro e para o log
      const isV2 = (msg.flags?.bitfield ?? 0) & 32768;
      let rawTexto = (msg.content || '') + JSON.stringify(msg.embeds || '');
      if (isV2) {
        try { rawTexto += JSON.stringify(msg.toJSON().components || ''); } catch {}
      }

      if (!rawTexto.includes('IMPORTA')) continue;

      // Já processado em deploy anterior — não gera VIN duplicado
      if (importsProcessados.has(msg.id)) continue;

      const dados = parsearMensagemImportacao(msg);

      if (!dados.comprador_id) continue;
      if (compradoresAtivos.has(dados.comprador_id)) continue;
      if (!dados.comprovante?.trim()) continue;

      // Valida comprovante
      const ids = parsearUrlDiscord(dados.comprovante);
      if (!ids) continue;

      let valorOk = false;
      try {
        const canalComp = await client.channels.fetch(ids.channelId);
        const msgComp   = await canalComp.messages.fetch(ids.messageId);
        if (msgComp.author.id === idBotEconomia) {
          const embed      = msgComp.embeds?.[0];
          const valorEmbed = embed ? extrairValorEmbed(embed) : null;
          valorOk = !dados.valor_pago || valoresConferem(valorEmbed, dados.valor_pago);
        }
      } catch { continue; }

      if (!valorOk) continue;

      // Tudo ok — gera VIN, salva pendente e marca import como processado
      const vin = gerarVin();
      marcarImportProcessado(msg.id);
      setPendente(dados.comprador_id, {
        vin,
        importador_id: dados.importador_id || null,
        veiculo:      dados.veiculo  || 'Desconhecido',
        modelo:       dados.modelo   || '',
        obs:          dados.obs      || '',
        comprovante:  dados.comprovante,
        valor_pago:   dados.valor_pago || null,
        criado_em:    msg.createdTimestamp,
      });

      compradoresAtivos.add(dados.comprador_id);
      gerados++;

      // Notifica no tópico da conce (channelId do comprovante = thread onde o !pay foi feito)
      try {
        const canalNotif = await client.channels.fetch(ids.channelId);
        await canalNotif.send(msgImportacaoRegistrada({
          compradorId: dados.comprador_id,
          veiculo:     dados.veiculo  || 'Desconhecido',
          modelo:      dados.modelo   || '',
          vin,
        }));
      } catch {
        // Fallback: posta no canal de importações se não conseguir acessar o tópico
        await canal.send(msgImportacaoRegistrada({
          compradorId: dados.comprador_id,
          veiculo:     dados.veiculo  || 'Desconhecido',
          modelo:      dados.modelo   || '',
          vin,
        })).catch(() => {});
      }

      console.log(`[sync/import] VIN ${vin} gerado para <@${dados.comprador_id}>`);
    }

    before = msgs.last()?.id;
    if (msgs.size < 100) break;
  }

  if (gerados > 0) console.log(`[sync/import] ${gerados} importação(ões) processada(s).`);
  return gerados;
}

module.exports = { sincronizarImportacoes };
