const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { idBotEconomia, cargoAtendente, cores } = require('../../config/config');
const { setPendente } = require('../../services/database/db');
const { gerarVin } = require('../../utils/vinGenerator');
const { extrairValorEmbed } = require('../../utils/valorParser');
const { logPendente } = require('../../services/auditoria');

const DOIS_HORAS_MS = 2 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorizar_venda')
    .setDescription('Autoriza a venda de um veículo na concessionária e libera o registro para o comprador.')
    .addUserOption(o =>
      o.setName('comprador').setDescription('@ do comprador').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    // Verificação de cargo
    if (cargoAtendente && !interaction.member.roles.cache.has(cargoAtendente)) {
      return interaction.editReply({ content: '❌ Você não tem permissão para autorizar vendas.', flags: MessageFlags.Ephemeral });
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

    const agora = Date.now();

    // Foca no !pay: busca o !pay mais recente nas mensagens do tópico (últimas 2h)
    const msgPayCmd = [...todasMensagens].reverse().find(m => {
      if (m.author.bot) return false;
      if ((agora - m.createdTimestamp) > DOIS_HORAS_MS) return false;
      return /^!pay\s+/i.test(m.content);
    });

    // Confirma que o pagamento foi aceito pelo bot de economia (após o !pay)
    const timestampPay = msgPayCmd?.createdTimestamp || 0;
    const msgPagamento = todasMensagens.find(m => {
      if (m.author.id !== idBotEconomia) return false;
      if (m.createdTimestamp < timestampPay) return false;
      if ((agora - m.createdTimestamp) > DOIS_HORAS_MS) return false;
      const textoEmbed = m.embeds?.[0]?.description || m.embeds?.[0]?.title || '';
      return textoEmbed.includes('has received');
    });

    if (!msgPagamento) {
      return interaction.editReply({
        content: '❌ Nenhuma confirmação de pagamento (`!pay`) encontrada neste tópico nas últimas 2 horas.',
      });
    }

    // Extrai valor: prioriza o !pay (mais confiável), fallback no embed do bot
    let valorPago = null;
    if (msgPayCmd) {
      // !pay @alguem 1000  ou  !pay @alguem $1,000
      const m = msgPayCmd.content.match(/!pay\s+\S+\s+\$?\s*([\d,._]+)/i);
      if (m) valorPago = `$${m[1].replace(/[,._]/g, '')}`;
    }
    if (!valorPago) {
      const embed = msgPagamento.embeds?.[0];
      valorPago = embed ? extrairValorEmbed(embed) : null;
    }

    // Extrai veículo da mensagem que originou o tópico (cotação), pulando linhas de menção
    const linhasCotacao = (msgCotacao?.content || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.match(/^<@!?\d+>$/) && !l.startsWith('@'));
    const veiculoTexto = linhasCotacao[0] || 'Não identificado';
    const modeloExtra  = linhasCotacao[1] || '';
    const classeCotacao = linhasCotacao[2] || null;

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
      link_cotacao: msgCotacao?.url || null,
      classe: classeCotacao,
      comprovante: msgPagamento.url,
      valor_pago: valorPago || 'N/A',
      foto_sugerida: fotoUrl,
      criado_em: Date.now(),
    });

    console.log(`[autorizar_venda] Pendente criado para ${comprador.id} | VIN: ${vin} | Atendente: ${interaction.user.id}`);

    // Backup do pendente na auditoria — recuperável após redeploy
    logPendente(interaction.client, {
      comprador_id: comprador.id,
      pendente: {
        vin,
        importador_id: interaction.user.id,
        veiculo: veiculoNome,
        modelo: modeloNome,
        obs: '',
        link_cotacao: msgCotacao?.url || null,
        classe: classeCotacao,
        comprovante: msgPagamento.url,
        valor_pago: valorPago || 'N/A',
        foto_sugerida: fotoUrl,
        criado_em: Date.now(),
      },
    }).catch(() => {});

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
