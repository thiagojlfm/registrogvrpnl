const { createServer } = require('http');
const {
  buscarVeiculoPorVin,
  buscarVeiculoPorPlaca,
  buscarVeiculosPorProprietario,
  atualizarVeiculo,
} = require('./database/db');

const PORT = process.env.PORT || process.env.DMV_API_PORT || 3001;
const SECRET = process.env.DMV_API_SECRET;

function responder(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(dados));
}

function iniciarApiServer() {
  if (!SECRET) {
    console.warn('[api] DMV_API_SECRET não definido — servidor HTTP desabilitado.');
    return;
  }

  const server = createServer(async (req, res) => {
    // Autenticação
    if (req.headers['x-api-key'] !== SECRET) {
      return responder(res, 401, { error: 'Unauthorized' });
    }

    const url = new URL(req.url, `http://localhost`);
    const partes = url.pathname.split('/').filter(Boolean);

    try {
      // GET /vehicle/vin/:vin
      if (req.method === 'GET' && partes[0] === 'vehicle' && partes[1] === 'vin' && partes[2]) {
        const veiculo = buscarVeiculoPorVin(partes[2]);
        return responder(res, 200, veiculo ?? null);
      }

      // GET /vehicle/plate/:placa
      if (req.method === 'GET' && partes[0] === 'vehicle' && partes[1] === 'plate' && partes[2]) {
        const veiculo = buscarVeiculoPorPlaca(decodeURIComponent(partes[2]));
        return responder(res, 200, veiculo ?? null);
      }

      // GET /vehicle/user/:discord_id
      if (req.method === 'GET' && partes[0] === 'vehicle' && partes[1] === 'user' && partes[2]) {
        const veiculos = buscarVeiculosPorProprietario(partes[2]);
        return responder(res, 200, veiculos);
      }

      // PATCH /vehicle/:vin/seguro — atualiza campo seguro no veículo
      if (req.method === 'PATCH' && partes[0] === 'vehicle' && partes[2] === 'seguro' && partes[1]) {
        const vin = partes[1];
        const body = await lerBody(req);
        let dados;
        try { dados = JSON.parse(body); } catch {
          return responder(res, 400, { error: 'Body inválido' });
        }
        const ok = await atualizarVeiculo(vin, { seguro: dados });
        if (!ok) return responder(res, 404, { error: 'Veículo não encontrado' });
        return responder(res, 200, { ok: true });
      }

      responder(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[api] Erro interno:', err.message);
      responder(res, 500, { error: 'Internal server error' });
    }
  });

  server.listen(PORT, () => {
    console.log(`[api] Servidor DMV HTTP rodando na porta ${PORT}`);
  });

  server.on('error', err => {
    console.error('[api] Erro no servidor HTTP:', err.message);
  });
}

function lerBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = { iniciarApiServer };
