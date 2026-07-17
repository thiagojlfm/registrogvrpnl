const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { canalRegistroVeicularId, cores } = require('../../config/config');
const { substituirVeiculoBonus, podeTrocarBonus, setBonusCooldown } = require('../../services/database/db');
const { msgRegistroBonus } = require('../../utils/formatter');
const { gerarVin } = require('../../utils/vinGenerator');
const { logRegistro } = require('../../services/auditoria');

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

function formatarRestante(ms) {
  const horas = Math.floor(ms / 3_600_000);
  const dias  = Math.floor(horas / 24);
  const hRest = horas % 24;
  return dias > 0 ? `${dias}d ${hRest}h` : `${horas}h`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registroveiculobonus')
    .setDescription('Registra veículo de benefício (Staff ou Boost).')
    .addStringOption(o =>
      o.setName('tipo')
        .setDescription('Tipo do benefício')
        .setRequired(true)
        .addChoices(
          { name: '🛡️ Staff', value: 'staff' },
          { name: '🚀 Boost', value: 'boost' },
        )
    )
    .addStringOption(o =>
      o.setName('carro').setDescription('Ano, marca e modelo (ex: 2021 Ferrari SF90)').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('placa').setDescription('Placa do veículo (ex: GVR-1234)').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('cor').setDescription('Cor do veículo').setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName('foto').setDescription('Foto do veículo com a placa visível').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('modelo').setDescription('Versão / trim (ex: Stradale)').setRequired(false)
    ),

  async execute(interaction) {
    const tipo = interaction.options.getString('tipo');

    // Verifica cooldown de 7 dias
    const { pode, restante } = podeTrocarBonus(interaction.user.id, tipo);
    if (!pode) {
      return interaction.reply({
        content: `⏳ Você só pode trocar seu veículo de ${tipo === 'staff' ? 'Staff' : 'Boost'} em **${formatarRestante(restante)}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    const carroStr = interaction.options.getString('carro');
    const modelo   = interaction.options.getString('modelo') || null;
    const placa    = interaction.options.getString('placa');
    const cor      = interaction.options.getString('cor');
    const foto     = interaction.options.getAttachment('foto');

    const vin = gerarVin();
    const agora = Date.now();

    const veiculo = {
      vin,
      comprador_id: interaction.user.id,
      importador_id: null,
      veiculo: carroStr,
      modelo,
      cor,
      placa,
      classe: null,
      categoria: null,
      obs: null,
      link_cotacao: null,
      comprovante: null,
      comprovante_recompra: null,
      valor_pago: null,
      foto_url: foto.url,
      link_registro: null,
      tipo: 'pessoal',
      tipo_bonus: tipo,
      empresa: null,
      empresa_link: null,
      finalidade: null,
      historico_proprietarios: [],
      data_registro: agora,
      ativo: true,
    };

    // Posta primeiro — só persiste se o send tiver sucesso
    const canal = await interaction.client.channels.fetch(canalRegistroVeicularId);
    const msgPublicada = await canal.send(msgRegistroBonus(veiculo));
    const linkRegistro = `https://discord.com/channels/${interaction.guildId}/${canal.id}/${msgPublicada.id}`;

    // Operação atômica: desativa anterior + adiciona novo em único write
    await substituirVeiculoBonus(interaction.user.id, tipo, { ...veiculo, link_registro: linkRegistro });
    await setBonusCooldown(interaction.user.id, tipo);

    await logRegistro(interaction.client, {
      veiculo: { ...veiculo, link_registro: linkRegistro },
      registradorId: interaction.user.id,
      linkRegistro,
    });

    const cor_embed = tipo === 'staff' ? cores.roxo : cores.rosa;
    const tag = tipo === 'staff' ? '🛡️ Carro Staff' : '🚀 Carro Boost';

    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [{
        type: 17,
        accent_color: cor_embed,
        components: [
          {
            type: 10,
            content:
              `## ✅ ${tag} REGISTRADO\n` +
              `> **Veículo:** ${carroStr}${modelo ? ` ${modelo}` : ''}\n` +
              `> **Placa:** \`${placa}\`\n` +
              `> **VIN:** \`${vin}\``,
          },
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content: `⏳ Próxima troca disponível em **7 dias**.\n[Ver registro](${linkRegistro})`,
          },
        ],
      }],
    });

    // DM de boas-vindas ao usuário
    const nomeVeiculo = `${carroStr}${modelo ? ` ${modelo}` : ''}`;
    const dmTexto = tipo === 'staff'
      ? [
          `🛡️ **Bem-vindo ao time, ${interaction.user.displayName}!**`,
          ``,
          `Seu veículo de Staff foi registrado com sucesso no **GVRPNL**.`,
          ``,
          `> 🚗 **${nomeVeiculo}**`,
          `> 🔖 Placa: \`${placa}\``,
          `> 🔑 VIN: \`${vin}\``,
          ``,
          `Como membro da equipe, você tem direito a **1 veículo de Staff** que pode ser trocado a cada **7 dias**.`,
          ``,
          `[Ver registro oficial](${linkRegistro})`,
        ].join('\n')
      : [
          `🚀 **Obrigado por impulsionar o GVRPNL, ${interaction.user.displayName}!**`,
          ``,
          `Seu veículo Booster foi registrado com sucesso. Esse é nosso agradecimento pelo seu apoio ao servidor. 💜`,
          ``,
          `> 🚗 **${nomeVeiculo}**`,
          `> 🔖 Placa: \`${placa}\``,
          `> 🔑 VIN: \`${vin}\``,
          ``,
          `Você pode trocar seu veículo Boost a cada **7 dias**.`,
          ``,
          `[Ver registro oficial](${linkRegistro})`,
        ].join('\n');

    try {
      const dm = await interaction.user.createDM();
      await dm.send(dmTexto);
    } catch {
      // DMs fechadas — sem problema, o registro já foi feito
    }
  },
};
