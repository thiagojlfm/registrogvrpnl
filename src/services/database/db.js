const fs = require('fs');
const path = require('path');
const { dbPath } = require('../../config/config');

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
  return new Set(JSON.parse(fs.readFileSync(importsPath, 'utf8')));
}

function marcarImportProcessado(messageId) {
  return withLock(importsPath, () => {
    const ids = JSON.parse(fs.readFileSync(importsPath, 'utf8'));
    if (!ids.includes(messageId)) {
      ids.push(messageId);
      fs.writeFileSync(importsPath, JSON.stringify(ids));
    }
  });
}

// ── Veículos ──────────────────────────────────────────────────────────────────

function lerVeiculos() {
  return JSON.parse(fs.readFileSync(veiculosPath, 'utf8'));
}

function salvarVeiculos(veiculos) {
  fs.writeFileSync(veiculosPath, JSON.stringify(veiculos, null, 2));
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
  return JSON.parse(fs.readFileSync(pendentesPath, 'utf8'));
}

function salvarPendentes(pendentes) {
  fs.writeFileSync(pendentesPath, JSON.stringify(pendentes, null, 2));
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
  return JSON.parse(fs.readFileSync(pagamentosPath, 'utf8'));
}

function salvarPagamentos(pagamentos) {
  fs.writeFileSync(pagamentosPath, JSON.stringify(pagamentos, null, 2));
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
  return JSON.parse(fs.readFileSync(bonusCooldownsPath, 'utf8'));
}

function getBonusCooldown(discordId, tipo) {
  return lerBonusCooldowns()[`${discordId}:${tipo}`] || null;
}

function setBonusCooldown(discordId, tipo) {
  return withLock(bonusCooldownsPath, () => {
    const cooldowns = lerBonusCooldowns();
    cooldowns[`${discordId}:${tipo}`] = Date.now();
    fs.writeFileSync(bonusCooldownsPath, JSON.stringify(cooldowns, null, 2));
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
  return JSON.parse(fs.readFileSync(cotacoesPath, 'utf8'));
}

function salvarCotacoes(cotacoes) {
  fs.writeFileSync(cotacoesPath, JSON.stringify(cotacoes, null, 2));
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
  return JSON.parse(fs.readFileSync(comissoesPath, 'utf8'));
}

function salvarComissoes(comissoes) {
  fs.writeFileSync(comissoesPath, JSON.stringify(comissoes, null, 2));
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
