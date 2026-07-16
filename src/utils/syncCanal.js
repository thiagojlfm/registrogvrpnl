const { canalRegistroVeicularId } = require('../config/config');
const { lerVeiculos, salvarVeiculos, atualizarVeiculo } = require('../services/database/db');
const { msgRegistroOficial } = require('./formatter');

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

function strip(s) { return s ? s.replace(/\*\*/g, '').trim() : s; }

function parsearRegistro(texto, msgUrl, msgTimestamp, rawComponents) {
  const get = (pattern) => {
    const m = texto.match(pattern);
    return m ? m[1].trim() : null;
  };

  const compradorId = get(/<@(\d+)>/);
  const vin         = get(/VIN Number[:\s*`]+([0-9]+)/);
  const placa       = strip(get(/Placa[:\s*`]+([A-Za-z0-9\-]+)/));
  const veiculo     = strip(get(/Ano, marca, modelo[:\s]+(.+)/));
  const modelo      = strip(get(/Versão[:\s]+(.+)/));
  const cor         = strip(get(/Coloração[:\s]+(.+)/));
  const classe      = strip(get(/Classe[:\s]+(?!N\/A)(.+)/));
  const empresa     = get(/Nome da empresa[:\s]+(.+)/);
  const empresaLink = get(/Link do registro da empresa[:\s]+(.+)/);
  const finalidade  = get(/Finalidade[:\s]+(.+)/);
  const tipo        = empresa ? 'empresarial' : 'pessoal';
  const linkCotacao         = get(/Cotação\/Orçamento[:\s]+(https?:\/\/\S+)/);
  const comprovante         = get(/Comprovante de Pagamento[:\s]+(https?:\/\/\S+)/);
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

// Extrai VIN + novo proprietário de uma mensagem de TRANSFERÊNCIA
function parsearTransferencia(texto) {
  const get = (pattern) => {
    const m = texto.match(pattern);
    return m ? m[1].trim() : null;
  };
  const vin = get(/VIN Number[:\s*`]+([0-9]+)/);
  // "Comprador: <@id>" aparece depois de "Vendedor"
  const compradorMatch = texto.match(/Comprador[:\s]+<@(\d+)>/);
  const vendedorMatch  = texto.match(/Vendedor[:\s]+<@(\d+)>/);
  if (!vin || !compradorMatch) return null;
  return {
    vin,
    novoProprietarioId: compradorMatch[1],
    exProprietarioId: vendedorMatch ? vendedorMatch[1] : null,
  };
}

async function sincronizarCanal(client, { reconciliar = false } = {}) {
  const canal = await client.channels.fetch(canalRegistroVeicularId);
  const veiculosExistentes = lerVeiculos();
  const vinsExistentes = new Map(veiculosExistentes.map(v => [v.vin, v]));
  const vinsNoCanal = new Set();

  // Mapa vin → última transferência encontrada no canal (mais recente primeiro)
  const transferenciasNoCanal = new Map();

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

      if (texto.includes('VEÍCULO REGISTRADO')) {
        const registro = parsearRegistro(texto, msg.url, msg.createdTimestamp, msg.components);
        if (!registro) continue;
        if (reconciliar) vinsNoCanal.add(registro.vin);
        if (!vinsExistentes.has(registro.vin)) {
          vinsExistentes.set(registro.vin, registro);
          novos++;
        }
      }

      if (texto.includes('TRANSFERÊNCIA DE VEÍCULO')) {
        const t = parsearTransferencia(texto);
        // Guarda apenas a mais recente (mensagens vêm da mais nova para mais antiga)
        if (t && !transferenciasNoCanal.has(t.vin)) {
          transferenciasNoCanal.set(t.vin, t);
        }
      }
    }

    before = mensagens.last()?.id;
    if (mensagens.size < 100) break;
  }

  // Aplica transferências ao banco SEMPRE (independente de reconciliar)
  let atualizados = 0;
  for (const [vin, t] of transferenciasNoCanal) {
    const vDb = vinsExistentes.get(vin);
    if (!vDb) continue;
    if (vDb.comprador_id !== t.novoProprietarioId) {
      const historico = [
        ...(vDb.historico_proprietarios || []),
        { id: t.novoProprietarioId, desde: Date.now() },
      ];
      vDb.comprador_id = t.novoProprietarioId;
      vDb.historico_proprietarios = historico;
      atualizarVeiculo(vin, { comprador_id: t.novoProprietarioId, historico_proprietarios: historico });
      atualizados++;
    }
  }
  if (atualizados > 0) console.log(`[sync] ${atualizados} proprietário(s) atualizados via transferência.`);

  let removidos = 0;
  let lista = [...vinsExistentes.values()];

  if (reconciliar) {
    // Remove veículos sem registro no canal
    const antes = lista.length;
    lista = lista.filter(v => vinsNoCanal.has(v.vin));
    removidos = antes - lista.length;

    // Edita mensagens de registro para refletir o proprietário atual
    for (const [vin, t] of transferenciasNoCanal) {
      const vDb = lista.find(v => v.vin === vin);
      if (!vDb || !vDb.link_registro) continue;
      try {
        const urlMatch = vDb.link_registro.match(/discord\.com\/channels\/\d+\/(\d+)\/(\d+)/);
        if (urlMatch) {
          const canalReg = await client.channels.fetch(urlMatch[1]);
          const msgReg   = await canalReg.messages.fetch(urlMatch[2]);
          await msgReg.edit(msgRegistroOficial({
            ...vDb,
            comprador_id: t.novoProprietarioId,
            _ex_proprietario_id: t.exProprietarioId,
          }));
        }
      } catch (e) {
        console.error(`[sync] Erro ao editar registro VIN ${vin}:`, e.message);
      }
    }
  }

  if (novos > 0 || removidos > 0) {
    salvarVeiculos(lista);
    if (novos > 0)     console.log(`[sync] ${novos} veículo(s) importado(s) do canal.`);
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
      .then(({ novos, removidos }) => console.log(`[sync/noturno] novos=${novos} removidos=${removidos}`))
      .catch(err => console.error('[sync/noturno] Erro:', err));

    setInterval(() => {
      sincronizarCanal(client, { reconciliar: true })
        .then(({ novos, removidos }) => console.log(`[sync/noturno] novos=${novos} removidos=${removidos}`))
        .catch(err => console.error('[sync/noturno] Erro:', err));
    }, 24 * 60 * 60 * 1000);
  }, msAte);

  const h = String(proximaMeiaNoite.getHours()).padStart(2, '0');
  const m = String(proximaMeiaNoite.getMinutes()).padStart(2, '0');
  console.log(`[sync] Próxima reconciliação noturna às ${h}:${m} (em ${Math.round(msAte / 60000)} min)`);
}

module.exports = { sincronizarCanal, agendarSyncMeiaNoite };
