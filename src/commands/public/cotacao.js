const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { cargoAtendente, cores, emojis: e } = require('../../config/config');
const { setCotacao } = require('../../services/database/db');
const { logCotacao } = require('../../services/auditoria');
const { normalizarValor } = require('../../utils/valorParser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cotacao')
    .setDescription('Registra a cotação de um veículo na concessionária.')
    .addStringOption(o =>
      o.setName('valor').setDescription('Valor cotado (ex: $10.000)').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('observacao').setDescription('Observação opcional (modelo, versão, etc)').setRequired(false)
    ),

  async execute(interaction) {
    if (cargoAtendente && !interaction.member.roles.cache.has(cargoAtendente)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para registrar cotações.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const valorStr = interaction.options.getString('valor');
    const obs = interaction.options.getString('observacao') || null;
    const valorCentavos = normalizarValor(valorStr);

    if (!valorCentavos) {
      return interaction.reply({
        content: '❌ Valor inválido. Use o formato `$10.000` ou `$10,000`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const valorFormatado = `$${(valorCentavos / 100).toLocaleString('pt-BR')}`;
    const topicoId = interaction.channelId;

    await interaction.deferReply();

    const { carro, infoAlt, seta, dot, rpc2, rpw } = e || {};

    const msgPayload = {
      flags: MessageFlags.IsComponentsV2,
      components: [{
        type: 17,
        accent_color: cores.amarelo,
        components: [
          {
            type: 10,
            content:
              `## ${infoAlt} COTAÇÃO DE VEÍCULO\n` +
              `-# Emitida por <@${interaction.user.id}>`,
          },
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content:
              `## ${carro} ${seta} Valor\n` +
              `> ${dot} **Valor cotado:** ${valorFormatado}\n` +
              (obs ? `> ${rpw} **Observação:** ${obs}\n` : '') +
              `-# Esta cotação é válida enquanto este tópico estiver ativo.`,
          },
        ],
      }],
    };

    const msg = await interaction.editReply(msgPayload);

    // Salva cotação vinculada ao tópico + message_id para rastrear deleção
    setCotacao(topicoId, {
      message_id: msg.id,
      atendente_id: interaction.user.id,
      valor_centavos: valorCentavos,
      valor_str: valorFormatado,
      obs,
      data: Date.now(),
    });

    // Log na auditoria
    logCotacao(interaction.client, {
      atendenteId: interaction.user.id,
      topicoId,
      topicoNome: interaction.channel?.name || topicoId,
      valor: valorFormatado,
      obs,
    }).catch(() => {});
  },
};
