const { SlashCommandBuilder } = require('discord.js');
const { canalRegistroVeicularId } = require('../../config/config');
const { buscarVeiculoPorPlaca, atualizarVeiculo } = require('../../services/database/db');
const { msgTransferencia } = require('../../utils/formatter');
const { notificar911 } = require('../../services/notificar911');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transferir_veiculo')
    .setDescription('Transfere a propriedade de um veículo para outro usuário.')
    .addStringOption(o =>
      o.setName('placa').setDescription('Placa do veículo').setRequired(true)
    )
    .addUserOption(o =>
      o.setName('novo_proprietario').setDescription('Usuário que receberá o veículo').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('comprovante').setDescription('Link do comprovante da transação').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const placa = interaction.options.getString('placa');
    const novoProprietario = interaction.options.getUser('novo_proprietario');
    const comprovante = interaction.options.getString('comprovante');

    const veiculo = buscarVeiculoPorPlaca(placa);
    if (!veiculo) {
      return interaction.editReply({ content: `❌ Nenhum veículo ativo encontrado com a placa **${placa}**.` });
    }

    if (veiculo.comprador_id !== interaction.user.id) {
      return interaction.editReply({ content: '❌ Você não é o proprietário registrado deste veículo.' });
    }

    if (novoProprietario.id === interaction.user.id) {
      return interaction.editReply({ content: '❌ Você não pode transferir o veículo para si mesmo.' });
    }

    const agora = Date.now();
    const exProprietarioId = veiculo.comprador_id;

    const historicoAtualizado = [
      ...veiculo.historico_proprietarios,
      { id: novoProprietario.id, desde: agora },
    ];

    atualizarVeiculo(veiculo.vin, {
      comprador_id: novoProprietario.id,
      historico_proprietarios: historicoAtualizado,
    });

    const canal = await interaction.client.channels.fetch(canalRegistroVeicularId);
    await canal.send(
      msgTransferencia({
        v: veiculo,
        exProprietarioId,
        novoProprietarioId: novoProprietario.id,
        comprovante,
      })
    );

    await notificar911(interaction.client, {
      tipo: 'transferencia',
      discord_id: novoProprietario.id,
      placa: veiculo.placa,
      vin: veiculo.vin,
      modelo: `${veiculo.veiculo} ${veiculo.modelo}`,
    });

    await interaction.editReply({
      content: `✅ Veículo **${veiculo.placa}** transferido com sucesso para <@${novoProprietario.id}>.`,
    });
  },
};
