const { MessageFlags } = require('discord.js');
const { canalAuditoriaId, cores, emojis: e } = require('../config/config');
const db = require('./database/db');

const { carro, info, infoAlt, sim, vendido, seta, dot, rpc2, rpw, rpc } = e || {};

function text(content) { return { type: 10, content }; }
function sep() { return { type: 14, divider: true, spacing: 1 }; }
function container(cor, components) { return { type: 17, accent_color: cor, components }; }
function v2() { return MessageFlags.IsComponentsV2; }
function ts() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function postar(client, payload) {
  if (!canalAuditoriaId) return;
  try {
    const canal = await client.channels.fetch(canalAuditoriaId);
    await canal.send(payload);
  } catch (err) {
    console.error('[auditoria] Erro ao postar:', err.message);
  }
}

// ── Registro novo ─────────────────────────────────────────────────────────────

async function logRegistro(client, { veiculo: v, registradorId, linkRegistro }) {
  const dadosRecovery = {
    vin: v.vin, placa: v.placa, cor: v.cor, veiculo: v.veiculo,
    modelo: v.modelo || '', comprador_id: v.comprador_id, tipo: v.tipo,
    link_registro: linkRegistro, foto_url: v.foto_url || null,
    classe: v.classe || null, categoria: v.categoria || null,
    link_cotacao: v.link_cotacao || null, comprovante: v.comprovante || null,
    valor_pago: v.valor_pago || null, importador_id: v.importador_id || null,
    empresa: v.empresa || null, empresa_link: v.empresa_link || null,
    finalidade: v.finalidade || null,
  };
  await postar(client, {
    flags: v2(),
    components: [container(cores.verde, [
      text(`## ${sim} REGISTRO DE VEÍCULO`),
      sep(),
      text(
        `## ${carro} ${seta} Proprietário\n` +
        `> ${dot} **Registrado por:** <@${registradorId}>`
      ),
      sep(),
      text(
        `## ${info} ${seta} Informações do veículo\n` +
        `> ${rpc2} **Ano, marca, modelo:** ${v.veiculo}\n` +
        `> ${rpw} **Versão:** ${v.modelo || 'N/A'}\n` +
        `> ${rpw} **Coloração:** ${v.cor}\n` +
        `> ${rpw} **Classe:** ${v.classe || 'N/A'}\n` +
        `> ${rpw} **Placa:** ${v.placa}\n` +
        `> ${rpc} **VIN Number:** ${v.vin}`
      ),
      sep(),
      text(
        `## ${infoAlt} ${seta} Comprovantes\n` +
        `> ${dot} **Cotação:** ${v.link_cotacao || 'N/A'}\n` +
        `> ${dot} **Pagamento:** ${v.comprovante || 'N/A'}\n` +
        `> ${dot} **Registro oficial:** ${linkRegistro}`
      ),
      sep(),
      text(
        `-# Log gerado automaticamente · ${ts()}\n` +
        `-# 📦 \`VEICULO\` · ${JSON.stringify(dadosRecovery)}`
      ),
    ])],
  });
}

// ── Transferência ─────────────────────────────────────────────────────────────

async function logTransferencia(client, { veiculo: v, exProprietarioId, novoProprietarioId, comprovante }) {
  await postar(client, {
    flags: v2(),
    components: [container(cores.amarelo, [
      text(`## ${vendido} TRANSFERÊNCIA DE VEÍCULO`),
      sep(),
      text(
        `## ${carro} ${seta} Veículo\n` +
        `> ${rpc2} **Ano, marca, modelo:** ${v.veiculo}\n` +
        `> ${rpw} **Versão:** ${v.modelo || 'N/A'}\n` +
        `> ${rpw} **Placa:** ${v.placa}\n` +
        `> ${rpc} **VIN Number:** ${v.vin}`
      ),
      sep(),
      text(
        `## ${infoAlt} ${seta} Proprietários\n` +
        `> ${dot} **Vendedor:** <@${exProprietarioId}>\n` +
        `> ${dot} **Comprador:** <@${novoProprietarioId}>`
      ),
      sep(),
      text(
        `## ${info} ${seta} Pagamento\n` +
        `> ${dot} **Comprovante:** ${comprovante}\n` +
        (v.link_registro ? `> ${dot} **Registro:** ${v.link_registro}\n` : '') +
        `-# Log gerado automaticamente · ${ts()}\n` +
        `-# 📦 \`TRANSFERENCIA\` · ${JSON.stringify({ vin: v.vin, placa: v.placa, ex: exProprietarioId, novo: novoProprietarioId, comprovante })}`
      ),
    ])],
  });
}

// ── Edição de foto ────────────────────────────────────────────────────────────

async function logEdicaoFoto(client, { veiculo: v, editorId, fotoAntiga, fotoNova }) {
  await postar(client, {
    flags: v2(),
    components: [container(cores.azul, [
      text(`## ${info} EDIÇÃO DE FOTO`),
      sep(),
      text(
        `## ${carro} ${seta} Veículo\n` +
        `> ${rpc2} **Ano, marca, modelo:** ${v.veiculo}\n` +
        `> ${rpw} **Placa:** ${v.placa}\n` +
        `> ${rpc} **VIN Number:** ${v.vin}`
      ),
      sep(),
      text(
        `## ${infoAlt} ${seta} Alteração\n` +
        `> ${dot} **Editado por:** <@${editorId}>\n` +
        (fotoAntiga ? `> ${dot} **Foto anterior:** [Ver](${fotoAntiga})\n` : '') +
        `> ${dot} **Nova foto:** [Ver](${fotoNova})`
      ),
      sep(),
      text(`-# Log gerado automaticamente · ${ts()}`),
    ])],
  });
}

// ── Sync no deploy ────────────────────────────────────────────────────────────

async function logDeploy(client, { novos, removidos }) {
  // Só loga se houve remoções — registros novos têm logRegistro próprio
  if (removidos === 0) return;
  await postar(client, {
    flags: v2(),
    components: [container(cores.vermelho, [
      text(`## 🔄 SYNC NO DEPLOY — REMOÇÕES DETECTADAS`),
      sep(),
      text(
        `> ${dot} **Veículos novos sincronizados:** ${novos}\n` +
        `> ${dot} **Removidos (registro apagado do canal):** ${removidos}`
      ),
      sep(),
      text(`-# Log gerado automaticamente · ${ts()}`),
    ])],
  });
}

// ── Pendente de registro (recuperável após redeploy) ──────────────────────────

async function logPendente(client, { comprador_id, pendente }) {
  await postar(client, {
    flags: v2(),
    components: [container(cores.azul, [
      text(`## 🕐 PENDENTE DE REGISTRO`),
      sep(),
      text(
        `## ${carro} ${seta} Veículo\n` +
        `> ${rpc2} **Ano, marca, modelo:** ${pendente.veiculo}\n` +
        `> ${rpw} **Versão:** ${pendente.modelo || 'N/A'}\n` +
        `> ${rpw} **Classe:** ${pendente.classe || 'N/A'}\n` +
        `> ${rpc} **VIN:** \`${pendente.vin}\``
      ),
      sep(),
      text(
        `## ${infoAlt} ${seta} Compra\n` +
        `> ${dot} **Comprador:** <@${comprador_id}>\n` +
        `> ${dot} **Autorizado por:** <@${pendente.importador_id}>\n` +
        `> ${dot} **Valor pago:** ${pendente.valor_pago || 'N/A'}\n` +
        `> ${dot} **Comprovante:** ${pendente.comprovante || 'N/A'}`
      ),
      sep(),
      text(
        `-# 🔒 Aguardando /registrar_veiculo · ${ts()}\n` +
        `-# PENDENTE_JSON:\`${JSON.stringify({ comprador_id, ...pendente })}\`\n` +
        `-# 📦 \`PENDENTE\` · ${JSON.stringify({ comprador_id, ...pendente })}`
      ),
    ])],
  });
}

// ── Cotação registrada ────────────────────────────────────────────────────────

async function logCotacao(client, { atendenteId, topicoId, topicoNome, valor, obs }) {
  if (!canalAuditoriaId) return null;
  try {
    const canal = await client.channels.fetch(canalAuditoriaId);
    const msg = await canal.send({
      flags: v2(),
      components: [container(cores.amarelo, [
        text(`## 💰 COTAÇÃO REGISTRADA`),
        sep(),
        text(
          `> ${dot} **Atendente:** <@${atendenteId}>\n` +
          `> ${dot} **Tópico:** <#${topicoId}> (${topicoNome})\n` +
          `> ${dot} **Valor cotado:** ${valor}\n` +
          (obs ? `> ${dot} **Observação:** ${obs}\n` : '') +
          `-# Log gerado automaticamente · ${ts()}`
        ),
      ])],
    });
    return msg.id;
  } catch (err) {
    console.error('[auditoria] Erro ao logar cotação:', err.message);
    return null;
  }
}

// ── Comissão registrada ───────────────────────────────────────────────────────

async function logComissao(client, { num, atendenteId, carro, vin, valorVenda, valorComissao }) {
  await postar(client, {
    flags: v2(),
    components: [container(cores.verde, [
      text(`## 💸 COMISSÃO REGISTRADA — VENDA #${num}`),
      sep(),
      text(
        `> ${dot} **Atendente:** <@${atendenteId}>\n` +
        `> ${dot} **Veículo:** ${carro}\n` +
        `> ${rpc} **VIN:** \`${vin}\`\n` +
        `> ${dot} **Valor da venda:** ${valorVenda}\n` +
        `> ${dot} **Comissão (5%):** ${valorComissao}\n` +
        `-# Log gerado automaticamente · ${ts()}`
      ),
    ])],
  });
}

// ── Registro apagado do canal ─────────────────────────────────────────────────

async function logApagouRegistro(client, { veiculo: v }) {
  if (!canalAuditoriaId) return;
  try {
    const canal = await client.channels.fetch(canalAuditoriaId);
    await canal.send({
      flags: v2(),
      components: [container(cores.vermelho, [
        text(
          `## 🗑️ REGISTRO APAGADO DO CANAL\n` +
          `> ${dot} **Proprietário:** <@${v.comprador_id}>\n` +
          `> ${rpc2} **Veículo:** ${v.veiculo} ${v.modelo || ''}\n` +
          `> ${rpw} **Placa:** ${v.placa}\n` +
          `> ${rpc} **VIN:** \`${v.vin}\``
        ),
        sep(),
        text(`-# O veículo ainda existe no banco de dados. Deseja removê-lo também?`),
        sep(),
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: '↩️ Restaurar registro',
              custom_id: `btn_restaurar_registro:${v.vin}`,
            },
            {
              type: 2,
              style: 2,
              label: 'Manter no banco de dados',
              custom_id: `btn_manter_db:${v.vin}`,
            },
            {
              type: 2,
              style: 4,
              label: '🗑️ Apagar do banco de dados',
              custom_id: `btn_apagar_db:${v.vin}`,
            },
          ],
        },
        sep(),
        text(`-# Log gerado automaticamente · ${ts()}`),
      ])],
    });
  } catch (err) {
    console.error('[auditoria] Erro ao logar apagar registro:', err.message);
  }
}

// ── Recovery: reconstrói estado a partir do canal de auditoria ────────────────
// Chamado no startup se veiculos.json estiver vazio — Discord como fonte de verdade.

function _extrairTexto(components = []) {
  let out = '';
  for (const c of components) {
    if (c.type === 10 && c.content) out += c.content + '\n';
    if (c.components) out += _extrairTexto(c.components);
  }
  return out;
}

function _parseDataLine(texto) {
  // Formato: -# 📦 `TYPE` · {json}
  const match = texto.match(/-# 📦 `([A-Z_]+)` · (\{[\s\S]+?\})(?:\n|$)/m);
  if (!match) return null;
  try { return { tipo: match[1], dados: JSON.parse(match[2]) }; } catch { return null; }
}

async function reconstruirDoCanal(client) {
  if (!canalAuditoriaId) {
    console.warn('[recovery] CANAL_AUDITORIA_ID não configurado — recovery impossível.');
    return { veiculos: 0, pendentes: 0 };
  }

  console.log('[recovery] DB vazio — reconstruindo do canal de auditoria...');

  try {
    const canal = await client.channels.fetch(canalAuditoriaId);
    const todasMsgs = [];
    let before;

    while (true) {
      const batch = await canal.messages.fetch({ limit: 100, ...(before && { before }) });
      if (!batch.size) break;
      todasMsgs.push(...batch.values());
      before = batch.last().id;
      if (batch.size < 100) break;
    }

    // Mais antigas primeiro
    todasMsgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const veiculosMap = new Map();   // vin → objeto
    const pendentesMap = {};         // comprador_id → pendente
    const vinsRegistrados = new Set();

    for (const msg of todasMsgs) {
      if (msg.author.id !== client.user.id) continue;
      const texto = _extrairTexto(msg.components || []);
      const parsed = _parseDataLine(texto);
      if (!parsed) continue;

      const { tipo, dados } = parsed;

      if (tipo === 'VEICULO') {
        const veiculo = {
          ...dados,
          ativo: true,
          historico_proprietarios: dados.historico_proprietarios || [{ id: dados.comprador_id, desde: msg.createdTimestamp }],
          data_registro: dados.data_registro || msg.createdTimestamp,
        };
        veiculosMap.set(dados.vin, veiculo);
        vinsRegistrados.add(dados.vin);
      }

      if (tipo === 'TRANSFERENCIA' && veiculosMap.has(dados.vin)) {
        const v = veiculosMap.get(dados.vin);
        v.comprador_id = dados.novo;
        v.historico_proprietarios = [
          ...(v.historico_proprietarios || []),
          { id: dados.novo, desde: msg.createdTimestamp },
        ];
      }

      if (tipo === 'PENDENTE' && dados.comprador_id) {
        if (!vinsRegistrados.has(dados.vin)) {
          const { comprador_id, ...resto } = dados;
          pendentesMap[comprador_id] = resto;
        }
      }
    }

    // Grava no banco
    let veiculosSalvos = 0;
    for (const veiculo of veiculosMap.values()) {
      await db.adicionarVeiculo(veiculo);
      veiculosSalvos++;
    }

    let pendentesSalvos = 0;
    for (const [comprador_id, pendente] of Object.entries(pendentesMap)) {
      await db.setPendente(comprador_id, pendente);
      pendentesSalvos++;
    }

    console.log(`[recovery] Reconstruído: ${veiculosSalvos} veículo(s), ${pendentesSalvos} pendente(s).`);
    return { veiculos: veiculosSalvos, pendentes: pendentesSalvos };
  } catch (err) {
    console.error('[recovery] Falha ao reconstruir do canal:', err.message);
    return { veiculos: 0, pendentes: 0 };
  }
}

module.exports = { logRegistro, logTransferencia, logEdicaoFoto, logDeploy, logPendente, logApagouRegistro, logCotacao, logComissao, reconstruirDoCanal };
