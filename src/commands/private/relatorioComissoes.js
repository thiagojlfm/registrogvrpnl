const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { cargoAtendente } = require('../../config/config');
const { lerComissoes } = require('../../services/database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relatorio_comissoes')
    .setDescription('Gera relatório CSV de comissões e envia na sua DM.')
    .addStringOption(o =>
      o.setName('status')
        .setDescription('Filtrar por status')
        .setRequired(false)
        .addChoices(
          { name: 'Todas', value: 'todas' },
          { name: 'Não pagas', value: 'pendente' },
          { name: 'Pagas', value: 'pago' },
        )
    ),

  async execute(interaction) {
    if (cargoAtendente && !interaction.member.roles.cache.has(cargoAtendente)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para acessar relatórios de comissões.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const filtro = interaction.options.getString('status') || 'todas';
    let comissoes = lerComissoes();

    if (filtro === 'pendente') comissoes = comissoes.filter(c => !c.pago);
    if (filtro === 'pago')     comissoes = comissoes.filter(c => c.pago);

    if (comissoes.length === 0) {
      return interaction.editReply({ content: '📭 Nenhuma comissão encontrada com esse filtro.' });
    }

    // Busca nomes dos atendentes para o CSV
    const guild = interaction.guild;
    const nomeCache = new Map();
    async function getNome(id) {
      if (nomeCache.has(id)) return nomeCache.get(id);
      try {
        const m = await guild.members.fetch(id);
        const nome = m.displayName;
        nomeCache.set(id, nome);
        return nome;
      } catch {
        nomeCache.set(id, id);
        return id;
      }
    }

    const linhas = ['Nº Venda,Data,VIN,Veículo,Atendente,Valor Venda,Comissão (2%),Status'];
    for (const c of comissoes) {
      const nome = await getNome(c.atendente_id);
      const data = new Date(c.data).toLocaleDateString('pt-BR');
      const status = c.pago ? 'Pago' : 'Pendente';
      linhas.push([
        c.num,
        data,
        c.vin,
        `"${c.carro}"`,
        `"${nome}"`,
        c.valor_str,
        c.comissao_str,
        status,
      ].join(','));
    }

    const csv = linhas.join('\n');
    const buffer = Buffer.from(csv, 'utf8');
    const arquivo = new AttachmentBuilder(buffer, { name: `comissoes_${Date.now()}.csv` });

    try {
      const dm = await interaction.user.createDM();
      await dm.send({
        content: `📊 **Relatório de Comissões** (${comissoes.length} venda(s) · filtro: ${filtro})`,
        files: [arquivo],
      });
      await interaction.editReply({ content: '✅ Relatório enviado na sua DM!' });
    } catch {
      await interaction.editReply({ content: '❌ Não consegui enviar DM. Verifique se suas DMs estão abertas.' });
    }
  },
};
