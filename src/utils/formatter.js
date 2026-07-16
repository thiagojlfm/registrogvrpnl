const { MessageFlags } = require('discord.js');
const { cores, emojis } = require('../config/config');

// Components V2 helpers
function textDisplay(content) {
  return { type: 10, content };
}

function separator() {
  return { type: 14, divider: true, spacing: 1 };
}

function thumbnail(url) {
  return { type: 11, media: { url } };
}

function section(components, accessory) {
  const s = { type: 9, components };
  if (accessory) s.accessory = accessory;
  return s;
}

function mediaGallery(items) {
  return { type: 12, items: items.map(url => ({ media: { url } })) };
}

function container(accentColor, components) {
  return { type: 17, accent_color: accentColor, components };
}

function buildFlags() {
  return MessageFlags.IsComponentsV2;
}

// ─── Mensagens públicas ───────────────────────────────────────────────────────

function msgImportacaoRegistrada({ compradorId, veiculo, modelo, vin }) {
  return {
    flags: buildFlags(),
    components: [
      container(cores.verde, [
        textDisplay(
          `## ${emojis.sim} IMPORTAÇÃO REGISTRADA\n` +
          `> **Comprador:** <@${compradorId}>\n` +
          `> **Veículo:** ${veiculo} ${modelo}\n` +
          `> **VIN:** \`${vin}\``
        ),
        separator(),
        textDisplay(
          'Use **/registrar_veiculo** com sua placa, cor e foto para\nfinalizar o registro oficial do veículo.'
        ),
      ]),
    ],
  };
}

function msgRegistroOficial(v) {
  const data = new Date(v.data_registro).toLocaleDateString('pt-BR');

  const linhasProprietario = [
    `## ${emojis.carro} → Veículo ${v.tipo === 'empresarial' ? 'Empresarial' : 'Pessoal'}`,
    `> Proprietário: <@${v.comprador_id}>`,
    `> Ex-proprietário: N/A`,
  ];

  const linhasEmpresa = v.tipo === 'empresarial' ? [
    `## ${emojis.empresa} → Veículo Empresarial`,
    `> Nome da empresa: ${v.empresa}`,
    `> Link do registro: ${v.empresa_link}`,
  ] : [];

  const linhasInfo = [
    `## ${emojis.info} → Informações do veículo`,
    `> Ano, marca, modelo: ${v.veiculo}`,
    `> Versão: ${v.modelo}`,
    `> Coloração: ${v.cor}`,
    `> Placa: ${v.placa}`,
    `> VIN Number: ${v.vin}`,
  ];

  const linhasPagamento = [
    `## ${emojis.infoAlt} → Pagamentos`,
    `> Comprovante de Pagamento: ${v.comprovante}`,
    `> Valor pago: ${v.valor_pago}`,
  ];

  const components = [
    textDisplay(`## ${emojis.carro} VEÍCULO REGISTRADO`),
    separator(),
    textDisplay(linhasProprietario.join('\n')),
  ];

  if (linhasEmpresa.length) {
    components.push(separator(), textDisplay(linhasEmpresa.join('\n')));
  }

  components.push(
    separator(),
    textDisplay(linhasInfo.join('\n')),
    separator(),
    textDisplay(linhasPagamento.join('\n')),
  );

  if (v.foto_url) {
    components.push(separator(), mediaGallery([v.foto_url]));
  }

  components.push(
    separator(),
    textDisplay(`-# Registro gerado automaticamente · ${data}`)
  );

  return {
    flags: buildFlags(),
    components: [container(cores.azul, components)],
  };
}

function msgTransferencia({ v, exProprietarioId, novoProprietarioId, comprovante }) {
  const data = new Date().toLocaleDateString('pt-BR');
  return {
    flags: buildFlags(),
    components: [
      container(cores.amarelo, [
        textDisplay(
          `## ${emojis.vendido} TRANSFERÊNCIA DE VEÍCULO\n` +
          `> Veículo: ${v.veiculo} ${v.modelo}\n` +
          `> Placa: ${v.placa}\n` +
          `> VIN: ${v.vin}\n` +
          `> De: <@${exProprietarioId}>\n` +
          `> Para: <@${novoProprietarioId}>\n` +
          `> Comprovante: ${comprovante}`
        ),
        separator(),
        textDisplay(`-# Transferência registrada em ${data}`),
      ]),
    ],
  };
}

function msgConsulta(veiculos, pessoa) {
  const linhas = veiculos.map(v => {
    const data = new Date(v.data_registro).toLocaleDateString('pt-BR');
    return (
      `> 🚗 ${v.veiculo} ${v.modelo} | Placa: \`${v.placa}\` | VIN: \`${v.vin}\`\n` +
      `> Cor: ${v.cor} | Registrado em: ${data}`
    );
  });

  return {
    flags: buildFlags(),
    ephemeral: true,
    components: [
      container(cores.azul, [
        textDisplay(
          `## 🔍 CONSULTA VEICULAR\n` +
          (pessoa ? `> Proprietário: <@${pessoa}>\n` : '')
        ),
        separator(),
        textDisplay(linhas.join('\n') + '\n'),
        separator(),
        textDisplay(`-# ${veiculos.length} veículo(s) encontrado(s)`),
      ]),
    ],
  };
}

module.exports = {
  msgImportacaoRegistrada,
  msgRegistroOficial,
  msgTransferencia,
  msgConsulta,
};
