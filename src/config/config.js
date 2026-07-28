require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  idBotImportacao: process.env.ID_BOT_IMPORTACAO,
  idBotEconomia: process.env.ID_BOT_ECONOMIA,
  canalImportacaoId: process.env.CANAL_IMPORTACAO_ID,
  canalRegistroVeicularId: process.env.CANAL_REGISTRO_VEICULAR_ID,
  canalAuditoriaId: process.env.CANAL_AUDITORIA_ID,
  canalConceOffsaleId: '1524196086221246514',
  canalConceLimitedId: '1524462407752089831',
  cargoAtendente: process.env.CARGO_ATENDENTE_ID,
  cargoStaff:     process.env.CARGO_STAFF_ID,
  cargoBooster:   process.env.CARGO_BOOSTER_ID,
  cargoCorrecao:  process.env.CARGO_CORRECAO_ID || '1099870995608780824',
  idBot911: process.env.ID_BOT_911,
  dbPath: process.env.DB_PATH || './data',

  cores: {
    verde:   0x57F287,
    azul:    0x5865F2,
    amarelo: 0xFEE75C,
    vermelho: 0xED4245,
    roxo:    0x9B59B6,
    rosa:    0xFF73FA,
  },

  emojis: {
    carro:    '<:carrogvnl:1480328653186400326>',
    info:     '<:infogvrpnl:1482434301625765928>',
    infoAlt:  '<:info:1373983629746638938>',
    sim:      '<:SimGVRPNL:1228154618048155701>',
    empresa:  '<:Empresa:1500657650499584040>',
    vendido:  '<:carsoldgvrpnl:1499866159409922199>',
    seta:     '<:seta_gvrpnl:1466934295879880888>',
    dot:      '<:white_dot:1373337479721123870>',
    rpc2:     '<:rpc2:1500318320853782669>',
    rpw:      '<:rpw:1500318056809893949>',
    rpc:      '<:rpc:1500318153903706324>',
  },
};
