const { canalRegistroVeicularId } = require('../config/config');
const { lerVeiculos, salvarVeiculos } = require('../services/database/db');

function extrairTexto(components = []) {
  let texto = '';
  for (const c of components) {
    if (c.type === 10 && c.content) texto += c.content + '\n';
    if (c.components) texto += extrairTexto(c.components);
  }
  return texto;
}

function parsearRegistro(texto, msgUrl, msgTimestamp) {
  const get = (pattern) => {
    const m = texto.match(pattern);
    return m ? m[1].trim() : null;
  };

  const compradorId = get(/<@(\d+)>/);
  const vin         = get(/VIN Number[:\s*`]+([0-9]+)/);
  const placa       = get(/Placa[:\s*`]+([A-Za-z0-9\-]+)/);
  const veiculo     = get(/Ano, marca, modelo[:\s]+(.+)/);
  const modelo      = get(/Versão[:\s]+(.+)/);
  const cor         = get(/Coloração[:\s]+(.+)/);
  const classe      = get(/Classe[:\s]+(?!N\/A)(.+)/);

  // Empresarial
  const empresa     = get(/Nome da empresa[:\s]+(.+)/);
  const empresaLink = get(/Link do registro da empresa[:\s]+(.+)/);
  const finalidade  = get(/Finalidade[:\s]+(.+)/);
  const tipo        = empresa ? 'empresarial' : 'pessoal';

  // Comprovantes
  const linkCotacao        = get(/Cotação\/Orçamento[:\s]+(https?:\/\/\S+)/);
  const comprovante        = get(/Comprovante de Pagamento[:\s]+(https?:\/\/\S+)/);
  const comprovanteRecompra = get(/Recompra[^:]*[:\s]+(https?:\/\/\S+)/);

  if (!compradorId || !vin || !placa) return null;

  return {
    vin,
    comprador_id: compradorId,
    importador_id: null,
    veiculo: veiculo || 'Desconhecido',
    modelo: modelo || '',
    cor: cor || '',
    placa,
    classe: classe || null,
    obs: '',
    link_cotacao: linkCotacao || null,
    comprovante: comprovante || null,
    comprovante_recompra: comprovanteRecompra || null,
    valor_pago: null,
    foto_url: null,
    link_registro: msgUrl,
    tipo,
    empresa: empresa || null,
    empresa_link: empresaLink || null,
    finalidade: finalidade || null,
    historico_proprietarios: [{ id: compradorId, desde: msgTimestamp }],
    data_registro: msgTimestamp,
    ativo: true,
  };
}

async function sincronizarCanal(client) {
  const canal = await client.channels.fetch(canalRegistroVeicularId);
  const veiculosExistentes = lerVeiculos();
  const vinsExistentes = new Set(veiculosExistentes.map(v => v.vin));

  let novos = 0;
  let before = undefined;

  while (true) {
    const opcoes = { limit: 100 };
    if (before) opcoes.before = before;

    const mensagens = await canal.messages.fetch(opcoes);
    if (mensagens.size === 0) break;

    for (const msg of mensagens.values()) {
      if (msg.author.id !== client.user.id) continue;
      if (!msg.components?.length) continue;

      const texto = extrairTexto(msg.components);
      if (!texto.includes('VEÍCULO REGISTRADO')) continue;

      const registro = parsearRegistro(texto, msg.url, msg.createdTimestamp);
      if (!registro || vinsExistentes.has(registro.vin)) continue;

      veiculosExistentes.push(registro);
      vinsExistentes.add(registro.vin);
      novos++;
    }

    before = mensagens.last()?.id;
    if (mensagens.size < 100) break;
  }

  if (novos > 0) {
    salvarVeiculos(veiculosExistentes);
    console.log(`[sync] ${novos} veículo(s) importado(s) do canal.`);
  }

  return novos;
}

module.exports = { sincronizarCanal };
