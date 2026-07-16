const fs = require('fs');
const path = require('path');
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { buscarVeiculoPorVin, atualizarVeiculo, buscarVeiculosPorProprietario, removerVeiculo } = require('../services/database/db');
const { buildCard } = require('../commands/public/garagem');
const { msgRegistroOficial, msgConfirmacaoTransferencia } = require('../utils/formatter');
const { parsearUrlDiscord } = require('../utils/valorParser');
const { notificar911 } = require('../services/notificar911');
const { logTransferencia } = require('../services/auditoria');
const { cores, emojis: em } = require('../config/config');

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

    // ── Botão: Navegação garagem (◀ ▶) ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('btn_garagem_nav:')) {
      const parts = interaction.customId.split(':');
      const userId = parts[1];
      const idx = parseInt(parts[2], 10);

      if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Esta garagem não é sua.', flags: MessageFlags.Ephemeral });
      }

      const veiculos = buscarVeiculosPorProprietario(userId);
      if (!veiculos[idx]) return interaction.reply({ content: '❌ Veículo não encontrado.', flags: MessageFlags.Ephemeral });

      return interaction.update(buildCard(veiculos, idx, userId));
    }

    // ── Botão: Transferir (direto do registro) ───────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('btn_transferir:')) {
      const vin = interaction.customId.split(':')[1];
      const veiculo = buscarVeiculoPorVin(vin);

      if (!veiculo || !veiculo.ativo) {
        return interaction.reply({ content: '❌ Veículo não encontrado.', flags: MessageFlags.Ephemeral });
      }
      if (veiculo.comprador_id !== interaction.user.id) {
        return interaction.reply({ content: '❌ Apenas o proprietário registrado pode transferir este veículo.', flags: MessageFlags.Ephemeral });
      }

      return abrirModalTransferencia(interaction, vin);
    }

    // ── Botão: Restaurar registro no canal ───────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('btn_restaurar_registro:')) {
      const { MessageFlags } = require('discord.js');
      const { canalRegistroVeicularId } = require('../config/config');
      const vin = interaction.customId.split(':')[1];
      const veiculo = buscarVeiculoPorVin(vin);

      if (!veiculo) {
        return interaction.reply({ content: '❌ Veículo não encontrado no banco de dados.', flags: MessageFlags.Ephemeral });
      }

      // Reosta no canal de registro e atualiza link_registro
      const canal = await interaction.client.channels.fetch(canalRegistroVeicularId);
      const novaMsg = await canal.send(msgRegistroOficial(veiculo));
      const novoLink = `https://discord.com/channels/${novaMsg.guildId}/${canal.id}/${novaMsg.id}`;
      atualizarVeiculo(vin, { link_registro: novoLink });

      await interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: [{
          type: 17,
          accent_color: cores.verde,
          components: [
            {
              type: 10,
              content:
                `## ↩️ REGISTRO RESTAURADO\n` +
                `> **Restaurado por:** <@${interaction.user.id}>\n` +
                `> **Veículo:** ${veiculo.veiculo} — Placa: \`${veiculo.placa}\`\n` +
                `> **Novo link:** ${novoLink}`,
            },
            { type: 14, divider: true, spacing: 1 },
            { type: 10, content: `-# Ação confirmada · ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` },
          ],
        }],
      });
      return;
    }

    // ── Botão: Apagar do banco de dados (após registro deletado do canal) ────
    if (interaction.isButton() && interaction.customId.startsWith('btn_apagar_db:')) {
      const vin = interaction.customId.split(':')[1];
      const veiculo = buscarVeiculoPorVin(vin);
      removerVeiculo(vin);

      // Edita a mensagem de auditoria removendo os botões e confirmando
      await interaction.update({
        flags: require('discord.js').MessageFlags.IsComponentsV2,
        components: [
          {
            type: 17,
            accent_color: cores.vermelho,
            components: [
              {
                type: 10,
                content:
                  `## 🗑️ REGISTRO REMOVIDO DO BANCO DE DADOS\n` +
                  `> **Removido por:** <@${interaction.user.id}>\n` +
                  (veiculo ? `> **Veículo:** ${veiculo.veiculo} — Placa: ${veiculo.placa} — VIN: \`${veiculo.vin}\`` : `> VIN: \`${vin}\``),
              },
              { type: 14, divider: true, spacing: 1 },
              { type: 10, content: `-# Ação confirmada · ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` },
            ],
          },
        ],
      });
      return;
    }

    // ── Botão: Manter no banco de dados ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('btn_manter_db:')) {
      const vin = interaction.customId.split(':')[1];
      const veiculo = buscarVeiculoPorVin(vin);

      await interaction.update({
        flags: require('discord.js').MessageFlags.IsComponentsV2,
        components: [
          {
            type: 17,
            accent_color: cores.azul,
            components: [
              {
                type: 10,
                content:
                  `## ✅ REGISTRO MANTIDO NO BANCO DE DADOS\n` +
                  `> **Decisão de:** <@${interaction.user.id}>\n` +
                  (veiculo ? `> **Veículo:** ${veiculo.veiculo} — Placa: ${veiculo.placa} — VIN: \`${veiculo.vin}\`` : `> VIN: \`${vin}\``),
              },
              { type: 14, divider: true, spacing: 1 },
              { type: 10, content: `-# Ação confirmada · ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` },
            ],
          },
        ],
      });
      return;
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
        );
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
      const historico = [...(veiculo.historico_proprietarios || []), { id: novoId, desde: Date.now() }];

      atualizarVeiculo(vin, {
        comprador_id: novoId,
        historico_proprietarios: historico,
        comprovante_recompra: comprovante,  // pagamento do dono usado (atualiza a cada transferência)
        // link_cotacao e comprovante (original) são preservados pelo spread do atualizarVeiculo
      });

      // Edita a mensagem de registro original para refletir o novo proprietário
      if (veiculo.link_registro) {
        try {
          const { channelId, messageId } = parsearUrlDiscord(veiculo.link_registro);
          const canalReg = await interaction.client.channels.fetch(channelId);
          const msgReg = await canalReg.messages.fetch(messageId);
          const veiculoAtualizado = {
            ...veiculo,
            comprador_id: novoId,
            historico_proprietarios: historico,
            comprovante_recompra: comprovante,
            _ex_proprietario_id: exProprietarioId,
          };
          await msgReg.edit(msgRegistroOficial(veiculoAtualizado));
        } catch (e) {
          console.error('[transferencia] Não foi possível editar o registro original:', e.message);
        }
      }

      // Só loga na auditoria — não posta no canal de registro
      await logTransferencia(interaction.client, {
        veiculo,
        exProprietarioId,
        novoProprietarioId: novoId,
        comprovante,
      });

      await notificar911(interaction.client, {
        tipo: 'transferencia',
        discord_id: novoId,
        placa: veiculo.placa,
        vin: veiculo.vin,
        modelo: `${veiculo.veiculo} ${veiculo.modelo || ''}`.trim(),
      });

      await interaction.editReply(msgConfirmacaoTransferencia({
        veiculo: { ...veiculo, comprador_id: novoId, historico_proprietarios: historico },
        exProprietarioId,
        novoProprietarioId: novoId,
        comprovante,
      }));
    }
  },
};
