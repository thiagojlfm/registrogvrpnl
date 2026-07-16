const fs = require('fs');
const path = require('path');
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { buscarVeiculoPorVin, atualizarVeiculo } = require('../services/database/db');
const { msgTransferencia } = require('../utils/formatter');
const { canalRegistroVeicularId } = require('../config/config');
const { notificar911 } = require('../services/notificar911');

const comandos = new Map();

function carregarComandos() {
  const dirs = ['public', 'private'];
  for (const dir of dirs) {
    const pasta = path.join(__dirname, '../commands', dir);
    if (!fs.existsSync(pasta)) continue;
    for (const arquivo of fs.readdirSync(pasta).filter(f => f.endsWith('.js'))) {
      const cmd = require(path.join(pasta, arquivo));
      if (cmd.data) comandos.set(cmd.data.name, cmd);
    }
  }
}

carregarComandos();

async function abrirModalTransferencia(interaction, vin) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_transferir:${vin}`)
    .setTitle('Transferir Veículo')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('novo_proprietario_id')
          .setLabel('Novo proprietário')
          .setPlaceholder('@nome de usuário, ou cole o ID numérico')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comprovante')
          .setLabel('Link do comprovante de pagamento')
          .setPlaceholder('https://discord.com/channels/...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
  return interaction.showModal(modal);
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // ── Slash commands ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const cmd = comandos.get(interaction.commandName);
      if (!cmd) return;
      try {
        await cmd.execute(interaction);
      } catch (err) {
        console.error(`[interactionCreate] Erro em /${interaction.commandName}:`, err);
        const r = { content: '❌ Ocorreu um erro ao executar este comando.', flags: MessageFlags.Ephemeral };
        interaction.replied || interaction.deferred ? await interaction.followUp(r) : await interaction.reply(r);
      }
      return;
    }

    // ── Select menu: garagem (escolha do carro pra transferir) ──────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'sel_transferir_garagem') {
      const vin = interaction.values[0];
      return abrirModalTransferencia(interaction, vin);
    }

    // ── Botão: Transferir (direto do registro) ───────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('btn_transferir:')) {
      const vin = interaction.customId.split(':')[1];
      const veiculo = buscarVeiculoPorVin(vin);

      if (!veiculo || !veiculo.ativo) {
        return interaction.reply({ content: '❌ Veículo não encontrado.', ephemeral: true });
      }
      if (veiculo.comprador_id !== interaction.user.id) {
        return interaction.reply({ content: '❌ Apenas o proprietário registrado pode transferir este veículo.', ephemeral: true });
      }

      return abrirModalTransferencia(interaction, vin);
    }

    // ── Modal: confirmar transferência ───────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_transferir:')) {
      await interaction.deferReply();

      const vin = interaction.customId.split(':')[1];
      const inputUsuario = interaction.fields.getTextInputValue('novo_proprietario_id').trim();
      const comprovante = interaction.fields.getTextInputValue('comprovante').trim();

      let novoId = null;

      // Aceita: <@123>, @nome, nome, ou ID numérico puro
      const mentionMatch = inputUsuario.match(/^<@!?(\d{17,20})>$/);
      if (mentionMatch) {
        novoId = mentionMatch[1];
      } else if (/^\d{17,20}$/.test(inputUsuario)) {
        novoId = inputUsuario;
      } else {
        // Busca por nome de usuário no servidor
        const query = inputUsuario.replace(/^@/, '');
        const members = await interaction.guild.members.search({ query, limit: 5 });
        const found = members.find(m =>
          m.user.username.toLowerCase() === query.toLowerCase() ||
          m.displayName.toLowerCase() === query.toLowerCase()
        ) || members.first();
        if (found) novoId = found.id;
      }

      if (!novoId) {
        return interaction.editReply({ content: `❌ Usuário **${inputUsuario}** não encontrado no servidor. Tente o nome exato ou cole o ID numérico.` });
      }

      const veiculo = buscarVeiculoPorVin(vin);

      if (!veiculo || !veiculo.ativo) {
        return interaction.editReply({ content: '❌ Veículo não encontrado.' });
      }
      if (veiculo.comprador_id !== interaction.user.id) {
        return interaction.editReply({ content: '❌ Você não é mais o proprietário registrado deste veículo.' });
      }
      if (novoId === interaction.user.id) {
        return interaction.editReply({ content: '❌ Você não pode transferir o veículo para si mesmo.' });
      }

      const exProprietarioId = veiculo.comprador_id;
      const historico = [...veiculo.historico_proprietarios, { id: novoId, desde: Date.now() }];

      atualizarVeiculo(vin, { comprador_id: novoId, historico_proprietarios: historico });

      const canal = await interaction.client.channels.fetch(canalRegistroVeicularId);
      await canal.send(msgTransferencia({
        v: veiculo,
        exProprietarioId,
        novoProprietarioId: novoId,
        comprovante,
      }));

      await notificar911(interaction.client, {
        tipo: 'transferencia',
        discord_id: novoId,
        placa: veiculo.placa,
        vin: veiculo.vin,
        modelo: `${veiculo.veiculo} ${veiculo.modelo || ''}`.trim(),
      });

      await interaction.editReply({
        content: `✅ Veículo **${veiculo.placa}** transferido para <@${novoId}> com sucesso.`,
      });
    }
  },
};
