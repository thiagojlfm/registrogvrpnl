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
    const gvnlEmoji  = '<:GVNL:1391202082920595556>';
    const valorDisplay = valorFormatado.replace('$', '');
    const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const msgPayload = {
      flags: MessageFlags.IsComponentsV2,
      components: [{
        type: 17,
        accent_color: 0x2B2D31,
        components: [
          { type: 10, content: `${gvnlEmoji} **ROADMAP RESALE MOTORS** · Cotação de Veículo` },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `${moneyEmoji} **${valorDisplay}** — valor cotado${obs ? `\n> ${obs}` : ''}` },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `-# Cotado por <@${interaction.user.id}> — ${hora}` },
        ],
      }],
    };

    const msg = await interaction.editReply(msgPayload);

    // Salva cotação (auditoria_message_id adicionado após log)
    await setCotacao(topicoId, {
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
      await setCotacao(topicoId, {
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
