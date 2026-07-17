const fs = require('fs');
const path = require('path');
const { dbPath } = require('../../config/config');

// Write atômico: grava em .tmp e renomeia — evita JSON corrompido se processo morrer no meio
function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

// Leitura segura com fallback — nunca deixa o bot não subir por JSON corrompido
function safeRead(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    console.error(`[db] JSON corrompido em ${path.basename(filePath)} — restaurando fallback`);
    const backup = filePath + '.bak';
    if (fs.existsSync(backup)) {
      try { return JSON.parse(fs.readFileSync(backup, 'utf8')); } catch {}
    }
    return fallback;
  }
}

// Grava e mantém backup da versão anterior
function safeWrite(filePath, data) {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  // Backup da versão atual antes de sobrescrever
  if (fs.existsSync(filePath)) {
    try { fs.copyFileSync(filePath, filePath + '.bak'); } catch {}
  }
  atomicWrite(filePath, serialized);
}

const veiculosPath       = path.join(dbPath, 'veiculos.json');
const pendentesPath      = path.join(dbPath, 'pendentes.json');
const pagamentosPath     = path.join(dbPath, 'pagamentos_pendentes.json');
const importsPath        = path.join(dbPath, 'imports_processados.json');
const cotacoesPath       = path.join(dbPath, 'cotacoes.json');
const comissoesPath      = path.join(dbPath, 'comissoes.json');
const bonusCooldownsPath = path.join(dbPath, 'bonus_cooldowns.json');

const EXPIRY_MS   = 30 * 60 * 1000;
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

// ── Write-queue por arquivo (evita race conditions em writes concorrentes) ──────
const _queues = {};
function withLock(filePath, fn) {
  const prev = _queues[filePath] || Promise.resolve();
  const next = prev.then(fn).catch(err => { throw err; });
  _queues[filePath] = next.catch(() => {});
  return next;
}

function ensureFiles() {
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
  if (!fs.existsSync(veiculosPath))       fs.writeFileSync(veiculosPath, '[]');
  if (!fs.existsSync(pendentesPath))      fs.writeFileSync(pendentesPath, '{}');
  if (!fs.existsSync(pagamentosPath))     fs.writeFileSync(pagamentosPath, '[]');
  if (!fs.existsSync(importsPath))        fs.writeFileSync(importsPath, '[]');
  if (!fs.existsSync(cotacoesPath))       fs.writeFileSync(cotacoesPath, '{}');
  if (!fs.existsSync(comissoesPath))      fs.writeFileSync(comissoesPath, '[]');
  if (!fs.existsSync(bonusCooldownsPath)) fs.writeFileSync(bonusCooldownsPath, '{}');
}

ensureFiles();

// ── Imports processados ───────────────────────────────────────────────────────

function lerImportsProcessados() {
  return new Set(safeRead(importsPath, []));
}

function marcarImportProcessado(messageId) {
  return withLock(importsPath, () => {
    const ids = safeRead(importsPath, []);
    if (!ids.includes(messageId)) {
      ids.push(messageId);
      safeWrite(importsPath, ids);
    }
  });
}

// ── Veículos ──────────────────────────────────────────────────────────────────

function lerVeiculos() {
  return safeRead(veiculosPath, []);
}

function salvarVeiculos(veiculos) {
  safeWrite(veiculosPath, veiculos);
}

function buscarVeiculoPorPlaca(placa) {
  return lerVeiculos().find(v => v.placa.toLowerCase() === placa.toLowerCase() && v.ativo) || null;
}

function buscarVeiculosPorProprietario(discordId) {
  return lerVeiculos().filter(v => v.comprador_id === discordId && v.ativo);
}

function buscarVeiculoPorVin(vin) {
  return lerVeiculos().find(v => v.vin === vin) || null;
}

function adicionarVeiculo(veiculo) {
  return withLock(veiculosPath, () => {
    const lista = lerVeiculos();
    lista.push(veiculo);
    salvarVeiculos(lista);
  });
}

function atualizarVeiculo(vin, dados) {
  return withLock(veiculosPath, () => {
    const lista = lerVeiculos();
    const idx = lista.findIndex(v => v.vin === vin);
    if (idx === -1) return false;
    lista[idx] = { ...lista[idx], ...dados };
    salvarVeiculos(lista);
    return true;
  });
}

function removerVeiculo(vin) {
  return withLock(veiculosPath, () => {
    const lista = lerVeiculos();
    const idx = lista.findIndex(v => v.vin === vin);
    if (idx === -1) return false;
    lista[idx].ativo = false;
    salvarVeiculos(lista);
    return true;
  });
}

// Operação atômica: desativa anterior e adiciona novo em único write
function substituirVeiculoBonus(discordId, tipo, novoVeiculo) {
  return withLock(veiculosPath, () => {
    const lista = lerVeiculos();
    const idx = lista.findIndex(v => v.ativo && v.comprador_id === discordId && v.tipo_bonus === tipo);
    if (idx !== -1) lista[idx].ativo = false;
    lista.push(novoVeiculo);
    salvarVeiculos(lista);
  });
}

// ── Pendentes ─────────────────────────────────────────────────────────────────

function lerPendentes() {
  return safeRead(pendentesPath, {});
}

function salvarPendentes(pendentes) {
  safeWrite(pendentesPath, pendentes);
}

function getPendente(discordId) {
  return lerPendentes()[discordId] || null;
}

function setPendente(discordId, dados) {
  return withLock(pendentesPath, () => {
    const pendentes = lerPendentes();
    pendentes[discordId] = dados;
    salvarPendentes(pendentes);
  });
}

function removerPendente(discordId) {
  return withLock(pendentesPath, () => {
    const pendentes = lerPendentes();
    delete pendentes[discordId];
    salvarPendentes(pendentes);
  });
}

// ── Pagamentos pendentes ──────────────────────────────────────────────────────

function lerPagamentos() {
  return safeRead(pagamentosPath, []);
}

function salvarPagamentos(pagamentos) {
  safeWrite(pagamentosPath, pagamentos);
}

function adicionarPagamento(dados) {
  return withLock(pagamentosPath, () => {
    const pagamentos = lerPagamentos();
    const filtrado = pagamentos.filter(p => p.payer_id !== dados.payer_id);
    filtrado.push(dados);
    salvarPagamentos(filtrado);
  });
}

function getPagamentoPendente(payerId) {
  const agora = Date.now();
  return lerPagamentos().find(
    p => p.payer_id === payerId && !p.usado && (agora - p.timestamp) < EXPIRY_MS
  ) || null;
}

function marcarPagamentoUsado(payerId) {
  return withLock(pagamentosPath, () => {
    const pagamentos = lerPagamentos();
    const idx = pagamentos.findIndex(p => p.payer_id === payerId && !p.usado);
    if (idx === -1) return false;
    pagamentos[idx].usado = true;
    salvarPagamentos(pagamentos);
    return true;
  });
}

function limparPagamentosExpirados() {
  return withLock(pagamentosPath, () => {
    const agora = Date.now();
    salvarPagamentos(lerPagamentos().filter(p => !p.usado && (agora - p.timestamp) < EXPIRY_MS));
  });
}

// ── Veículo Bônus cooldowns ───────────────────────────────────────────────────

function lerBonusCooldowns() {
  return safeRead(bonusCooldownsPath, {});
}

function getBonusCooldown(discordId, tipo) {
  return lerBonusCooldowns()[`${discordId}:${tipo}`] || null;
}

function setBonusCooldown(discordId, tipo) {
  return withLock(bonusCooldownsPath, () => {
    const cooldowns = lerBonusCooldowns();
    cooldowns[`${discordId}:${tipo}`] = Date.now();
    safeWrite(bonusCooldownsPath, cooldowns);
  });
}

function podeTrocarBonus(discordId, tipo) {
  const ts = getBonusCooldown(discordId, tipo);
  if (!ts) return { pode: true, restante: 0 };
  const restante = SETE_DIAS_MS - (Date.now() - ts);
  return restante <= 0 ? { pode: true, restante: 0 } : { pode: false, restante };
}

// ── Cotações ──────────────────────────────────────────────────────────────────

function lerCotacoes() {
  return safeRead(cotacoesPath, {});
}

function salvarCotacoes(cotacoes) {
  safeWrite(cotacoesPath, cotacoes);
}

function setCotacao(topicoId, dados) {
  return withLock(cotacoesPath, () => {
    const cotacoes = lerCotacoes();
    cotacoes[topicoId] = dados;
    salvarCotacoes(cotacoes);
  });
}

function getCotacao(topicoId) {
  return lerCotacoes()[topicoId] || null;
}

function removerCotacaoPorMensagem(messageId) {
  return withLock(cotacoesPath, () => {
    const cotacoes = lerCotacoes();
    const topicoId = Object.keys(cotacoes).find(k => cotacoes[k].message_id === messageId);
    if (!topicoId) return null;
    const dados = cotacoes[topicoId];
    delete cotacoes[topicoId];
    salvarCotacoes(cotacoes);
    return dados;
  });
}

// ── Comissões ─────────────────────────────────────────────────────────────────

function lerComissoes() {
  return safeRead(comissoesPath, []);
}

function salvarComissoes(comissoes) {
  safeWrite(comissoesPath, comissoes);
}

function registrarComissao(dados) {
  return withLock(comissoesPath, () => {
    const comissoes = lerComissoes();
    const num = comissoes.length + 1;
    comissoes.push({ num, ...dados });
    salvarComissoes(comissoes);
    return num;
  });
}

module.exports = {
  lerImportsProcessados,
  marcarImportProcessado,
  lerVeiculos,
  salvarVeiculos,
  lerPendentes,
  salvarPendentes,
  buscarVeiculoPorPlaca,
  buscarVeiculosPorProprietario,
  buscarVeiculoPorVin,
  adicionarVeiculo,
  atualizarVeiculo,
  removerVeiculo,
  substituirVeiculoBonus,
  getPendente,
  setPendente,
  removerPendente,
  lerPagamentos,
  adicionarPagamento,
  getPagamentoPendente,
  marcarPagamentoUsado,
  limparPagamentosExpirados,
  lerCotacoes,
  setCotacao,
  getCotacao,
  removerCotacaoPorMensagem,
  lerComissoes,
  registrarComissao,
  getBonusCooldown,
  setBonusCooldown,
  podeTrocarBonus,
};
