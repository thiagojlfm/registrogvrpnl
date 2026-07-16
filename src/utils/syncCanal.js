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

function extrairFotoUrl(components = []) {
  for (const c of components) {
    if (c.type === 12 && c.items?.length) return c.items[0].media?.url || null;
    if (c.components) {
      const found = extrairFotoUrl(c.components);
      if (found) return found;
    }
  }
  return null;
}

function parsearRegistro(texto, msgUrl, msgTimestamp, rawComponents) {
  const get = (pattern) => {
    const m = texto.match(pattern);
    return m ? m[1].trim() : null;
  };

  const strip = (s) => s ? s.replace(/\*\*/g, '').trim() : s;

  const compradorId = get(/<@(\d+)>/);
  const vin         = get(/VIN Number[:\s*`]+([0-9]+)/);
  const placa       = strip(get(/Placa[:\s*`]+([A-Za-z0-9\-]+)/));
  const veiculo     = strip(get(/Ano, marca, modelo[:\s]+(.+)/));
  const modelo      = strip(get(/Versão[:\s]+(.+)/));
  const cor         = strip(get(/Coloração[:\s]+(.+)/));
  const classe      = strip(get(/Classe[:\s]+(?!N\/A)(.+)/));

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
    foto_url: extrairFotoUrl(rawComponents),
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

async function sincronizarCanal(client, { reconciliar = false } = {}) {
  const canal = await client.channels.fetch(canalRegistroVeicularId);
  const veiculosExistentes = lerVeiculos();
  const vinsExistentes = new Map(veiculosExistentes.map(v => [v.vin, v]));

  // VINs encontrados no canal (usado só se reconciliar=true)
  const vinsNoCanal = new Set();

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

      const registro = parsearRegistro(texto, msg.url, msg.createdTimestamp, msg.components);
      if (!registro) continue;

      if (reconciliar) vinsNoCanal.add(registro.vin);

      if (!vinsExistentes.has(registro.vin)) {
        vinsExistentes.set(registro.vin, registro);
        novos++;
      }
    }

    before = mensagens.last()?.id;
    if (mensagens.size < 100) break;
  }

  let removidos = 0;
  let lista = [...vinsExistentes.values()];

  // Remove do banco veículos cujos registros foram apagados do canal
  if (reconciliar) {
    const antes = lista.length;
    lista = lista.filter(v => vinsNoCanal.has(v.vin));
    removidos = antes - lista.length;
  }

  if (novos > 0 || removidos > 0) {
    salvarVeiculos(lista);
    if (novos > 0) console.log(`[sync] ${novos} veículo(s) importado(s) do canal.`);
    if (removidos > 0) console.log(`[sync] ${removidos} veículo(s) removido(s) (registro apagado do canal).`);
  }

  return { novos, removidos };
}

function agendarSyncMeiaNoite(client) {
  const agora = new Date();
  const proximaMeiaNoite = new Date(agora);
  proximaMeiaNoite.setHours(24, 0, 0, 0);
  const msAte = proximaMeiaNoite - agora;

  setTimeout(() => {
    sincronizarCanal(client, { reconciliar: true })
      .then(({ novos, removidos }) =>
        console.log(`[sync/noturno] novos=${novos} removidos=${removidos}`)
      )
      .catch(err => console.error('[sync/noturno] Erro:', err));

    // Repete a cada 24h a partir daí
    setInterval(() => {
      sincronizarCanal(client, { reconciliar: true })
        .then(({ novos, removidos }) =>
          console.log(`[sync/noturno] novos=${novos} removidos=${removidos}`)
        )
        .catch(err => console.error('[sync/noturno] Erro:', err));
    }, 24 * 60 * 60 * 1000);
  }, msAte);

  const h = String(proximaMeiaNoite.getHours()).padStart(2, '0');
  const m = String(proximaMeiaNoite.getMinutes()).padStart(2, '0');
  console.log(`[sync] Próxima reconciliação noturna às ${h}:${m} (em ${Math.round(msAte / 60000)} min)`);
}

module.exports = { sincronizarCanal, agendarSyncMeiaNoite };
