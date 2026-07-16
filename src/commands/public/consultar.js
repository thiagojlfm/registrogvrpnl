const { SlashCommandBuilder } = require('discord.js');
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
        ephemeral: true,
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
        ephemeral: true,
      });
    }

    await interaction.reply({
      ...msgConsulta(veiculos, pessoa?.id),
      ephemeral: true,
    });
  },
};
