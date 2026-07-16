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

  if (message.embeds?.length > 0 && message.embeds[0].fields?.length > 0) {
    dados = parseEmbedFields(message.embeds[0].fields);
  }

  // Preenche campos ausentes com fallback no content
  const semDados = Object.keys(MAP_CAMPOS).some(k => !dados[k]);
  if (semDados && message.content) {
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
