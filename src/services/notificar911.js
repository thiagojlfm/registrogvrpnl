const CANAL_911_ID = process.env.CANAL_INTEGRACAO_911_ID;

async function notificar911(client, dados) {
  if (!CANAL_911_ID) return;
  try {
    const canal = await client.channels.fetch(CANAL_911_ID);
    await canal.send(JSON.stringify(dados));
  } catch (err) {
    console.error('[911] Falha ao notificar 911-bot:', err.message);
  }
}

module.exports = { notificar911 };
