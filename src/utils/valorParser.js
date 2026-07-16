/**
 * Converte string monetária para número inteiro de centavos.
 * Suporta: "$45.563", "$45,563", "45563", "45.563,00", etc.
 */
function normalizarValor(str) {
  if (!str) return null;
  const s = String(str).replace(/[^0-9.,]/g, '');
  if (!s) return null;

  // Vírgula como separador de milhar US: "45,000" (exatamente 3 dígitos após única vírgula, sem ponto)
  if (s.includes(',') && !s.includes('.') && /^[\d,]+$/.test(s) && /,\d{3}$/.test(s)) {
    return Math.round(parseFloat(s.replace(/,/g, '')) * 100);
  }

  // Ponto como separador de milhar BR: "1.000", "45.000" (3 dígitos após ponto, sem vírgula)
  if (s.includes('.') && !s.includes(',') && /\.\d{3}$/.test(s)) {
    return Math.round(parseFloat(s.replace(/\./g, '')) * 100);
  }

  // Formato BR: 45.563,00 → separador decimal é vírgula
  if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    const norm = s.replace(/\./g, '').replace(',', '.');
    return Math.round(parseFloat(norm) * 100);
  }

  // Formato US: 45,563.00 → separador decimal é ponto
  if (s.includes('.') && s.lastIndexOf('.') > s.lastIndexOf(',')) {
    const norm = s.replace(/,/g, '');
    return Math.round(parseFloat(norm) * 100);
  }

  // Sem separador decimal explícito
  return Math.round(parseFloat(s.replace(/,/g, '')) * 100);
}

function valoresConferem(valorA, valorB) {
  if (!valorA || !valorB) return false;
  const a = normalizarValor(valorA);
  const b = normalizarValor(valorB);
  if (a === null || b === null) return false;
  return a === b;
}

/**
 * Extrai o valor monetário de um embed do UnbelievaBoat.
 * Tenta description e fields em busca de "$XXX".
 */
function extrairValorEmbed(embed) {
  const textos = [];
  if (embed.description) textos.push(embed.description);
  if (embed.title) textos.push(embed.title);
  if (embed.author?.name) textos.push(embed.author.name);
  if (embed.footer?.text) textos.push(embed.footer.text);
  if (embed.fields) embed.fields.forEach(f => { textos.push(f.name); textos.push(f.value); });

  for (const texto of textos) {
    // Captura "$10,000", "$ 10,000", "$10.000", etc.
    const match = texto.match(/\$\s*[\d.,]+/);
    if (match) return match[0].replace(/\s/g, '');
  }
  return null;
}

/**
 * Extrai IDs de uma URL de mensagem do Discord.
 * https://discord.com/channels/GUILD/CHANNEL/MESSAGE
 */
function parsearUrlDiscord(url) {
  const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return null;
  return { guildId: match[1], channelId: match[2], messageId: match[3] };
}

module.exports = { normalizarValor, valoresConferem, extrairValorEmbed, parsearUrlDiscord };
