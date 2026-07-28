const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  buscarVeiculoPorPlaca,
  buscarVeiculoPorVin,
  atualizarVeiculo,
  removerVeiculo,
  getPendente,
  removerPendente,
  adicionarVeiculo,
  salvarVeiculos,
  salvarPendentes,
  getBonusCooldown,
  setBonusCooldown,
} = require('../../services/database/db');
const fs = require('fs');
const path = require('path');
const { dbPath, canalAuditoriaId } = require('../../config/config');
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
    )
    .addSubcommand(sub =>
      sub
        .setName('sync_911')
        .setDescription('Envia todos os veículos ativos ao 911-bot via canal de integração.')
    )
    .addSubcommand(sub =>
      sub
        .setName('reset_bonus')
        .setDescription('Reseta o cooldown de veículo bônus de um usuário.')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
        .addStringOption(o =>
          o.setName('tipo')
            .setDescription('Tipo de bônus')
            .setRequired(true)
            .addChoices(
              { name: 'Boost', value: 'boost' },
              { name: 'Staff', value: 'staff' }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('corrigir')
        .setDescription('Solicita correção de um campo do registro ao dono do veículo.')
        .addStringOption(o => o.setName('placa').setDescription('Placa do veículo').setRequired(true))
        .addStringOption(o =>
          o.setName('campo')
            .setDescription('Campo a corrigir')
            .setRequired(true)
            .addChoices(
              { name: 'Versão', value: 'modelo' },
              { name: 'Cor', value: 'cor' },
              { name: 'Classe', value: 'classe' },
              { name: 'Placa', value: 'placa' },
              { name: 'Veículo (marca/ano)', value: 'veiculo' },
            )
        )
        .addStringOption(o => o.setName('orientacao').setDescription('Instrução para o membro').setRequired(true))
    ),

  async execute(interaction) {
    const { MessageFlags } = require('discord.js');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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

      await adicionarVeiculo(veiculo);
      await removerPendente(usuario.id);

      const canal = await interaction.client.channels.fetch(canalRegistroVeicularId);
      const msgPublicada = await canal.send(msgRegistroOficial(veiculo));
      const link = `https://discord.com/channels/${interaction.guildId}/${canal.id}/${msgPublicada.id}`;
      await atualizarVeiculo(pendente.vin, { link_registro: link });

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

      await removerVeiculo(veiculo.vin);
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
      await atualizarVeiculo(veiculo.vin, { comprador_id: novoProprietario.id, historico_proprietarios: historico });

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
      await removerPendente(usuario.id);
      return interaction.editReply({ content: `✅ Pendente de <@${usuario.id}> removido (VIN: ${pendente.vin}).` });
    }

    // ── gerar_vin ────────────────────────────────────────────────────────────
    if (sub === 'gerar_vin') {
      const vin = gerarVin();
      return interaction.editReply({ content: `🔢 VIN gerado (não reservado): \`${vin}\`` });
    }


    // ── reset_bonus ──────────────────────────────────────────────────────────
    if (sub === 'reset_bonus') {
      const { removerBonusCooldown, getBonusCooldown } = require('../../services/database/db');
      const usuario = interaction.options.getUser('usuario');
      const tipo = interaction.options.getString('tipo');
      const cooldown = getBonusCooldown(usuario.id, tipo);
      if (!cooldown) {
        return interaction.editReply({ content: `ℹ️ <@${usuario.id}> não tem cooldown ativo para **${tipo}**.` });
      }
      await removerBonusCooldown(usuario.id, tipo);
      return interaction.editReply({ content: `✅ Cooldown de bônus **${tipo}** resetado para <@${usuario.id}>. Pode usar \`/registro_bonus\` agora.` });
    }

    // ── corrigir ─────────────────────────────────────────────────────────────
    if (sub === 'corrigir') {
      const placa = interaction.options.getString('placa');
      const campo = interaction.options.getString('campo');
      const orientacao = interaction.options.getString('orientacao');

      const veiculo = buscarVeiculoPorPlaca(placa);
      if (!veiculo) return interaction.editReply({ content: `❌ Veículo com placa **${placa}** não encontrado.` });

      const campoLabel = { modelo: 'Versão', cor: 'Cor', classe: 'Classe', placa: 'Placa', veiculo: 'Veículo (marca/ano)' }[campo];

      try {
        const dono = await interaction.client.users.fetch(veiculo.comprador_id);
        const dm = await dono.createDM();
        await dm.send({
          flags: MessageFlags.IsComponentsV2,
          components: [{
            type: 17,
            accent_color: 0xFEE75C,
            components: [
              {
                type: 10,
                content:
                  `## ⚠️ Correção solicitada no seu registro\n` +
                  `> **Veículo:** ${veiculo.veiculo}${veiculo.modelo ? ` ${veiculo.modelo}` : ''} — \`${veiculo.placa}\`\n` +
                  `> **Campo:** ${campoLabel}\n` +
                  `> **Orientação do staff:** ${orientacao}`,
              },
              { type: 14, divider: true, spacing: 1 },
              {
                type: 1,
                components: [{
                  type: 2,
                  style: 1,
                  label: '✏️ Corrigir agora',
                  custom_id: `btn_corrigir:${veiculo.vin}:${campo}`,
                }],
              },
            ],
          }],
        });
      } catch {
        return interaction.editReply({ content: `❌ Não foi possível enviar DM para <@${veiculo.comprador_id}>. As DMs podem estar fechadas.` });
      }

      return interaction.editReply({
        content: `✅ Solicitação de correção enviada para <@${veiculo.comprador_id}>.\n> **Campo:** ${campoLabel}\n> **Orientação:** ${orientacao}`,
      });
    }

    // ── sync_911 ─────────────────────────────────────────────────────────────
    if (sub === 'sync_911') {
      const { lerVeiculos: lv } = require('../../services/database/db');
      const { notificar911 } = require('../../services/notificar911');
      const ativos = lv().filter(v => v.ativo);

      if (!process.env.CANAL_INTEGRACAO_911_ID) {
        return interaction.editReply({ content: '❌ `CANAL_INTEGRACAO_911_ID` não configurado no .env.' });
      }

      await interaction.editReply({ content: `⏳ Sincronizando ${ativos.length} veículo(s) com o 911-bot...` });

      let ok = 0;
      for (const v of ativos) {
        await notificar911(interaction.client, {
          tipo: 'registro',
          discord_id_novo: v.comprador_id,
          discord_id_anterior: null,
          placa: v.placa,
          vin: v.vin,
          modelo: `${v.veiculo} ${v.modelo || ''}`.trim(),
          cor: v.cor,
          link_registro: v.link_registro || null,
        });
        ok++;
        await new Promise(r => setTimeout(r, 500));
      }

      return interaction.editReply({ content: `✅ Sync concluído — **${ok}** veículo(s) enviados ao 911-bot.` });
    }
  },
};
