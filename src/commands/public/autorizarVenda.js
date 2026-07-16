const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { idBotEconomia, cargoAtendente, cores } = require('../../config/config');
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

    // Busca a mensagem que originou o tópico (cotação da conce) e as mensagens dentro do tópico
    let msgCotacao = null;
    let todasMensagens = [];
    try {
      const [starter, colecao] = await Promise.all([
        topico.fetchStarterMessage().catch(() => null),
        topico.messages.fetch({ limit: 100 }),
      ]);
      msgCotacao = starter;
      todasMensagens = [...colecao.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    } catch (err) {
      console.error('[autorizar_venda] Erro ao buscar histórico:', err.message);
      return interaction.editReply({ content: '❌ Não foi possível ler o histórico do tópico.' });
    }

    const mensagensAntigas = todasMensagens; // alias para compatibilidade abaixo

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

    // Extrai veículo da mensagem que originou o tópico (cotação), pulando linhas de menção
    const linhasCotacao = (msgCotacao?.content || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.match(/^<@!?\d+>$/) && !l.startsWith('@'));
    const veiculoTexto = linhasCotacao[0] || 'Não identificado';
    const modeloExtra = linhasCotacao[1] || '';

    // Extrai foto: tenta primeiro na cotação, depois nas mensagens do tópico
    let fotoUrl = null;
    const fontesFoto = [msgCotacao, ...todasMensagens].filter(Boolean);
    for (const msg of fontesFoto) {
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
      flags: MessageFlags.IsComponentsV2,
      components: [
        {
          type: 17,
          accent_color: cores.verde,
          components: [
            {
              type: 10,
              content:
                `## <:SimGVRPNL:1228154618048155701> VENDA AUTORIZADA\n` +
                `> **Comprador:** <@${comprador.id}>\n` +
                `> **Autorizado por:** <@${interaction.user.id}>\n` +
                `> **Veículo:** ${veiculoNome}${modeloNome ? ` — ${modeloNome}` : ''}\n` +
                `> **Valor pago:** ${valorPago || 'não identificado'}\n` +
                `> **VIN:** \`${vin}\``,
            },
            { type: 14, divider: true, spacing: 1 },
            {
              type: 10,
              content: `<@${comprador.id}>, use **/registrar_veiculo** com sua placa, cor e foto para finalizar o registro oficial.`,
            },
          ],
        },
      ],
    });
  },
};
