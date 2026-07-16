const { SlashCommandBuilder } = require('discord.js');
const { idBotEconomia, cargoAtendente } = require('../../config/config');
const { setPendente } = require('../../services/database/db');
const { gerarVin } = require('../../utils/vinGenerator');
const { extrairValorEmbed } = require('../../utils/valorParser');

const DOIS_HORAS_MS = 2 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorizar_venda')
    .setDescription('Autoriza a venda de um veículo na concessionária e libera o registro para o comprador.')
    .addUserOption(o =>
      o.setName('comprador').setDescription('@ do comprador').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    // Verificação de cargo
    if (cargoAtendente && !interaction.member.roles.cache.has(cargoAtendente)) {
      return interaction.editReply({ content: '❌ Você não tem permissão para autorizar vendas.', ephemeral: true });
    }

    const comprador = interaction.options.getUser('comprador');

    // Precisa estar num tópico ou canal de texto
    const topico = interaction.channel;
    if (!topico) {
      return interaction.editReply({ content: '❌ Não foi possível acessar o canal/tópico atual.' });
    }

    // Busca histórico do tópico (até 100 mensagens)
    let mensagens;
    try {
      const colecao = await topico.messages.fetch({ limit: 100 });
      mensagens = [...colecao.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    } catch (err) {
      console.error('[autorizar_venda] Erro ao buscar histórico:', err.message);
      return interaction.editReply({ content: '❌ Não foi possível ler o histórico do tópico.' });
    }

    // Encontra mensagem de pagamento do UnbelievaBoat (recente, máx 2h)
    const agora = Date.now();
    const msgPagamento = mensagens.find(
      m => m.author.id === idBotEconomia && (agora - m.createdTimestamp) <= DOIS_HORAS_MS
    );

    if (!msgPagamento) {
      return interaction.editReply({
        content: '❌ Nenhuma confirmação de pagamento do sistema econômico encontrada neste tópico nas últimas 2 horas.',
      });
    }

    // Extrai valor do embed do UnbelievaBoat
    const embed = msgPagamento.embeds?.[0];
    const valorPago = embed ? extrairValorEmbed(embed) : null;

    // Extrai nome do veículo da primeira mensagem do comprador no tópico
    const primeiraMsgComprador = mensagens.find(m => m.author.id === comprador.id && m.content?.trim());
    const veiculoTexto = primeiraMsgComprador?.content?.split('\n')[0]?.trim() || 'Não identificado';

    // Extrai foto do tópico (primeiro attachment de qualquer mensagem)
    let fotoUrl = null;
    for (const msg of mensagens) {
      const att = msg.attachments.first();
      if (att && att.contentType?.startsWith('image/')) {
        fotoUrl = att.url;
        break;
      }
    }

    // Heurística: separa veículo e modelo pelo ano (4 dígitos)
    const partes = veiculoTexto.split(/\s+/);
    const anoIdx = partes.findIndex(p => /^\d{4}$/.test(p));
    let veiculoNome, modeloNome;
    if (anoIdx > 0) {
      veiculoNome = partes.slice(0, anoIdx).join(' ');
      modeloNome = partes.slice(anoIdx).join(' ');
    } else {
      veiculoNome = veiculoTexto;
      modeloNome = '';
    }

    // Gera VIN
    let vin;
    try { vin = gerarVin(); } catch (err) {
      return interaction.editReply({ content: '❌ Erro ao gerar VIN. Tente novamente.' });
    }

    // Salva pendente para o comprador
    const comprovanteLink = `https://discord.com/channels/${interaction.guildId}/${topico.id}/${msgPagamento.id}`;
    setPendente(comprador.id, {
      vin,
      importador_id: interaction.user.id,
      veiculo: veiculoNome,
      modelo: modeloNome,
      obs: '',
      comprovante: comprovanteLink,
      valor_pago: valorPago || 'N/A',
      foto_sugerida: fotoUrl,
      criado_em: Date.now(),
    });

    console.log(`[autorizar_venda] Pendente criado para ${comprador.id} | VIN: ${vin} | Atendente: ${interaction.user.id}`);

    await interaction.editReply({
      content:
        `✅ Venda autorizada por <@${interaction.user.id}>.\n` +
        `<@${comprador.id}>, use **/registrar_veiculo** com sua placa, cor e tipo para finalizar o registro.\n` +
        `> **Veículo identificado:** ${veiculoNome} ${modeloNome}\n` +
        `> **Valor pago:** ${valorPago || 'não identificado'}\n` +
        `> **VIN gerado:** \`${vin}\``,
    });
  },
};
