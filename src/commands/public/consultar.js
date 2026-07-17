const { SlashCommandBuilder, MessageFlags } = require('discord.js');
// flags: IsComponentsV2 | Ephemeral
const REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const { buscarVeiculoPorPlaca, buscarVeiculosPorProprietario } = require('../../services/database/db');
const { msgConsulta } = require('../../utils/formatter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('consultar_veiculo')
    .setDescription('Consulta veículos por placa ou proprietário.')
    .addStringOption(o =>
      o.setName('placa').setDescription('Placa do veículo').setRequired(false)
    )
    .addUserOption(o =>
      o.setName('pessoa').setDescription('Proprietário do veículo').setRequired(false)
    ),

  async execute(interaction) {
    const placa = interaction.options.getString('placa');
    const pessoa = interaction.options.getUser('pessoa');

    if (!placa && !pessoa) {
      return interaction.reply({
        content: '❌ Informe ao menos uma **placa** ou uma **pessoa** para consultar.',
        flags: MessageFlags.Ephemeral,
      });
    }

    let veiculos = [];

    if (placa) {
      const v = buscarVeiculoPorPlaca(placa);
      if (v) veiculos.push(v);
    } else {
      veiculos = buscarVeiculosPorProprietario(pessoa.id);
    }

    if (veiculos.length === 0) {
      return interaction.reply({
        content: '🔍 Nenhum veículo encontrado com os critérios informados.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const msg = msgConsulta(veiculos, pessoa?.id);
    await interaction.reply({ ...msg, flags: REPLY_FLAGS });
  },
};
