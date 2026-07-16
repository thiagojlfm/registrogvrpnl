const { canalImportacaoId, idBotImportacao, idBotEconomia } = require('../config/config');
const { lerVeiculos, lerPendentes, setPendente } = require('../services/database/db');
const { parsearMensagemImportacao } = require('./parser');
const { extrairValorEmbed, valoresConferem, parsearUrlDiscord } = require('./valorParser');
const { gerarVin } = require('./vinGenerator');
const { msgImportacaoRegistrada } = require('./formatter');

async function sincronizarImportacoes(client) {
  if (!canalImportacaoId) return 0;

  console.log(`[sync/import] iniciando — canal=${canalImportacaoId} idBotImportacao=${idBotImportacao}`);
  const canal = await client.channels.fetch(canalImportacaoId).catch(() => null);
  if (!canal) { console.log(`[sync/import] canal não encontrado`); return 0; }

  const veiculos   = lerVeiculos();
  const pendentes  = lerPendentes();

  // VINs já registrados e compradores já com pendente ativo
  const vinsRegistrados    = new Set(veiculos.map(v => v.vin));
  const compradoresAtivos  = new Set(Object.keys(pendentes));
  // Compradores que já têm veículo registrado (não precisam de pendente)
  const compradoresRegist  = new Set(veiculos.map(v => v.comprador_id));

  let gerados = 0;
  let before  = undefined;

  while (true) {
    const opcoes = { limit: 100 };
    if (before) opcoes.before = before;

    const msgs = await canal.messages.fetch(opcoes);
    if (msgs.size === 0) break;

    for (const msg of msgs.values()) {
      if (msg.author.id !== idBotImportacao) continue;

      console.log(`[sync/import] msg id=${msg.id} type=${msg.type} flags=${msg.flags?.bitfield}`);
      console.log(`[sync/import]   embeds=${msg.embeds?.length} attachments=${msg.attachments?.size} components=${msg.components?.length}`);
      console.log(`[sync/import]   content="${msg.content?.slice(0,80)}"`);
      if (msg.embeds?.length) console.log(`[sync/import]   embed[0] title="${msg.embeds[0]?.title}" desc="${msg.embeds[0]?.description?.slice(0,80)}"`);
      if (msg.attachments?.size) msg.attachments.forEach(a => console.log(`[sync/import]   attachment: ${a.contentType} ${a.url?.slice(0,60)}`));

      const raw = JSON.stringify(msg.embeds || '') + (msg.content || '') + JSON.stringify(msg.components || '');
      if (!raw.includes('IMPORTA')) { console.log(`[sync/import]   skip: sem IMPORTA`); continue; }

      const dados = parsearMensagemImportacao(msg);
      console.log(`[sync/import] msg ${msg.id} → comprador_id=${dados.comprador_id} comprovante=${dados.comprovante} valor=${dados.valor_pago}`);

      if (!dados.comprador_id) { console.log(`[sync/import] skip: sem comprador_id`); continue; }
      if (compradoresAtivos.has(dados.comprador_id)) { console.log(`[sync/import] skip: pendente ativo`); continue; }
      if (compradoresRegist.has(dados.comprador_id)) { console.log(`[sync/import] skip: ja registrado`); continue; }
      if (!dados.comprovante?.trim()) { console.log(`[sync/import] skip: sem comprovante`); continue; }

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

      // Tudo ok — gera VIN e salva pendente
      const vin = gerarVin();
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
