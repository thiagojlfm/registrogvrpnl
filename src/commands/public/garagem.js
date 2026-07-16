const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buscarVeiculosPorProprietario } = require('../../services/database/db');
const { cores, emojis: em } = require('../../config/config');
const { sincronizarCanal } = require('../../utils/syncCanal');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('garagem')
    .setDescription('Abre sua garagem e transfere um veículo para outro usuário.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    let veiculos = buscarVeiculosPorProprietario(interaction.user.id);

    // Se não achou nada, escaneia o canal e tenta de novo
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

    const components = [];

    // Cabeçalho da garagem
    components.push({
      type: 10,
      content:
        `## ${em.carro} GARAGEM — <@${interaction.user.id}>\n` +
        `-# ${veiculos.length} veículo(s) registrado(s) · Selecione um para transferir`,
    });
    components.push({ type: 14, divider: true, spacing: 1 });

    // Card por veículo
    for (const v of veiculos) {
      const data = new Date(v.data_registro).toLocaleDateString('pt-BR');

      const cardSection = {
        type: 9,
        components: [{
          type: 10,
          content:
            `### ${em.rpc2} ${v.veiculo}\n` +
            `> ${em.rpw} **Versão:** ${v.modelo || 'N/A'}\n` +
            `> ${em.rpw} **Placa:** \`${v.placa}\`\n` +
            `> ${em.rpw} **Classe:** ${v.classe || 'N/A'}\n` +
            `> ${em.rpc} **VIN:** \`${v.vin}\`\n` +
            `-# Registrado em ${data}`,
        }],
      };

      // Foto como thumbnail se disponível
      if (v.foto_url) {
        cardSection.accessory = { type: 11, media: { url: v.foto_url } };
      }

      components.push(cardSection);

      // Botões do card
      const botoes = [{
        type: 2,
        style: 4,
        label: 'Transferir',
        emoji: { id: '1499866159409922199' },
        custom_id: `btn_transferir:${v.vin}`,
      }];

      if (v.link_registro) {
        botoes.push({
          type: 2,
          style: 5,
          label: 'Ver registro',
          emoji: { id: '1480328653186400326' },
          url: v.link_registro,
        });
      }

      components.push({ type: 1, components: botoes });
      components.push({ type: 14, divider: true, spacing: 1 });
    }

    return interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [{
        type: 17,
        accent_color: cores.azul,
        components,
      }],
    });
  },
};
