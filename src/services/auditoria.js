const { MessageFlags } = require('discord.js');
const { canalAuditoriaId, cores, emojis: em } = require('../config/config');

function ts() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function logAuditoria(client, payload) {
  if (!canalAuditoriaId) return;
  try {
    const canal = await client.channels.fetch(canalAuditoriaId);
    await canal.send(payload);
  } catch (e) {
    console.error('[auditoria] Erro ao postar log:', e.message);
  }
}

async function logRegistro(client, { veiculo, registradorId, linkRegistro }) {
  await logAuditoria(client, {
    flags: MessageFlags.IsComponentsV2,
    components: [{
      type: 17,
      accent_color: cores.verde,
      components: [
        {
          type: 10,
          content:
            `## ${em.sim} REGISTRO\n` +
            `> ${em.dot} **Proprietário:** <@${registradorId}>\n` +
            `> ${em.rpc2} **Veículo:** ${veiculo.veiculo} ${veiculo.modelo || ''}\n` +
            `> ${em.rpw} **Placa:** \`${veiculo.placa}\`\n` +
            `> ${em.rpc} **VIN:** \`${veiculo.vin}\`\n` +
            `> ${em.dot} **Registro:** ${linkRegistro}\n` +
            `-# ${ts()}`,
        },
      ],
    }],
  });
}

async function logTransferencia(client, { veiculo, exProprietarioId, novoProprietarioId, comprovante }) {
  await logAuditoria(client, {
    flags: MessageFlags.IsComponentsV2,
    components: [{
      type: 17,
      accent_color: cores.amarelo,
      components: [
        {
          type: 10,
          content:
            `## ${em.vendido} TRANSFERÊNCIA\n` +
            `> ${em.rpc2} **Veículo:** ${veiculo.veiculo} ${veiculo.modelo || ''}\n` +
            `> ${em.rpw} **Placa:** \`${veiculo.placa}\`\n` +
            `> ${em.rpc} **VIN:** \`${veiculo.vin}\`\n` +
            `> ${em.dot} **Vendedor:** <@${exProprietarioId}>\n` +
            `> ${em.dot} **Comprador:** <@${novoProprietarioId}>\n` +
            `> ${em.dot} **Comprovante:** ${comprovante}\n` +
            (veiculo.link_registro ? `> ${em.dot} **Registro:** ${veiculo.link_registro}\n` : '') +
            `-# ${ts()}`,
        },
      ],
    }],
  });
}

async function logEdicaoFoto(client, { veiculo, editorId, fotoAntiga, fotoNova }) {
  await logAuditoria(client, {
    flags: MessageFlags.IsComponentsV2,
    components: [{
      type: 17,
      accent_color: cores.azul,
      components: [
        {
          type: 10,
          content:
            `## ${em.info} EDIÇÃO DE FOTO\n` +
            `> ${em.dot} **Editado por:** <@${editorId}>\n` +
            `> ${em.rpc2} **Veículo:** ${veiculo.veiculo} ${veiculo.modelo || ''}\n` +
            `> ${em.rpw} **Placa:** \`${veiculo.placa}\`\n` +
            `> ${em.rpc} **VIN:** \`${veiculo.vin}\`\n` +
            (fotoAntiga ? `> ${em.dot} **Foto anterior:** [Ver](${fotoAntiga})\n` : '') +
            `> ${em.dot} **Nova foto:** [Ver](${fotoNova})\n` +
            `-# ${ts()}`,
        },
      ],
    }],
  });
}

async function logDeploy(client, { novos, removidos }) {
  if (novos === 0 && removidos === 0) return;
  await logAuditoria(client, {
    flags: MessageFlags.IsComponentsV2,
    components: [{
      type: 17,
      accent_color: cores.azul,
      components: [
        {
          type: 10,
          content:
            `## 🔄 SYNC NO DEPLOY\n` +
            `> ${em.dot} **Novos importados:** ${novos}\n` +
            `> ${em.dot} **Removidos (reg apagado):** ${removidos}\n` +
            `-# ${ts()}`,
        },
      ],
    }],
  });
}

module.exports = { logRegistro, logTransferencia, logEdicaoFoto, logDeploy };
