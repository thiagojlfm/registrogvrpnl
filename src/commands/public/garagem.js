const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buscarVeiculosPorProprietario, atualizarVeiculo } = require('../../services/database/db');
const { cores, emojis: em } = require('../../config/config');
const { sincronizarCanal } = require('../../utils/syncCanal');
const { parsearUrlDiscord } = require('../../utils/valorParser');

async function refreshFotos(client, veiculos) {
  for (const v of veiculos) {
    if (!v.link_registro) continue;
    try {
      const { channelId, messageId } = parsearUrlDiscord(v.link_registro);
      const canal = await client.channels.fetch(channelId);
      const msg = await canal.messages.fetch(messageId);

      // Busca imagem: attachment direto ou dentro de media gallery (type 12)
      let novaUrl = null;
      const att = msg.attachments?.first();
      if (att?.contentType?.startsWith('image/')) {
        novaUrl = att.url;
      } else {
        for (const comp of msg.components || []) {
          const items = comp.components?.flatMap(c => c.items || c.components || []) || comp.items || [];
          for (const item of items) {
            const url = item?.media?.url || item?.url;
            if (url) { novaUrl = url; break; }
          }
          if (novaUrl) break;
        }
      }

      if (novaUrl && novaUrl !== v.foto_url) {
        v.foto_url = novaUrl;
        await atualizarVeiculo(v.vin, { foto_url: novaUrl });
      }
    } catch {
      // silencioso — se falhar, exibe sem foto
    }
  }
}

function buildCard(veiculos, idx, userId) {
  const v = veiculos[idx];
  const data = new Date(v.data_registro).toLocaleDateString('pt-BR');
  const total = veiculos.length;

  const components = [];

  // Cabeçalho
  components.push({
    type: 10,
    content:
      `## ${em.carro} GARAGEM — <@${userId}>\n` +
      `-# Veículo ${idx + 1} de ${total}`,
  });
  components.push({ type: 14, divider: true, spacing: 1 });

  // Card do veículo — com foto no canto direito se disponível
  let tipoTag = '';
  if (v.tipo_bonus === 'staff')  tipoTag = ' 🛡️ Staff';
  else if (v.tipo_bonus === 'boost') tipoTag = ' 🚀 Boost';
  else if (v.tipo === 'empresarial') tipoTag = ' 🏢 Empresarial';

  const cardText = {
    type: 10,
    content:
      `### ${em.rpc2} ${v.veiculo}${tipoTag ? ` ·${tipoTag}` : ''}\n` +
      `> ${em.rpw} **Versão:** ${v.modelo || 'N/A'}\n` +
      `> ${em.rpw} **Placa:** \`${v.placa}\`\n` +
      `> ${em.rpw} **Classe:** ${v.classe || 'N/A'}\n` +
      `> ${em.rpc} **VIN:** \`${v.vin}\`\n` +
      `-# Registrado em ${data}`,
  };

  if (v.foto_url) {
    components.push({
      type: 9,
      components: [cardText],
      accessory: { type: 11, media: { url: v.foto_url } },
    });
  } else {
    components.push(cardText);
  }

  components.push({ type: 14, divider: true, spacing: 1 });

  // Linha 1: setas de navegação
  const navBotoes = [
    {
      type: 2,
      style: 2,
      label: '◀',
      custom_id: `btn_garagem_nav:${userId}:${idx - 1}`,
      disabled: idx === 0,
    },
    {
      type: 2,
      style: 2,
      label: '▶',
      custom_id: `btn_garagem_nav:${userId}:${idx + 1}`,
      disabled: idx === total - 1,
    },
  ];
  components.push({ type: 1, components: navBotoes });

  // Linha 2: ações do veículo
  const acaoBotoes = [{
    type: 2,
    style: 4,
    label: 'Transferir',
    emoji: { id: '1499866159409922199' },
    custom_id: `btn_transferir:${v.vin}`,
  }];

  if (v.link_registro) {
    acaoBotoes.push({
      type: 2,
      style: 5,
      label: 'Ver registro',
      emoji: { id: '1480328653186400326' },
      url: v.link_registro,
    });
  }

  components.push({ type: 1, components: acaoBotoes });

  // Linha 3: status de seguro
  const seg = v.seguro;
  let seguroBtn;
  if (seg?.ativa && seg?.status === 'ativo') {
    seguroBtn = { type: 2, style: 3, label: 'Segurado', emoji: { id: '1527466896079847544' }, custom_id: `btn_seguro_info:${v.vin}`, disabled: true };
  } else if (seg?.status === 'inadimplente') {
    seguroBtn = { type: 2, style: 4, label: '⚠️ Inadimplente', custom_id: `btn_seguro_info:${v.vin}`, disabled: true };
  } else if (seg?.status === 'aguardando_pagamento') {
    seguroBtn = { type: 2, style: 2, label: '⏳ Aguardando Pagamento', custom_id: `btn_seguro_info:${v.vin}`, disabled: true };
  } else {
    seguroBtn = { type: 2, style: 2, label: 'Cotar Seguro', emoji: { id: '1527466896079847544' }, custom_id: `btn_cotar_seguro:${v.vin}` };
  }
  components.push({ type: 1, components: [seguroBtn] });

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [{
      type: 17,
      accent_color: cores.azul,
      components,
    }],
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('garagem')
    .setDescription('Abre sua garagem e transfere um veículo para outro usuário.'),

  buildCard,

  async execute(interaction) {
    const GIF_TORETTO = 'https://klipy.com/gifs/domjay-jayblixt-3';

    // Intro cinematográfica — substitui o "pensando..."
    await interaction.deferReply();
    await interaction.editReply({
      content: `### 🔑 Então você quer acelerar?\n-# Abrindo a garagem...\n${GIF_TORETTO}`,
    });

    // Busca veículos enquanto o gif toca
    let veiculos = buscarVeiculosPorProprietario(interaction.user.id);
    if (veiculos.length === 0) {
      await sincronizarCanal(interaction.client);
      veiculos = buscarVeiculosPorProprietario(interaction.user.id);
    }
    await refreshFotos(interaction.client, veiculos);

    // Aguarda 3s para o gif ter impacto
    await new Promise(r => setTimeout(r, 3000));

    if (veiculos.length === 0) {
      return interaction.editReply({
        content: '',
        flags: MessageFlags.IsComponentsV2,
        components: [{
          type: 17,
          accent_color: cores.vermelho,
          components: [
            { type: 10, content: `## ${em.vendido} GARAGEM VAZIA\n> Você não possui veículos registrados no seu nome.` },
          ],
        }],
      });
    }

    return interaction.editReply({ content: '', ...buildCard(veiculos, 0, interaction.user.id) });
  },
};
