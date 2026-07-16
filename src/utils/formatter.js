const { MessageFlags } = require('discord.js');
const { cores, emojis: e } = require('../config/config');

const { carro, info, infoAlt, sim, empresa: emp, vendido, seta, dot, rpc2, rpw, rpc, check } = e ? e : {};

function text(content) { return { type: 10, content }; }
function sep() { return { type: 14, divider: true, spacing: 1 }; }
function mediaGallery(items) { return { type: 12, items: items.map(url => ({ media: { url } })) }; }
function container(accentColor, components) { return { type: 17, accent_color: accentColor, components }; }
function v2() { return MessageFlags.IsComponentsV2; }

// ── Importação registrada ─────────────────────────────────────────────────────

function msgImportacaoRegistrada({ compradorId, veiculo, modelo, vin }) {
  return {
    flags: v2(),
    components: [
      container(cores.verde, [
        text(
          `## ${sim} IMPORTAÇÃO REGISTRADA\n` +
          `> **Comprador:** <@${compradorId}>\n` +
          `> **Veículo:** ${veiculo} ${modelo}\n` +
          `> **VIN:** \`${vin}\``
        ),
        sep(),
        text(`Use **/registrar_veiculo** com sua placa, cor e foto para finalizar o registro oficial do veículo.`),
      ]),
    ],
  };
}

// ── Registro oficial ──────────────────────────────────────────────────────────

function msgRegistroOficial(v) {
  const data = new Date(v.data_registro).toLocaleDateString('pt-BR');
  const modelo = v.modelo || '';
  const components = [];

  // Cabeçalho
  components.push(text(`## ${carro} VEÍCULO REGISTRADO`));
  components.push(sep());

  // Seção empresarial
  if (v.tipo === 'empresarial') {
    components.push(text(
      `## ${emp} ${seta} Veículo Empresarial\n` +
      `> ${dot} **Nome da empresa:** ${v.empresa || 'N/A'}\n` +
      `> ${dot} **Link do registro da empresa:** ${v.empresa_link || 'N/A'}\n` +
      `> ${dot} **Finalidade:** ${v.finalidade || 'N/A'}`
    ));
    components.push(sep());
  }

  // Seção pessoal
  const historico = v.historico_proprietarios || [];
  // historico acumula cada novo dono; dono original não está no array
  // totalDonos = 1 (original) + histórico de transferências
  const totalDonos = 1 + historico.length;
  const exPropId = v._ex_proprietario_id
    || (historico.length >= 2 ? historico[historico.length - 2].id : null);
  const exProp = exPropId ? `<@${exPropId}>` : 'N/A';
  const donosLabel = totalDonos === 1
    ? '1º dono'
    : `${totalDonos}º dono — passou por ${totalDonos} proprietário(s)`;
  components.push(text(
    `## ${carro} ${seta} Veículo ${v.tipo === 'empresarial' ? 'Empresarial' : 'Pessoal'}\n` +
    `> ${dot} **Proprietário atual:** <@${v.comprador_id}>\n` +
    `> ${dot} **Ex-proprietário:** ${exProp}\n` +
    `-# ${vendido} ${donosLabel}`
  ));
  components.push(sep());

  // Informações do veículo
  components.push(text(
    `## ${info} ${seta} **Informações do veículo**\n` +
    `> ${rpc2} **Ano, marca, modelo:** ${v.veiculo}\n` +
    `> ${rpw} **Versão:** ${modelo || 'N/A'}\n` +
    `> ${rpw} **Coloração:** ${v.cor}\n` +
    `> ${rpw} **Classe:** ${v.classe || 'N/A'}\n` +
    (v.categoria ? `> ${rpw} **Categoria:** ${v.categoria}\n` : '') +
    `> ${rpw} **Placa:** ${v.placa}\n` +
    `> ${rpc} **VIN Number:** ${v.vin}`
  ));
  components.push(sep());

  // Pagamentos
  components.push(text(
    `## ${infoAlt} ${seta} Pagamentos\n` +
    `> ${dot} **Comprovante de Cotação/Orçamento:** ${v.link_cotacao || 'N/A'}\n` +
    `> ${dot} **Comprovante de Pagamento:** ${v.comprovante || 'N/A'}\n` +
    `> ${dot} **Comprovante de Recompra (Usado):** ${v.comprovante_recompra || 'N/A'}\n` +
    `> ${dot} **Foto do veículo com placa visível:** ${v.foto_url ? `[Ver foto](${v.foto_url})` : 'N/A'}`
  ));

  // Foto
  if (v.foto_url) {
    components.push(sep());
    components.push(mediaGallery([v.foto_url]));
  }

  components.push(sep());
  components.push(text(`-# Registro gerado automaticamente · ${data}`));

  return {
    flags: v2(),
    components: [container(cores.azul, components)],
  };
}

// ── Transferência ─────────────────────────────────────────────────────────────

function msgTransferencia({ v, exProprietarioId, novoProprietarioId, comprovante }) {
  const data = new Date().toLocaleString('pt-BR');
  return {
    flags: v2(),
    components: [
      container(cores.amarelo, [
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
          `> ${dot} **Comprovante:** ${comprovante}`
        ),
        sep(),
        text(`-# Transferência registrada em ${data}`),
      ]),
    ],
  };
}

// ── Confirmação de transferência (reply para o usuário) ───────────────────────

function msgConfirmacaoTransferencia({ veiculo: v, exProprietarioId, novoProprietarioId, comprovante }) {
  const data = new Date().toLocaleString('pt-BR');
  const historico = v.historico_proprietarios || [];
  const totalDonos = historico.length + 1;
  const donosLabel = totalDonos === 1 ? '1º dono' : `${totalDonos}º dono — passou por ${totalDonos} proprietário(s)`;

  return {
    flags: v2(),
    components: [
      container(cores.amarelo, [
        text(
          `## ${vendido} TRANSFERÊNCIA CONCLUÍDA\n` +
          `-# Propriedade registrada com sucesso`
        ),
        sep(),
        text(
          `## ${carro} ${seta} ${v.veiculo}${v.modelo ? ` ${v.modelo}` : ''}\n` +
          `> ${rpw} **Placa:** \`${v.placa}\`\n` +
          `> ${rpc} **VIN:** \`${v.vin}\``
        ),
        sep(),
        text(
          `## ${infoAlt} ${seta} Mudança de proprietário\n` +
          `> ${dot} **Vendedor:** <@${exProprietarioId}>\n` +
          `> ${dot} **Comprador:** <@${novoProprietarioId}>\n` +
          `> ${dot} **Comprovante:** ${comprovante}`
        ),
        sep(),
        text(`-# ${vendido} ${donosLabel} · ${data}`),
      ]),
    ],
  };
}

// ── Consulta ──────────────────────────────────────────────────────────────────

function msgConsulta(veiculos, pessoa) {
  const linhas = veiculos.map(v => {
    const data = new Date(v.data_registro).toLocaleDateString('pt-BR');
    return (
      `> ${carro} **${v.veiculo} ${v.modelo || ''}** | Placa: \`${v.placa}\` | VIN: \`${v.vin}\`\n` +
      `> ${rpw} Cor: ${v.cor} | Classe: ${v.classe || 'N/A'} | Registrado em: ${data}`
    );
  });

  return {
    flags: v2(),
    components: [
      container(cores.azul, [
        text(
          `## 🔍 CONSULTA VEICULAR\n` +
          (pessoa ? `> **Proprietário:** <@${pessoa}>\n` : '')
        ),
        sep(),
        text(linhas.join('\n')),
        sep(),
        text(`-# ${veiculos.length} veículo(s) encontrado(s)`),
      ]),
    ],
  };
}

module.exports = {
  msgImportacaoRegistrada,
  msgRegistroOficial,
  msgTransferencia,
  msgConfirmacaoTransferencia,
  msgConsulta,
};
