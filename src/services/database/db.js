const fs = require('fs');
const path = require('path');
const { dbPath } = require('../../config/config');

const veiculosPath = path.join(dbPath, 'veiculos.json');
const pendentesPath = path.join(dbPath, 'pendentes.json');

function ensureFiles() {
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
  if (!fs.existsSync(veiculosPath)) fs.writeFileSync(veiculosPath, '[]');
  if (!fs.existsSync(pendentesPath)) fs.writeFileSync(pendentesPath, '{}');
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

module.exports = {
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
};
