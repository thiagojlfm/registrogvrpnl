const fs = require('fs');
const path = require('path');
const { dbPath } = require('../../config/config');

const veiculosPath  = path.join(dbPath, 'veiculos.json');
const pendentesPath = path.join(dbPath, 'pendentes.json');
const pagamentosPath = path.join(dbPath, 'pagamentos_pendentes.json');
const importsPath   = path.join(dbPath, 'imports_processados.json');
const cotacoesPath  = path.join(dbPath, 'cotacoes.json');
const comissoesPath = path.join(dbPath, 'comissoes.json');

const EXPIRY_MS = 30 * 60 * 1000; // 30 minutos

function ensureFiles() {
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
  if (!fs.existsSync(veiculosPath))  fs.writeFileSync(veiculosPath, '[]');
  if (!fs.existsSync(pendentesPath)) fs.writeFileSync(pendentesPath, '{}');
  if (!fs.existsSync(pagamentosPath)) fs.writeFileSync(pagamentosPath, '[]');
  if (!fs.existsSync(importsPath))   fs.writeFileSync(importsPath, '[]');
  if (!fs.existsSync(cotacoesPath))  fs.writeFileSync(cotacoesPath, '{}');
  if (!fs.existsSync(comissoesPath)) fs.writeFileSync(comissoesPath, '[]');
}

function lerImportsProcessados() {
  ensureFiles();
  return new Set(JSON.parse(fs.readFileSync(importsPath, 'utf8')));
}

function marcarImportProcessado(messageId) {
  ensureFiles();
  const ids = JSON.parse(fs.readFileSync(importsPath, 'utf8'));
  if (!ids.includes(messageId)) {
    ids.push(messageId);
    fs.writeFileSync(importsPath, JSON.stringify(ids));
  }
}

function lerVeiculos() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(veiculosPath, 'utf8'));
}

function salvarVeiculos(veiculos) {
  ensureFiles();
  fs.writeFileSync(veiculosPath, JSON.stringify(veiculos, null, 2));
}

function lerPendentes() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(pendentesPath, 'utf8'));
}

function salvarPendentes(pendentes) {
  ensureFiles();
  fs.writeFileSync(pendentesPath, JSON.stringify(pendentes, null, 2));
}

function buscarVeiculoPorPlaca(placa) {
  const veiculos = lerVeiculos();
  return veiculos.find(v => v.placa.toLowerCase() === placa.toLowerCase() && v.ativo) || null;
}

function buscarVeiculosPorProprietario(discordId) {
  const veiculos = lerVeiculos();
  return veiculos.filter(v => v.comprador_id === discordId && v.ativo);
}

function buscarVeiculoPorVin(vin) {
  const veiculos = lerVeiculos();
  return veiculos.find(v => v.vin === vin) || null;
}

function adicionarVeiculo(veiculo) {
  const veiculos = lerVeiculos();
  veiculos.push(veiculo);
  salvarVeiculos(veiculos);
}

function atualizarVeiculo(vin, dados) {
  const veiculos = lerVeiculos();
  const idx = veiculos.findIndex(v => v.vin === vin);
  if (idx === -1) return false;
  veiculos[idx] = { ...veiculos[idx], ...dados };
  salvarVeiculos(veiculos);
  return true;
}

function removerVeiculo(vin) {
  const veiculos = lerVeiculos();
  const idx = veiculos.findIndex(v => v.vin === vin);
  if (idx === -1) return false;
  veiculos[idx].ativo = false;
  salvarVeiculos(veiculos);
  return true;
}

function getPendente(discordId) {
  const pendentes = lerPendentes();
  return pendentes[discordId] || null;
}

function setPendente(discordId, dados) {
  const pendentes = lerPendentes();
  pendentes[discordId] = dados;
  salvarPendentes(pendentes);
}

function removerPendente(discordId) {
  const pendentes = lerPendentes();
  delete pendentes[discordId];
  salvarPendentes(pendentes);
}

// ── Pagamentos pendentes (fluxo conce direto) ────────────────────────────────

function lerPagamentos() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(pagamentosPath, 'utf8'));
}

function salvarPagamentos(pagamentos) {
  ensureFiles();
  fs.writeFileSync(pagamentosPath, JSON.stringify(pagamentos, null, 2));
}

function adicionarPagamento(dados) {
  const pagamentos = lerPagamentos();
  // Remove pagamento anterior não usado do mesmo payer (sobrescreve)
  const filtrado = pagamentos.filter(p => p.payer_id !== dados.payer_id);
  filtrado.push(dados);
  salvarPagamentos(filtrado);
}

function getPagamentoPendente(payerId) {
  const pagamentos = lerPagamentos();
  const agora = Date.now();
  return pagamentos.find(
    p => p.payer_id === payerId && !p.usado && (agora - p.timestamp) < EXPIRY_MS
  ) || null;
}

function marcarPagamentoUsado(payerId) {
  const pagamentos = lerPagamentos();
  const idx = pagamentos.findIndex(p => p.payer_id === payerId && !p.usado);
  if (idx === -1) return false;
  pagamentos[idx].usado = true;
  salvarPagamentos(pagamentos);
  return true;
}

function limparPagamentosExpirados() {
  const pagamentos = lerPagamentos();
  const agora = Date.now();
  const ativos = pagamentos.filter(p => !p.usado && (agora - p.timestamp) < EXPIRY_MS);
  salvarPagamentos(ativos);
}

// ── Cotações ──────────────────────────────────────────────────────────────────

function lerCotacoes() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(cotacoesPath, 'utf8'));
}

function salvarCotacoes(cotacoes) {
  ensureFiles();
  fs.writeFileSync(cotacoesPath, JSON.stringify(cotacoes, null, 2));
}

function setCotacao(topicoId, dados) {
  const cotacoes = lerCotacoes();
  cotacoes[topicoId] = dados;
  salvarCotacoes(cotacoes);
}

function getCotacao(topicoId) {
  const cotacoes = lerCotacoes();
  return cotacoes[topicoId] || null;
}

function removerCotacaoPorMensagem(messageId) {
  const cotacoes = lerCotacoes();
  const topicoId = Object.keys(cotacoes).find(k => cotacoes[k].message_id === messageId);
  if (!topicoId) return false;
  delete cotacoes[topicoId];
  salvarCotacoes(cotacoes);
  return true;
}

// ── Comissões ─────────────────────────────────────────────────────────────────

function lerComissoes() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(comissoesPath, 'utf8'));
}

function salvarComissoes(comissoes) {
  ensureFiles();
  fs.writeFileSync(comissoesPath, JSON.stringify(comissoes, null, 2));
}

function registrarComissao(dados) {
  const comissoes = lerComissoes();
  const num = comissoes.length + 1;
  comissoes.push({ num, ...dados });
  salvarComissoes(comissoes);
  return num;
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
};
