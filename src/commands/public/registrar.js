const { SlashCommandBuilder } = require('discord.js');
const { canalRegistroVeicularId } = require('../../config/config');
const { getPendente, removerPendente, adicionarVeiculo, atualizarVeiculo } = require('../../services/database/db');
const { msgRegistroOficial } = require('../../utils/formatter');
const { notificar911 } = require('../../services/notificar911');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registrar_veiculo')
    .setDescription('Finaliza o registro oficial do seu veículo.')
    .addStringOption(o =>
      o.setName('placa').setDescription('Placa do veículo (ex: ABC-1234)').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('cor').setDescription('Cor do veículo').setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName('foto').setDescription('Foto do veículo com a placa visível').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('tipo')
        .setDescription('Tipo de registro')
        .setRequired(true)
        .addChoices(
          { name: 'Pessoal', value: 'pessoal' },
          { name: 'Empresarial', value: 'empresarial' }
        )
    )
    .addStringOption(o =>
      o.setName('classe')
        .setDescription('Classe do veículo')
        .setRequired(false)
        .addChoices(
          { name: 'Sports', value: 'Sports' },
          { name: 'Luxury', value: 'Luxury' },
          { name: 'Classic', value: 'Classic' },
          { name: 'Electric', value: 'Electric' },
          { name: 'Pickup / SUV', value: 'Pickup / SUV' },
          { name: 'Moto', value: 'Moto' },
        )
    )
    .addStringOption(o =>
      o.setName('comprovante_recompra').setDescription('Link do comprovante de recompra (veículo usado)').setRequired(false)
    )
    .addStringOption(o =>
      o.setName('empresa_nome').setDescription('Nome da empresa (se empresarial)').setRequired(false)
    )
    .addStringOption(o =>
      o.setName('empresa_link').setDescription('Link do registro da empresa (se empresarial)').setRequired(false)
    )
    .addStringOption(o =>
      o.setName('finalidade').setDescription('Finalidade da empresa (se empresarial)').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const pendente = getPendente(interaction.user.id);
    if (!pendente) {
      return interaction.editReply({
        content: '❌ Nenhuma venda ou importação pendente encontrada para o seu usuário.\nAguarde a autorização do atendente ou a confirmação da importação.',
      });
    }

    const placa = interaction.options.getString('placa');
    const cor = interaction.options.getString('cor');
    const foto = interaction.options.getAttachment('foto');
    const tipo = interaction.options.getString('tipo');
    const classe = interaction.options.getString('classe');
    const comprovanteRecompra = interaction.options.getString('comprovante_recompra');
    const empresaNome = interaction.options.getString('empresa_nome');
    const empresaLink = interaction.options.getString('empresa_link');
    const finalidade = interaction.options.getString('finalidade');

    if (tipo === 'empresarial' && (!empresaNome || !empresaLink)) {
      return interaction.editReply({ content: '❌ Para registro empresarial, informe **empresa_nome** e **empresa_link**.' });
    }

    const agora = Date.now();

    const veiculo = {
      vin: pendente.vin,
      comprador_id: interaction.user.id,
      importador_id: pendente.importador_id,
      veiculo: pendente.veiculo,
      modelo: pendente.modelo,
      cor,
      placa,
      classe: classe || null,
      obs: pendente.obs,
      link_cotacao: pendente.link_cotacao || null,
      comprovante: pendente.comprovante,
      comprovante_recompra: comprovanteRecompra || null,
      valor_pago: pendente.valor_pago,
      foto_url: foto.url,
      link_registro: null,
      tipo,
      empresa: empresaNome || null,
      empresa_link: empresaLink || null,
      finalidade: finalidade || null,
      historico_proprietarios: [{ id: interaction.user.id, desde: agora }],
      data_registro: agora,
      ativo: true,
    };

    adicionarVeiculo(veiculo);
    removerPendente(interaction.user.id);

    const canal = await interaction.client.channels.fetch(canalRegistroVeicularId);
    const msgPublicada = await canal.send(msgRegistroOficial(veiculo));

    const linkRegistro = `https://discord.com/channels/${interaction.guildId}/${canal.id}/${msgPublicada.id}`;
    atualizarVeiculo(pendente.vin, { link_registro: linkRegistro });

    await notificar911(interaction.client, {
      tipo: 'registro',
      discord_id: interaction.user.id,
      placa,
      vin: pendente.vin,
      modelo: `${pendente.veiculo} ${pendente.modelo}`.trim(),
    });

    await interaction.editReply({
      content: `✅ Veículo **${pendente.veiculo} ${pendente.modelo}** registrado com sucesso!\n🔗 ${linkRegistro}`,
    });
  },
};
