const { MessageFlags } = require('discord.js');
const { canalAuditoriaId, cores, emojis: e } = require('../config/config');

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
      text(`-# Log gerado automaticamente · ${ts()}`),
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
        `-# Log gerado automaticamente · ${ts()}`
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
        `-# PENDENTE_JSON:${JSON.stringify({ comprador_id, ...pendente })}`
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

module.exports = { logRegistro, logTransferencia, logEdicaoFoto, logDeploy, logPendente, logApagouRegistro };
