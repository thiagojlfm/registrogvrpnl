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

// Extrai todo o texto de uma árvore de Components V2 (type 10 = TextDisplay)
function extrairTextoV2(components) {
  if (!Array.isArray(components)) return '';
  const partes = [];
  for (const c of components) {
    if (c.type === 10 && c.content) partes.push(c.content);
    if (c.components) partes.push(extrairTextoV2(c.components));
    if (c.accessory) partes.push(extrairTextoV2([c.accessory]));
  }
  return partes.join('\n');
}

function parsearMensagemImportacao(message) {
  let dados = {};

  // 1. Components V2 (flags & 32768) — texto dentro da árvore de componentes
  const isV2 = (message.flags?.bitfield ?? message.flags ?? 0) & 32768;
  if (isV2 && message.components?.length > 0) {
    const raw = message.toJSON?.() ?? { components: [] };
    const textoV2 = extrairTextoV2(raw.components)
      .replace(/^>\s*/gm, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,3}\s*/g, '');
    const doV2 = parseContent(textoV2);
    for (const [k, v] of Object.entries(doV2)) {
      if (!dados[k]) dados[k] = v;
    }
    // Menções inline: captura <@ID> logo após "Comprador" mesmo sem ":" separando
    if (!dados.comprador) {
      const m = textoV2.match(/[Cc]omprador[^\n<]*(<@!?\d+>)/);
      if (m) dados.comprador = m[1];
    }
    if (!dados.comprovante) {
      const m = textoV2.match(/[Cc]omprovante[^\n]*(https:\/\/\S+)/);
      if (m) dados.comprovante = m[1];
    }
  }

  // 2. Embed fields
  if (message.embeds?.length > 0 && message.embeds[0].fields?.length > 0) {
    const doFields = parseEmbedFields(message.embeds[0].fields);
    for (const [k, v] of Object.entries(doFields)) {
      if (!dados[k]) dados[k] = v;
    }
  }

  // 3. Embed description (formato "> Campo: valor")
  if (message.embeds?.[0]?.description) {
    const descricao = message.embeds[0].description
      .replace(/^>\s*/gm, '')
      .replace(/\*\*/g, '');
    const doDesc = parseContent(descricao);
    for (const [k, v] of Object.entries(doDesc)) {
      if (!dados[k]) dados[k] = v;
    }
  }

  // 4. Fallback no content
  if (message.content) {
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
