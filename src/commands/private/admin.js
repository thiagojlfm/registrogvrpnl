const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  buscarVeiculoPorPlaca,
  buscarVeiculoPorVin,
  atualizarVeiculo,
  removerVeiculo,
  getPendente,
  removerPendente,
  adicionarVeiculo,
} = require('../../services/database/db');
const { gerarVin } = require('../../utils/vinGenerator');
const { canalRegistroVeicularId } = require('../../config/config');
const { msgRegistroOficial } = require('../../utils/formatter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin_veiculo')
    .setDescription('Administração de veículos (staff only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('forcar_registro')
        .setDescription('Força o registro de um veículo para um usuário que tem importação pendente.')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário com pendente').setRequired(true))
        .addStringOption(o => o.setName('placa').setDescription('Placa').setRequired(true))
        .addStringOption(o => o.setName('cor').setDescription('Cor').setRequired(true))
        .addStringOption(o =>
          o.setName('tipo')
            .setDescription('Tipo de registro')
            .setRequired(true)
            .addChoices(
              { name: 'Pessoal', value: 'pessoal' },
              { name: 'Empresarial', value: 'empresarial' }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('deletar')
        .setDescription('Marca um veículo como inativo (soft delete) pela placa ou VIN.')
        .addStringOption(o => o.setName('placa').setDescription('Placa do veículo').setRequired(false))
        .addStringOption(o => o.setName('vin').setDescription('VIN do veículo').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('transferir_forcado')
        .setDescription('Força transferência de veículo independente do proprietário atual.')
        .addStringOption(o => o.setName('placa').setDescription('Placa').setRequired(true))
        .addUserOption(o => o.setName('novo_proprietario').setDescription('Novo dono').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('limpar_pendente')
        .setDescription('Remove a importação pendente de um usuário.')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('gerar_vin')
        .setDescription('Gera um novo VIN único (apenas para consulta).')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    // ── forcar_registro ─────────────────────────────────────────────────────
    if (sub === 'forcar_registro') {
      const usuario = interaction.options.getUser('usuario');
      const placa = interaction.options.getString('placa');
      const cor = interaction.options.getString('cor');
      const tipo = interaction.options.getString('tipo');

      const pendente = getPendente(usuario.id);
      if (!pendente) {
        return interaction.editReply({ content: `❌ Nenhuma importação pendente para <@${usuario.id}>.` });
      }

      const agora = Date.now();
      const veiculo = {
        vin: pendente.vin,
        comprador_id: usuario.id,
        importador_id: pendente.importador_id,
        veiculo: pendente.veiculo,
        modelo: pendente.modelo,
        cor,
        placa,
        classe: null,
        obs: pendente.obs,
        comprovante: pendente.comprovante,
        valor_pago: pendente.valor_pago,
        foto_url: null,
        link_registro: null,
        tipo,
        empresa: null,
        empresa_link: null,
        historico_proprietarios: [{ id: usuario.id, desde: agora }],
        data_registro: agora,
        ativo: true,
      };

      adicionarVeiculo(veiculo);
      removerPendente(usuario.id);

      const canal = await interaction.client.channels.fetch(canalRegistroVeicularId);
      const msgPublicada = await canal.send(msgRegistroOficial(veiculo));
      const link = `https://discord.com/channels/${interaction.guildId}/${canal.id}/${msgPublicada.id}`;
      atualizarVeiculo(pendente.vin, { link_registro: link });

      return interaction.editReply({ content: `✅ Veículo registrado para <@${usuario.id}>.\n🔗 ${link}` });
    }

    // ── deletar ─────────────────────────────────────────────────────────────
    if (sub === 'deletar') {
      const placa = interaction.options.getString('placa');
      const vin = interaction.options.getString('vin');

      if (!placa && !vin) {
        return interaction.editReply({ content: '❌ Informe a **placa** ou o **VIN**.' });
      }

      let veiculo = placa ? buscarVeiculoPorPlaca(placa) : buscarVeiculoPorVin(vin);
      if (!veiculo) {
        return interaction.editReply({ content: '❌ Veículo não encontrado.' });
      }

      removerVeiculo(veiculo.vin);
      return interaction.editReply({ content: `✅ Veículo **${veiculo.placa}** (VIN: ${veiculo.vin}) marcado como inativo.` });
    }

    // ── transferir_forcado ───────────────────────────────────────────────────
    if (sub === 'transferir_forcado') {
      const placa = interaction.options.getString('placa');
      const novoProprietario = interaction.options.getUser('novo_proprietario');

      const veiculo = buscarVeiculoPorPlaca(placa);
      if (!veiculo) {
        return interaction.editReply({ content: `❌ Veículo com placa **${placa}** não encontrado.` });
      }

      const historico = [...veiculo.historico_proprietarios, { id: novoProprietario.id, desde: Date.now() }];
      atualizarVeiculo(veiculo.vin, { comprador_id: novoProprietario.id, historico_proprietarios: historico });

      return interaction.editReply({
        content: `✅ Veículo **${placa}** transferido para <@${novoProprietario.id}> (força admin).`,
      });
    }

    // ── limpar_pendente ──────────────────────────────────────────────────────
    if (sub === 'limpar_pendente') {
      const usuario = interaction.options.getUser('usuario');
      const pendente = getPendente(usuario.id);
      if (!pendente) {
        return interaction.editReply({ content: `❌ Nenhum pendente encontrado para <@${usuario.id}>.` });
      }
      removerPendente(usuario.id);
      return interaction.editReply({ content: `✅ Pendente de <@${usuario.id}> removido (VIN: ${pendente.vin}).` });
    }

    // ── gerar_vin ────────────────────────────────────────────────────────────
    if (sub === 'gerar_vin') {
      const vin = gerarVin();
      return interaction.editReply({ content: `🔢 VIN gerado (não reservado): \`${vin}\`` });
    }
  },
};
