const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buscarVeiculosPorProprietario } = require('../../services/database/db');
const { cores, emojis: em } = require('../../config/config');
const { sincronizarCanal } = require('../../utils/syncCanal');

function buildCard(veiculos, idx, userId) {
  const v = veiculos[idx];
  const data = new Date(v.data_registro).toLocaleDateString('pt-BR');
  const total = veiculos.length;

  const components = [];

  // Cabeçalho
  components.push({
    type: 10,
    content:
      `## ${em.carro} GARAGEM — <@${userId}>\n` +
      `-# Veículo ${idx + 1} de ${total}`,
  });
  components.push({ type: 14, divider: true, spacing: 1 });

  // Card do veículo — com foto no canto direito se disponível
  const cardText = {
    type: 10,
    content:
      `### ${em.rpc2} ${v.veiculo}\n` +
      `> ${em.rpw} **Versão:** ${v.modelo || 'N/A'}\n` +
      `> ${em.rpw} **Placa:** \`${v.placa}\`\n` +
      `> ${em.rpw} **Classe:** ${v.classe || 'N/A'}\n` +
      `> ${em.rpc} **VIN:** \`${v.vin}\`\n` +
      `-# Registrado em ${data}`,
  };

  if (v.foto_url) {
    components.push({
      type: 9,
      components: [cardText],
      accessory: { type: 11, media: { url: v.foto_url } },
    });
  } else {
    components.push(cardText);
  }

  components.push({ type: 14, divider: true, spacing: 1 });

  // Linha 1: setas de navegação
  const navBotoes = [
    {
      type: 2,
      style: 2,
      label: '◀',
      custom_id: `btn_garagem_nav:${userId}:${idx - 1}`,
      disabled: idx === 0,
    },
    {
      type: 2,
      style: 2,
      label: '▶',
      custom_id: `btn_garagem_nav:${userId}:${idx + 1}`,
      disabled: idx === total - 1,
    },
  ];
  components.push({ type: 1, components: navBotoes });

  // Linha 2: ações do veículo
  const acaoBotoes = [{
    type: 2,
    style: 4,
    label: 'Transferir',
    emoji: { id: '1499866159409922199' },
    custom_id: `btn_transferir:${v.vin}`,
  }];

  if (v.link_registro) {
    acaoBotoes.push({
      type: 2,
      style: 5,
      label: 'Ver registro',
      emoji: { id: '1480328653186400326' },
      url: v.link_registro,
    });
  }

  components.push({ type: 1, components: acaoBotoes });

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [{
      type: 17,
      accent_color: cores.azul,
      components,
    }],
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('garagem')
    .setDescription('Abre sua garagem e transfere um veículo para outro usuário.'),

  buildCard,

  async execute(interaction) {
    await interaction.deferReply();

    let veiculos = buscarVeiculosPorProprietario(interaction.user.id);

    if (veiculos.length === 0) {
      await sincronizarCanal(interaction.client);
      veiculos = buscarVeiculosPorProprietario(interaction.user.id);
    }

    if (veiculos.length === 0) {
      return interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [{
          type: 17,
          accent_color: cores.vermelho,
          components: [
            { type: 10, content: `## ${em.vendido} GARAGEM VAZIA\n> Você não possui veículos registrados no seu nome.` },
          ],
        }],
      });
    }

    return interaction.editReply(buildCard(veiculos, 0, interaction.user.id));
  },
};
