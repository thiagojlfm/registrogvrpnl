function normalizarChave(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const MAP_CAMPOS = {
  comprador: ['comprador'],
  importador: ['importador'],
  veiculo: ['veiculo', 'veiculo'],
  modelo: ['modelo', 'ano', 'anomodelo'],
  obs: ['obs', 'observacoes', 'observacao'],
  comprovante: ['comprovante', 'comprovantedepagamento'],
  valor_pago: ['valorpago', 'valor'],
};

function extrairIdDeMencao(mencao) {
  const match = mencao.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function parseEmbedFields(fields) {
  const resultado = {};
  for (const field of fields) {
    const chaveNorm = normalizarChave(field.name);
    for (const [campo, aliases] of Object.entries(MAP_CAMPOS)) {
      if (aliases.some(a => chaveNorm.includes(a))) {
        resultado[campo] = field.value?.trim() || '';
        break;
      }
    }
  }
  return resultado;
}

function parseContent(content) {
  const resultado = {};
  const linhas = content.split('\n');

  for (const linha of linhas) {
    const match = linha.match(/^(.+?)[\s]*[—:\-]+[\s]*(.+)$/);
    if (!match) continue;

    const chaveNorm = normalizarChave(match[1]);
    const valor = match[2].trim();

    for (const [campo, aliases] of Object.entries(MAP_CAMPOS)) {
      if (aliases.some(a => chaveNorm.includes(a))) {
        resultado[campo] = valor;
        break;
      }
    }
  }
  return resultado;
}

function parsearMensagemImportacao(message) {
  let dados = {};

  // 1. Embed fields (formato estruturado)
  if (message.embeds?.length > 0 && message.embeds[0].fields?.length > 0) {
    dados = parseEmbedFields(message.embeds[0].fields);
  }

  // 2. Embed description (formato "> Campo: valor" ou "Campo: valor")
  const semDados = Object.keys(MAP_CAMPOS).some(k => !dados[k]);
  if (semDados && message.embeds?.[0]?.description) {
    const descricao = message.embeds[0].description
      .replace(/^>\s*/gm, '')   // remove "> " do início de cada linha
      .replace(/\*\*/g, '');    // remove bold markdown
    const doDesc = parseContent(descricao);
    for (const [k, v] of Object.entries(doDesc)) {
      if (!dados[k]) dados[k] = v;
    }
  }

  // 3. Fallback no content
  if (Object.keys(MAP_CAMPOS).some(k => !dados[k]) && message.content) {
    const doContent = parseContent(message.content);
    for (const [k, v] of Object.entries(doContent)) {
      if (!dados[k]) dados[k] = v;
    }
  }

  // Extrai IDs das menções
  if (dados.comprador) dados.comprador_id = extrairIdDeMencao(dados.comprador);
  if (dados.importador) dados.importador_id = extrairIdDeMencao(dados.importador);

  return dados;
}

module.exports = { parsearMensagemImportacao };
