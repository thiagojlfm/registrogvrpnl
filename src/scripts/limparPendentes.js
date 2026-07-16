/**
 * Script utilitário: remove pendentes com mais de N horas.
 * Uso: node src/scripts/limparPendentes.js [horas]
 * Padrão: 48 horas
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { lerPendentes, salvarPendentes } = require('../services/database/db');

const horas = parseInt(process.argv[2] || '48', 10);
const limiteMs = horas * 60 * 60 * 1000;
const agora = Date.now();

const pendentes = lerPendentes();
let removidos = 0;

for (const [id, p] of Object.entries(pendentes)) {
  if (agora - p.criado_em > limiteMs) {
    delete pendentes[id];
    removidos++;
    console.log(`Removido pendente de ${id} (VIN: ${p.vin}) — criado há ${Math.round((agora - p.criado_em) / 3600000)}h`);
  }
}

salvarPendentes(pendentes);
console.log(`\nConcluído. ${removidos} pendente(s) removido(s).`);
