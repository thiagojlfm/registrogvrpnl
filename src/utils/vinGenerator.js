const { lerVeiculos, lerPendentes } = require('../services/database/db');

function gerarDigito() {
  // Simula /roll 1d10: resultado 1-10, onde 10 vira 0
  const roll = Math.floor(Math.random() * 10) + 1;
  return roll === 10 ? 0 : roll;
}

function gerarVinBruto() {
  return Array.from({ length: 9 }, gerarDigito).join('');
}

function vinJaExiste(vin) {
  const veiculos = lerVeiculos();
  if (veiculos.some(v => v.vin === vin)) return true;

  const pendentes = lerPendentes();
  return Object.values(pendentes).flat().some(p => p.vin === vin);
}

function gerarVin() {
  let vin;
  let tentativas = 0;
  do {
    vin = gerarVinBruto();
    tentativas++;
    if (tentativas > 1000) throw new Error('Não foi possível gerar um VIN único após 1000 tentativas.');
  } while (vinJaExiste(vin));
  return vin;
}

module.exports = { gerarVin };
