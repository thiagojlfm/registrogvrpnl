const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { idBotEconomia, cargoAtendente, cores, canalConceOffsaleId, canalConceLimitedId } = require('../../config/config');
const { setPendente, getCotacao, registrarComissao } = require('../../services/database/db');
const { gerarVin } = require('../../utils/vinGenerator');
const { extrairValorEmbed, normalizarValor } = require('../../utils/valorParser');
const { logPendente, logComissao } = require('../../services/auditoria');

const DOIS_HORAS_MS = 2 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorizar_venda')
    .setDescription('Autoriza a venda de um veículo na concessionária e libera o registro para o comprador.')
    .addUserOption(o =>
      o.setName('comprador').setDescription('@ do comprador').setRequired(true)
    ),

  async execute(interaction) {
    // Verificação de cargo — ephemeral, só o atendente vê
    if (cargoAtendente && !interaction.member.roles.cache.has(cargoAtendente)) {
      return interaction.reply({ content: '❌ Você não tem permissão para autorizar vendas.', flags: MessageFlags.Ephemeral });
    }

    const comprador = interaction.options.getUser('comprador');
    const topico = interaction.channel;
    if (!topico) {
      return interaction.reply({ content: '❌ Não foi possível acessar o canal/tópico atual.', flags: MessageFlags.Ephemeral });
    }

    // Busca histórico ANTES de deferir para poder responder ephemeral se necessário
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
      return interaction.reply({ content: '❌ Não foi possível ler o histórico do tópico.', flags: MessageFlags.Ephemeral });
    }

    const agora = Date.now();

    // Trava: só uma VENDA AUTORIZADA por tópico — erro ephemeral (só o atendente vê)
    const msgVendaAutorizada = todasMensagens.find(m => {
      if (m.author.id !== interaction.client.user.id) return false;
      return JSON.stringify(m.components || []).includes('VENDA AUTORIZADA');
    });

    if (msgVendaAutorizada) {
      const rawTexto = JSON.stringify(msgVendaAutorizada.components || []);
      // Procura "Comprador: <@id>" no texto serializado
      const compradorExistente = rawTexto.match(/Comprador[^"]*<@(\d+)>/)?.[1]
        || rawTexto.match(/<@(\d+)>/)?.[1];
      if (compradorExistente !== comprador.id) {
        return interaction.reply({
          content:
            `❌ Este tópico já tem uma **VENDA AUTORIZADA** para <@${compradorExistente}>.\n` +
            `Só pode existir uma autorização por tópico.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      // Mesmo comprador → re-autorização: defer público e continua normalmente
    }

    // A partir daqui a resposta é pública (visível a todos no tópico)
    await interaction.deferReply();

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

    // Detecta categoria pelo canal pai do tópico
    const parentId = topico.parentId;
    let categoria = null;
    if (parentId === canalConceOffsaleId) categoria = 'Offsale';
    else if (parentId === canalConceLimitedId) categoria = 'Limited';

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
      categoria,
      comprovante: msgPagamento.url,
      valor_pago: valorPago || 'N/A',
      foto_sugerida: fotoUrl,
      criado_em: Date.now(),
    });

    console.log(`[autorizar_venda] Pendente criado para ${comprador.id} | VIN: ${vin} | Atendente: ${interaction.user.id}`);

    // Bloqueia se não houver cotação registrada no tópico
    const cotacao = getCotacao(topico.id);
    if (!cotacao) {
      return interaction.editReply({
        content: '❌ Nenhuma cotação registrada neste tópico.\nUse **/cotacao** antes de autorizar a venda.',
      });
    }

    // Registra comissão vinculada à cotação
    if (cotacao) {
      const valorCentavos = normalizarValor(valorPago) || cotacao.valor_centavos;
      const comissaoCentavos = Math.round(valorCentavos * 0.02);
      const fmtValor = `$${(valorCentavos / 100).toLocaleString('pt-BR')}`;
      const fmtComissao = `$${(comissaoCentavos / 100).toLocaleString('pt-BR')}`;
      const num = registrarComissao({
        vin,
        carro: `${veiculoNome}${modeloNome ? ` ${modeloNome}` : ''}`,
        atendente_id: interaction.user.id,
        valor_centavos: valorCentavos,
        valor_str: fmtValor,
        comissao_centavos: comissaoCentavos,
        comissao_str: fmtComissao,
        cotacao_atendente_id: cotacao.atendente_id,
        topico_id: topico.id,
        data: new Date().toISOString(),
      });
      logComissao(interaction.client, {
        num,
        atendenteId: cotacao.atendente_id,
        carro: `${veiculoNome}${modeloNome ? ` ${modeloNome}` : ''}`,
        vin,
        valorVenda: fmtValor,
        valorComissao: fmtComissao,
      }).catch(() => {});
    }

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
        categoria,
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
