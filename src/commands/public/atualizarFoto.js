const { SlashCommandBuilder } = require('discord.js');
const { canalRegistroVeicularId } = require('../../config/config');
const { buscarVeiculoPorPlaca, atualizarVeiculo } = require('../../services/database/db');
const { msgRegistroOficial } = require('../../utils/formatter');
const { logEdicaoFoto } = require('../../services/auditoria');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('atualizar_foto')
    .setDescription('Substitui a foto do seu veículo no registro oficial.')
    .addStringOption(o =>
      o.setName('placa').setDescription('Placa do veículo').setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName('nova_foto').setDescription('Nova foto do veículo com a placa visível').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const placa = interaction.options.getString('placa');
    const novaFoto = interaction.options.getAttachment('nova_foto');

    const veiculo = buscarVeiculoPorPlaca(placa);

    if (!veiculo) {
      return interaction.editReply({ content: `❌ Nenhum veículo ativo encontrado com a placa **${placa}**.` });
    }

    if (veiculo.comprador_id !== interaction.user.id) {
      return interaction.editReply({ content: '❌ Você não é o proprietário registrado deste veículo.' });
    }

    // Apaga mensagem de registro anterior, se existir
    if (veiculo.link_registro) {
      try {
        const { channelId, messageId } = require('../../utils/valorParser').parsearUrlDiscord(veiculo.link_registro);
        const canalAnt = await interaction.client.channels.fetch(channelId);
        const msgAntiga = await canalAnt.messages.fetch(messageId);
        await msgAntiga.delete();
      } catch {
        // Mensagem já apagada ou sem permissão — segue em frente
      }
    }

    const fotoAntiga = veiculo.foto_url;

    // Atualiza foto no banco
    await atualizarVeiculo(veiculo.vin, { foto_url: novaFoto.url });

    // Publica novo registro com foto atualizada
    const veiculoAtualizado = { ...veiculo, foto_url: novaFoto.url };
    const canal = await interaction.client.channels.fetch(canalRegistroVeicularId);
    const msgNova = await canal.send(msgRegistroOficial(veiculoAtualizado));

    const linkNovo = `https://discord.com/channels/${interaction.guildId}/${canal.id}/${msgNova.id}`;
    await atualizarVeiculo(veiculo.vin, { link_registro: linkNovo });

    await logEdicaoFoto(interaction.client, {
      veiculo,
      editorId: interaction.user.id,
      fotoAntiga,
      fotoNova: novaFoto.url,
    });

    await interaction.editReply({
      content: `✅ Foto do veículo **${placa}** atualizada com sucesso!\n🔗 ${linkNovo}`,
    });
  },
};
