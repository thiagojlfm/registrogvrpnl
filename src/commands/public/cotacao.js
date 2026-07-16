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

    const moneyEmoji = '<:MoneyGVRPNL:1235408784155869205>';
    const valorDisplay = valorFormatado.replace('$', '');
    const msgPayload = {
      flags: MessageFlags.IsComponentsV2,
      components: [{
        type: 17,
        accent_color: cores.amarelo,
        components: [
          {
            type: 10,
            content:
              `# ${moneyEmoji} ${valorDisplay}\n` +
              (obs ? `> ${obs}\n` : '') +
              `-# Cotado por <@${interaction.user.id}>`,
          },
        ],
      }],
    };

    const msg = await interaction.editReply(msgPayload);

    // Salva cotação (auditoria_message_id adicionado após log)
    setCotacao(topicoId, {
      message_id: msg.id,
      atendente_id: interaction.user.id,
      valor_centavos: valorCentavos,
      valor_str: valorFormatado,
      obs,
      data: Date.now(),
    });

    // Log na auditoria — salva ID da msg para deletar se cotação for apagada
    const auditoriaId = await logCotacao(interaction.client, {
      atendenteId: interaction.user.id,
      topicoId,
      topicoNome: interaction.channel?.name || topicoId,
      valor: valorFormatado,
      obs,
    }).catch(() => null);

    if (auditoriaId) {
      setCotacao(topicoId, {
        message_id: msg.id,
        atendente_id: interaction.user.id,
        valor_centavos: valorCentavos,
        valor_str: valorFormatado,
        obs,
        data: Date.now(),
        auditoria_message_id: auditoriaId,
      });
    }
  },
};
