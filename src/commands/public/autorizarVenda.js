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

    // Fix 1: busca as mensagens mais antigas primeiro (primeira msg do comprador = modelo do veículo)
    let mensagensAntigas, mensagensRecentes;
    try {
      const [colAntiga, colRecente] = await Promise.all([
        topico.messages.fetch({ limit: 50, after: '0' }),
        topico.messages.fetch({ limit: 50 }),
      ]);
      mensagensAntigas = [...colAntiga.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      mensagensRecentes = [...colRecente.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    } catch (err) {
      console.error('[autorizar_venda] Erro ao buscar histórico:', err.message);
      return interaction.editReply({ content: '❌ Não foi possível ler o histórico do tópico.' });
    }

    // Deduplica unindo as duas buscas
    const mapaMsg = new Map();
    [...mensagensAntigas, ...mensagensRecentes].forEach(m => mapaMsg.set(m.id, m));
    const todasMensagens = [...mapaMsg.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // Fix 2: encontra confirmação de pagamento do UnbelievaBoat (máx 2h, qualquer formato)
    const agora = Date.now();
    const msgPagamento = todasMensagens.find(m => {
      if (m.author.id !== idBotEconomia) return false;
      if ((agora - m.createdTimestamp) > DOIS_HORAS_MS) return false;
      const textoEmbed = m.embeds?.[0]?.description || m.embeds?.[0]?.title || '';
      const textoContent = m.content || '';
      return textoEmbed.includes('has received') || textoContent.includes('has received');
    });

    if (!msgPagamento) {
      return interaction.editReply({
        content: '❌ Nenhuma confirmação de pagamento do sistema econômico encontrada neste tópico nas últimas 2 horas.',
      });
    }

    // Extrai valor — tenta embed (todos os campos), depois content, depois mensagem do !pay
    const embed = msgPagamento.embeds?.[0];
    let valorPago = embed ? extrairValorEmbed(embed) : null;

    // Fallback: content da mensagem do UnbelievaBoat
    if (!valorPago && msgPagamento.content) {
      const m = msgPagamento.content.match(/\$\s*[\d.,]+/);
      if (m) valorPago = m[0].replace(/\s/g, '');
    }

    // Fallback: mensagem do !pay enviada por qualquer usuário no tópico
    if (!valorPago) {
      const msgPay = todasMensagens.find(m => /!pay\b/i.test(m.content));
      if (msgPay) {
        const m = msgPay.content.match(/\b\d[\d.,]*\b/g);
        if (m) valorPago = `$${m[m.length - 1]}`; // último número = valor
      }
    }

    // Fix 1: primeira mensagem do comprador — pula linhas que são só menções (@Usuario ou <@id>)
    const primeiraMsgComprador = mensagensAntigas.find(m => m.author.id === comprador.id && m.content?.trim());
    const linhasComprador = (primeiraMsgComprador?.content || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.match(/^<@!?\d+>$/) && !l.startsWith('@'));
    const veiculoTexto = linhasComprador[0] || 'Não identificado';
    const modeloExtra = linhasComprador[1] || '';

    // Extrai foto do tópico (primeiro attachment de qualquer mensagem)
    let fotoUrl = null;
    for (const msg of todasMensagens) {
      const att = msg.attachments.first();
      if (att && att.contentType?.startsWith('image/')) { fotoUrl = att.url; break; }
    }

    // Separa veículo e modelo: ano (4 dígitos) divide o texto; linha 2 vira modelo se existir
    const partes = veiculoTexto.split(/\s+/);
    const anoIdx = partes.findIndex(p => /^\d{4}$/.test(p));
    let veiculoNome, modeloNome;
    if (anoIdx > 0) {
      veiculoNome = partes.slice(0, anoIdx).join(' ');
      modeloNome = [partes.slice(anoIdx).join(' '), modeloExtra].filter(Boolean).join(' ');
    } else {
      veiculoNome = veiculoTexto;
      modeloNome = modeloExtra;
    }

    // Gera VIN
    let vin;
    try { vin = gerarVin(); } catch (err) {
      return interaction.editReply({ content: '❌ Erro ao gerar VIN. Tente novamente.' });
    }

    // Fix 3: usa message.url da mensagem do UnbelievaBoat como comprovante
    setPendente(comprador.id, {
      vin,
      importador_id: interaction.user.id,
      veiculo: veiculoNome,
      modelo: modeloNome,
      obs: '',
      comprovante: msgPagamento.url,
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
