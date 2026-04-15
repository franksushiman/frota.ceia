var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_fastify = __toESM(require("fastify"), 1);
var import_cors = __toESM(require("@fastify/cors"), 1);
var import_cookie = __toESM(require("@fastify/cookie"), 1);
var import_websocket = __toESM(require("@fastify/websocket"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_qrcode2 = __toESM(require("qrcode"), 1);

// database.ts
var import_sqlite3 = __toESM(require("sqlite3"), 1);
var import_sqlite = require("sqlite");
var import_path = __toESM(require("path"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var dbPath = process.env.DB_PATH || import_path.default.join(process.cwd(), "database.sqlite");
var db = null;
var dbPromise = null;
var _jwtSecret = null;
async function initDatabase() {
  if (db) return db;
  if (dbPromise) return await dbPromise;
  dbPromise = (0, import_sqlite.open)({ filename: dbPath, driver: import_sqlite3.default.Database }).then(async (database) => {
    console.log("\u2714 Conex\xE3o com SQLite estabelecida (Caminho Absoluto Ativado).");
    await database.exec(`
            CREATE TABLE IF NOT EXISTS configuracoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT, endereco TEXT, whatsapp TEXT, link_cardapio TEXT,
                google_maps_key TEXT, openai_key TEXT, meta_api_token TEXT,
                telegram_bot_token TEXT, lat REAL, lng REAL,
                horarios TEXT, auto_responder INTEGER DEFAULT 0
            );
        `);
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN horarios TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN auto_responder INTEGER DEFAULT 0;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN link_cardapio TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN google_maps_key TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN openai_key TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN meta_api_token TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN telegram_bot_token TEXT;");
    } catch (e) {
    }
    await database.run("DELETE FROM configuracoes WHERE id != 1");
    const check = await database.get("SELECT id FROM configuracoes WHERE id = 1");
    if (!check) {
      await database.run("INSERT INTO configuracoes (id, nome) VALUES (1, 'Minha Base Ceia')");
    }
    await database.exec(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT, mensagem TEXT, data TEXT
            );
        `);
    await database.exec(`
            CREATE TABLE IF NOT EXISTS motoboys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT UNIQUE,
                nome TEXT, cpf TEXT, vinculo TEXT, pix TEXT, veiculo TEXT,
                status TEXT DEFAULT 'OFFLINE',
                lat REAL, lng REAL, ultima_atualizacao TEXT,
                pagamento_pendente INTEGER DEFAULT 0,
                pendente_desde TEXT
            );
        `);
    try {
      await database.exec("ALTER TABLE motoboys ADD COLUMN pagamento_pendente INTEGER DEFAULT 0;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE motoboys ADD COLUMN pendente_desde TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE motoboys ADD COLUMN ultima_nota REAL;");
    } catch (e) {
    }
    await database.exec(`
            CREATE TABLE IF NOT EXISTS entregas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT,
                valor_entrega REAL,
                distancia_km REAL,
                taxa_deslocamento REAL,
                status TEXT DEFAULT 'PENDENTE',
                data TEXT
            );
        `);
    await database.exec(`CREATE TABLE IF NOT EXISTS pedidos (id TEXT PRIMARY KEY, dados_json TEXT)`);
    await database.exec(`CREATE TABLE IF NOT EXISTS pacotes (id TEXT PRIMARY KEY, dados_json TEXT)`);
    await database.exec(`CREATE TABLE IF NOT EXISTS zonas (id TEXT PRIMARY KEY, dados_json TEXT)`);
    await database.exec(`
            CREATE TABLE IF NOT EXISTS historico_motoboys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT,
                tipo TEXT,
                valor REAL,
                descricao TEXT,
                data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    await database.exec(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                whatsapp TEXT UNIQUE NOT NULL,
                senha_hash TEXT NOT NULL,
                telegram_id TEXT UNIQUE
            )
        `);
    await database.exec(`
            CREATE TABLE IF NOT EXISTS nos_parceiros (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                url TEXT NOT NULL,
                ativo INTEGER DEFAULT 1
            )
        `);
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN jwt_secret TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN whatsapp_provider TEXT DEFAULT 'baileys';");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN meta_phone_number_id TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN documento TEXT;");
    } catch (e) {
    }
    try {
      await database.exec("ALTER TABLE configuracoes ADD COLUMN whatsapp_ativo INTEGER DEFAULT 1;");
    } catch (e) {
    }
    await database.exec("CREATE TABLE IF NOT EXISTS tokens_cadastro (token TEXT PRIMARY KEY, usado INTEGER DEFAULT 0, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db = database;
    return database;
  });
  return await dbPromise;
}
async function getConfiguracoes() {
  const database = await initDatabase();
  const config = await database.get("SELECT * FROM configuracoes WHERE id = 1");
  if (config) {
    if (config.horarios) {
      try {
        config.horarios = JSON.parse(config.horarios);
      } catch (e) {
      }
    }
    config.whatsapp_provider = config.whatsapp_provider || "baileys";
    if (config.admin_allowlist) {
      try {
        config.admin_allowlist = JSON.parse(config.admin_allowlist);
      } catch (e) {
        config.admin_allowlist = [];
      }
    } else {
      config.admin_allowlist = [];
    }
  }
  return config;
}
async function updateConfiguracoes(dados) {
  const database = await initDatabase();
  const check = await database.get("SELECT id FROM configuracoes WHERE id = 1");
  if (!check) {
    await database.run("INSERT INTO configuracoes (id, nome) VALUES (1, 'Minha Base Ceia')");
  }
  const query = `
        UPDATE configuracoes SET
            nome                = COALESCE(?, nome),
            documento           = COALESCE(?, documento),
            endereco            = COALESCE(?, endereco),
            whatsapp            = COALESCE(?, whatsapp),
            link_cardapio       = COALESCE(?, link_cardapio),
            google_maps_key     = COALESCE(?, google_maps_key),
            openai_key          = COALESCE(?, openai_key),
            meta_api_token      = COALESCE(?, meta_api_token),
            telegram_bot_token  = COALESCE(?, telegram_bot_token),
            horarios            = COALESCE(?, horarios),
            whatsapp_provider   = COALESCE(?, whatsapp_provider),
            meta_phone_number_id= COALESCE(?, meta_phone_number_id),
            whatsapp_ativo      = COALESCE(?, whatsapp_ativo),
            lat                 = COALESCE(?, lat),
            lng                 = COALESCE(?, lng)
        WHERE id = 1
    `;
  await database.run(query, [
    dados.nome || null,
    //  1
    dados.documento || null,
    //  2
    dados.endereco || null,
    //  3
    dados.whatsapp || null,
    //  4
    dados.link_cardapio || null,
    //  5
    dados.google_maps_key || null,
    //  6
    dados.openai_key || null,
    //  7
    dados.meta_api_token || null,
    //  8
    dados.telegram_bot_token || null,
    //  9
    dados.horarios ? JSON.stringify(dados.horarios) : null,
    // 10
    dados.whatsapp_provider || null,
    // 11
    dados.meta_phone_number_id || null,
    // 12
    dados.whatsapp_ativo !== void 0 ? dados.whatsapp_ativo ? 1 : 0 : null,
    // 13
    dados.lat || null,
    // 14
    dados.lng || null
    // 15
  ]);
}
async function registrarLog(tipo, mensagem) {
  const database = await initDatabase();
  await database.run("INSERT INTO logs (tipo, mensagem, data) VALUES (?, ?, ?)", [tipo, mensagem, (/* @__PURE__ */ new Date()).toISOString()]);
}
async function getMotoboysOnline() {
  const database = await initDatabase();
  return await database.all(`SELECT * FROM motoboys WHERE status IN ('ONLINE', 'EM_ENTREGA')`);
}
async function getFleet() {
  const database = await initDatabase();
  const rows = await database.all("SELECT * FROM motoboys ORDER BY nome ASC");
  return rows.map((m) => ({ ...m, whatsapp: m.whatsapp ?? m.cpf ?? null }));
}
async function getMotoboyByTelegramId(telegram_id) {
  const database = await initDatabase();
  return await database.get("SELECT * FROM motoboys WHERE telegram_id = ?", [telegram_id]);
}
async function upsertFleet(dados) {
  const database = await initDatabase();
  const { telegram_id, ...campos } = dados;
  if (!telegram_id) return;
  if (campos.latitude !== void 0) campos.lat = campos.latitude;
  if (campos.longitude !== void 0) campos.lng = campos.longitude;
  delete campos.latitude;
  delete campos.longitude;
  campos.ultima_atualizacao = (/* @__PURE__ */ new Date()).toISOString();
  const chaves = Object.keys(campos);
  const valores = Object.values(campos);
  if (chaves.length === 0) {
    await database.run("INSERT OR IGNORE INTO motoboys (telegram_id) VALUES (?)", [telegram_id]);
    return;
  }
  const colunasStr = ["telegram_id", ...chaves].join(", ");
  const placeholdersStr = Array(chaves.length + 1).fill("?").join(", ");
  const updateStr = chaves.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  const query = `INSERT INTO motoboys (${colunasStr}) VALUES (${placeholdersStr}) ON CONFLICT(telegram_id) DO UPDATE SET ${updateStr}`;
  await database.run(query, [telegram_id, ...valores]);
}
async function limparRadarInativo() {
  const database = await initDatabase();
  const result = await database.run(`
        UPDATE motoboys SET status = 'OFFLINE'
        WHERE status IN ('ONLINE', 'EM_ENTREGA') AND datetime(ultima_atualizacao) < datetime('now', '-5 minutes')
    `);
  return result.changes || 0;
}
async function deletarMotoboy(telegram_id) {
  const database = await initDatabase();
  await database.run("DELETE FROM motoboys WHERE telegram_id = ?", [telegram_id]);
  await database.run("DELETE FROM entregas WHERE telegram_id = ?", [telegram_id]);
}
async function atualizarMotoboy(telegram_id, veiculo, vinculo, nome, whatsapp, pix) {
  const database = await initDatabase();
  await database.run(
    "UPDATE motoboys SET veiculo = ?, vinculo = ?, nome = COALESCE(?, nome), cpf = COALESCE(?, cpf), pix = COALESCE(?, pix) WHERE telegram_id = ?",
    [veiculo, vinculo, nome || null, whatsapp || null, pix || null, telegram_id]
  );
}
async function registrarEntrega(telegram_id, valor_entrega, taxa_deslocamento = 0) {
  const database = await initDatabase();
  await database.run(`
        INSERT INTO entregas (telegram_id, valor_entrega, distancia_km, taxa_deslocamento, data)
        VALUES (?, ?, ?, ?, ?)
    `, [telegram_id, valor_entrega, 0, taxa_deslocamento, (/* @__PURE__ */ new Date()).toISOString()]);
  return true;
}
async function getExtratoFinanceiro(telegram_id) {
  const database = await initDatabase();
  const entregas = await database.all("SELECT * FROM entregas WHERE telegram_id = ? AND status = 'PENDENTE'", [telegram_id]);
  let total_entregas = 0;
  let total_deslocamento = 0;
  entregas.forEach((e) => {
    total_entregas += e.valor_entrega || 0;
    total_deslocamento += e.taxa_deslocamento || 0;
  });
  return {
    qtd: entregas.length,
    total_entregas,
    total_deslocamento,
    total_geral: total_entregas + total_deslocamento
  };
}
async function zerarAcertoFinanceiro(telegram_id) {
  const database = await initDatabase();
  await database.run("UPDATE entregas SET status = 'PAGO' WHERE telegram_id = ? AND status = 'PENDENTE'", [telegram_id]);
}
async function inserirHistoricoMotoboy(telegram_id, tipo, valor, descricao) {
  const database = await initDatabase();
  await database.run(
    "INSERT INTO historico_motoboys (telegram_id, tipo, valor, descricao) VALUES (?, ?, ?, ?)",
    [telegram_id, tipo, valor, descricao]
  );
}
async function getHistoricoMotoboy(telegram_id) {
  const database = await initDatabase();
  return await database.all(
    "SELECT * FROM historico_motoboys WHERE telegram_id = ? ORDER BY data_criacao DESC LIMIT 100",
    [telegram_id]
  );
}
async function getPedidos() {
  const database = await initDatabase();
  return await database.all("SELECT dados_json FROM pedidos");
}
async function savePedido(pedido) {
  const database = await initDatabase();
  await database.run("INSERT OR REPLACE INTO pedidos (id, dados_json) VALUES (?, ?)", [pedido.id, JSON.stringify(pedido)]);
}
async function deletePedido(id) {
  const database = await initDatabase();
  await database.run("DELETE FROM pedidos WHERE id = ?", [id]);
}
async function clearPedidos() {
  const database = await initDatabase();
  await database.run("DELETE FROM pedidos");
}
async function getPacotes() {
  const database = await initDatabase();
  return await database.all("SELECT dados_json FROM pacotes");
}
async function savePacote(pacote) {
  const database = await initDatabase();
  await database.run("INSERT OR REPLACE INTO pacotes (id, dados_json) VALUES (?, ?)", [pacote.id, JSON.stringify(pacote)]);
}
async function deletePacote(id) {
  const database = await initDatabase();
  await database.run("DELETE FROM pacotes WHERE id = ?", [id]);
}
async function clearPacotes() {
  const database = await initDatabase();
  await database.run("DELETE FROM pacotes");
}
async function getZonas() {
  const database = await initDatabase();
  return await database.all("SELECT dados_json FROM zonas");
}
async function saveZona(zona) {
  const database = await initDatabase();
  await database.run("INSERT OR REPLACE INTO zonas (id, dados_json) VALUES (?, ?)", [zona.id, JSON.stringify(zona)]);
}
async function deleteZona(id) {
  const database = await initDatabase();
  await database.run("DELETE FROM zonas WHERE id = ?", [id]);
}
async function clearZonas() {
  const database = await initDatabase();
  await database.run("DELETE FROM zonas");
}
async function getJwtSecret() {
  if (_jwtSecret) return _jwtSecret;
  const database = await initDatabase();
  const row = await database.get("SELECT jwt_secret FROM configuracoes WHERE id = 1");
  if (row?.jwt_secret) {
    _jwtSecret = row.jwt_secret;
    return _jwtSecret;
  }
  const novo = import_crypto.default.randomBytes(64).toString("hex");
  await database.run("UPDATE configuracoes SET jwt_secret = ? WHERE id = 1", [novo]);
  _jwtSecret = novo;
  return _jwtSecret;
}
async function contarUsuarios() {
  const database = await initDatabase();
  const row = await database.get("SELECT COUNT(*) as cnt FROM usuarios");
  return row?.cnt ?? 0;
}
async function criarUsuario(whatsapp, senha_hash, telegram_id) {
  const database = await initDatabase();
  await database.run(
    "INSERT INTO usuarios (whatsapp, senha_hash, telegram_id) VALUES (?, ?, ?)",
    [whatsapp, senha_hash, telegram_id ?? null]
  );
}
async function getUsuarioPorWhatsapp(whatsapp) {
  const database = await initDatabase();
  return await database.get("SELECT * FROM usuarios WHERE whatsapp = ?", [whatsapp]);
}
async function atualizarSenhaUsuario(id, senha_hash) {
  const database = await initDatabase();
  await database.run("UPDATE usuarios SET senha_hash = ? WHERE id = ?", [senha_hash, id]);
}
async function getNosParceiros() {
  const database = await initDatabase();
  return await database.all("SELECT * FROM nos_parceiros ORDER BY nome ASC");
}
async function saveNoParceiro(id, nome, url) {
  const database = await initDatabase();
  await database.run(
    "INSERT OR REPLACE INTO nos_parceiros (id, nome, url, ativo) VALUES (?, ?, ?, 1)",
    [id, nome, url]
  );
}
async function deleteNoParceiro(id) {
  const database = await initDatabase();
  await database.run("DELETE FROM nos_parceiros WHERE id = ?", [id]);
}
async function limparParceirosNuvemExpirados() {
  const database = await initDatabase();
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString();
  await database.run(
    `DELETE FROM motoboys WHERE vinculo = 'Nuvem' AND (pagamento_pendente = 0 OR pagamento_pendente IS NULL)`
  );
  await database.run(
    `DELETE FROM motoboys WHERE vinculo = 'Nuvem' AND pagamento_pendente = 1 AND pendente_desde < ?`,
    [trintaDiasAtras]
  );
}
async function atualizarCamposMotoboy(telegram_id, campos) {
  const database = await initDatabase();
  const chaves = Object.keys(campos);
  if (chaves.length === 0) return;
  const setStr = chaves.map((c) => `${c} = ?`).join(", ");
  const valores = Object.values(campos);
  await database.run(`UPDATE motoboys SET ${setStr} WHERE telegram_id = ?`, [...valores, telegram_id]);
}
async function gerarTokenCadastro() {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const database = await initDatabase();
  await database.run("INSERT INTO tokens_cadastro (token) VALUES (?)", [token]);
  return token;
}
async function validarEUsarToken(token) {
  const database = await initDatabase();
  const row = await database.get("SELECT * FROM tokens_cadastro WHERE token = ? AND usado = 0", [token]);
  if (!row) return false;
  await database.run("UPDATE tokens_cadastro SET usado = 1 WHERE token = ?", [token]);
  return true;
}

// whatsapp/baileys.ts
var import_baileys = require("@whiskeysockets/baileys");
var import_qrcode = __toESM(require("qrcode"), 1);
var import_pino = __toESM(require("pino"), 1);
var import_openai = __toESM(require("openai"), 1);
var import_fs = __toESM(require("fs"), 1);

// logger.ts
var app = null;
function initLogger(fastifyApp) {
  app = fastifyApp;
}
function broadcastMessage(payload) {
  if (app && app.websocketServer && app.websocketServer.clients) {
    app.websocketServer.clients.forEach(function(client) {
      if (client.readyState === 1) client.send(payload);
    });
  }
}
var broadcastLog = async (tipo, mensagem, dadosExtras = {}) => {
  const payload = JSON.stringify({ tipo, mensagem, data: (/* @__PURE__ */ new Date()).toISOString(), ...dadosExtras });
  await registrarLog(tipo, mensagem);
  broadcastMessage(payload);
  console.log(`[${tipo}] ${mensagem}`);
};

// operacao.ts
async function getRotasAtivas() {
  const pacotesRaw = await getPacotes();
  const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
  const pedidosRaw = await getPedidos();
  const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
  const ativas = [];
  const pacotesAtivos = pacotes.filter((p) => p.status === "PENDENTE_ACEITE" || p.status === "EM_ROTA");
  for (const pacote of pacotesAtivos) {
    if (pacote.motoboy) {
      for (const pedidoId of pacote.pedidosIds) {
        const pedido = pedidos.find((p) => p.id === pedidoId);
        if (pedido) {
          ativas.push({
            pacoteId: pacote.id,
            telegram_id: pacote.motoboy.telegram_id,
            pedido
          });
        }
      }
    }
  }
  return ativas;
}
async function getRotasMotoboy(telegram_id) {
  const rotas = await getRotasAtivas();
  return rotas.filter((r) => r.telegram_id === telegram_id);
}
async function getRotaPeloCliente(telefoneCliente) {
  const numeroLimpo = telefoneCliente.replace(/\D/g, "");
  const nucleoBuscado = numeroLimpo.slice(-8);
  const rotas = await getRotasAtivas();
  return rotas.find((r) => {
    const telPedido = (r.pedido?.telefone || r.pedido?.telefone_cliente || r.pedido?.whatsapp || "").replace(/\D/g, "");
    const nucleoPedido = telPedido.slice(-8);
    return nucleoPedido === nucleoBuscado;
  });
}
async function processarBaixaPeloTelegram(telegram_id, codigo) {
  const rotas = await getRotasAtivas();
  const rota = rotas.find((r) => r.telegram_id === telegram_id && r.pedido.codigo_entrega === codigo);
  if (rota) {
    await registrarEntrega(telegram_id, rota.pedido.taxa);
    const pacotesRaw = await getPacotes();
    const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
    const pacote = pacotes.find((p) => p.id === rota.pacoteId);
    if (pacote) {
      pacote.pedidosIds = pacote.pedidosIds.filter((id) => id !== rota.pedido.id);
      if (pacote.pedidosIds.length === 0) {
        await deletePacote(pacote.id);
      } else {
        await savePacote(pacote);
      }
    }
    await deletePedido(rota.pedido.id);
    const payload = JSON.stringify({ tipo: "BAIXA_PEDIDO", mensagem: "Baixa pelo App", pedidoId: rota.pedido.id, data: (/* @__PURE__ */ new Date()).toISOString() });
    broadcastMessage(payload);
    await registrarLog("FINANCEIRO", `Motoboy confirmou entrega via Telegram (Cod: ${codigo}).`);
    return true;
  }
  return false;
}

// telegramBot.ts
var import_telegraf = require("telegraf");
var userSessions = {};
var bot = null;
var botLaunchPromise = null;
async function enviarMensagemTelegram(telegram_id, texto) {
  if (bot === null) {
    console.error("[DEBUG TELEGRAM] ERRO FATAL: O bot esta null na hora de enviar");
    return false;
  }
  try {
    await bot.telegram.sendMessage(telegram_id, texto);
    console.log("[DEBUG TELEGRAM] Telegram confirmou o envio com sucesso");
    return true;
  } catch (e) {
    console.error("[DEBUG TELEGRAM] Falha cr\xEDtica ao enviar:", e);
    return false;
  }
}
async function repassarConviteNuvem(telegram_id, dados_loja) {
  if (!bot) return false;
  const dist = dados_loja.distancia_km ?? 0;
  const taxaDesl = dados_loja.taxa_deslocamento_brl || dados_loja.taxa_estimada || 0;
  const taxaEnt = dados_loja.taxa_entrega ?? 0;
  const total = dados_loja.valor_total ?? taxaDesl + taxaEnt;
  const pacoteId = dados_loja.pacote_id ?? "";
  const texto = `\u2601\uFE0F *CHAMADO NUVEM* \u2601\uFE0F\\
\\
A loja *${dados_loja.loja_destino_nome}* precisa de um motoboy para uma entrega.\\
\\
\u{1F4CD} Dist\xE2ncia: ${dist.toFixed(2)} km\\
\u{1F4B0} Taxa de Deslocamento: R$ ${taxaDesl.toFixed(2)}\\
\u{1F4E6} Taxa da Entrega: R$ ${taxaEnt.toFixed(2)}\\
\u{1F4B5} *Total: R$ ${total.toFixed(2)}*`;
  try {
    const botoes = pacoteId ? [import_telegraf.Markup.button.callback("\u2705 Aceitar", `aceitar_nuvem_${pacoteId}`), import_telegraf.Markup.button.callback("\u274C Recusar", "recusar_nuvem")] : [import_telegraf.Markup.button.url("\u2705 Aceitar Rota", dados_loja.link_bot_destino || "https://t.me/"), import_telegraf.Markup.button.callback("\u274C Recusar", "recusar_nuvem")];
    await bot.telegram.sendMessage(telegram_id, texto, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      ...import_telegraf.Markup.inlineKeyboard([botoes])
    });
    return true;
  } catch (e) {
    console.error("Falha ao repassar convite nuvem:", e);
    return false;
  }
}
async function enviarConfirmacaoPagamento(telegram_id, motoboyId, valorTotal) {
  if (!bot) return false;
  try {
    await bot.telegram.sendMessage(
      telegram_id,
      `\u{1F4B8} Pagamento de R$ ${valorTotal.toFixed(2)} registrado. Voc\xEA confirma que recebeu?`,
      {
        ...import_telegraf.Markup.inlineKeyboard([
          import_telegraf.Markup.button.callback("\u2705 Sim, recebi", `confirmar_pgto_${motoboyId}`),
          import_telegraf.Markup.button.callback("\u274C Ainda n\xE3o", `pgto_pendente_${motoboyId}`)
        ])
      }
    );
    return true;
  } catch (e) {
    console.error("[TELEGRAM] Falha ao enviar confirma\xE7\xE3o de pagamento:", e);
    return false;
  }
}
async function enviarConviteRotaTelegram(telegram_id, texto, pacoteId) {
  if (!bot) return false;
  try {
    await bot.telegram.sendMessage(telegram_id, texto, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      ...import_telegraf.Markup.inlineKeyboard([
        import_telegraf.Markup.button.callback("\u2705 Aceitar Rota", `aceitar_${pacoteId}`),
        import_telegraf.Markup.button.callback("\u274C Recusar", `recusar_${pacoteId}`)
      ])
    });
    return true;
  } catch (e) {
    return false;
  }
}
async function iniciarTelegram() {
  try {
    if (bot) {
      bot.stop("RELOAD");
      bot = null;
      if (botLaunchPromise) {
        await botLaunchPromise.catch(() => {
        });
        botLaunchPromise = null;
      }
    }
    const config = await getConfiguracoes();
    const token = config.telegram_bot_token;
    if (!token) {
      broadcastLog("TELEGRAM", "Token n\xE3o configurado. Adicione no painel QG Log\xEDstico.");
      return;
    }
    bot = new import_telegraf.Telegraf(token);
    bot.catch((err, ctx) => {
      console.error(`[TELEGRAM ERROR] Falha ao processar requisi\xE7\xE3o para ${ctx.updateType}:`, err);
    });
    const updateProgress = async (chatId, field, value, nextStep) => {
      try {
        const dadosAcumulados = userSessions[chatId]?.data || {};
        const dadosParaBanco = {
          telegram_id: chatId.toString(),
          ...dadosAcumulados,
          [field]: value,
          status: "CADASTRANDO"
        };
        if (dadosParaBanco.whatsapp !== void 0) {
          dadosParaBanco.cpf = dadosParaBanco.whatsapp;
          delete dadosParaBanco.whatsapp;
        }
        await upsertFleet(dadosParaBanco);
        if (userSessions[chatId]) {
          userSessions[chatId].data[field] = value;
          if (nextStep) userSessions[chatId].step = nextStep;
        }
      } catch (error) {
        console.error(`[ERRO BANCO DE DADOS] Falha ao salvar o campo ${field}:`, error);
        throw error;
      }
    };
    const defaultKeyboard = import_telegraf.Markup.keyboard([
      ["\u{1F198} Pedir Ajuda (SOS)", "\u{1F4AC} Falar com Cliente"]
    ]).resize();
    const checarCadastro = async (telegramId, ctx) => {
      const motoboy = await getMotoboyByTelegramId(telegramId);
      if (!motoboy) {
        try {
          await ctx.reply("\u26A0\uFE0F Acesso negado. Seu cadastro foi removido ou n\xE3o encontrado na base deste estabelecimento.");
        } catch (e) {
        }
        return false;
      }
      return true;
    };
    bot.start(async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const startPayload = ctx.startPayload;
        if (startPayload && startPayload.startsWith("nuvem_")) {
          const pacoteId = startPayload.replace("nuvem_", "");
          const motoboyExistente = await getMotoboyByTelegramId(chatId.toString());
          const nomeNuvem = motoboyExistente?.nome || ctx.from.first_name || "Motoboy";
          await upsertFleet({ telegram_id: chatId.toString(), nome: nomeNuvem, vinculo: "Nuvem", status: "CADASTRANDO" });
          userSessions[chatId] = { step: "AGUARDANDO_GPS_NUVEM", data: { pacote_id_nuvem: pacoteId } };
          broadcastLog("NUVEM", `Motoboy ${nomeNuvem} aceitou um convite da rede e est\xE1 se registrando.`);
          await ctx.reply(`Bem-vindo \xE0 loja! Voc\xEA aceitou a rota Nuvem. \u2601\uFE0F\u{1F6F5}\\
\\
\u{1F4CD} **\xDALTIMO PASSO:** Como voc\xEA mudou para o bot da loja, precisamos do seu GPS para rastrear sua chegada. Toque no \xEDcone de clipe (\u{1F4CE}), escolha "Localiza\xE7\xE3o" e envie sua **Localiza\xE7\xE3o em Tempo Real** aqui no chat para liberar os detalhes da entrega.`, import_telegraf.Markup.removeKeyboard());
          return;
        }
        const tokenValido = startPayload ? await validarEUsarToken(startPayload) : false;
        if (!tokenValido) {
          const config3 = await getConfiguracoes();
          await ctx.reply(`\u26A0\uFE0F Voc\xEA n\xE3o faz parte da frota deste restaurante. Para participar, leia o QR Code na tela do computador no restaurante ${config3?.nome || "local"}.`);
          return;
        }
        const existente = await getMotoboyByTelegramId(chatId.toString());
        if (existente && existente.vinculo === "Nuvem") {
          await atualizarCamposMotoboy(chatId.toString(), { vinculo: null, status: "CADASTRANDO" });
        }
        userSessions[chatId] = { step: "NOME", data: {} };
        const config2 = await getConfiguracoes();
        await ctx.reply(`Ol\xE1! Bem-vindo \xE0 frota do ${config2?.nome || "Restaurante"}! \u{1F6F5}\u{1F4A8}\\
Vamos iniciar seu cadastro. Por favor, digite seu **Nome Completo**:`, import_telegraf.Markup.removeKeyboard());
      } catch (e) {
      }
    });
    bot.hears("\u{1F198} Pedir Ajuda (SOS)", async (ctx) => {
      if (!await checarCadastro(ctx.chat.id.toString(), ctx)) return;
      const motoboyAtual = await getMotoboyByTelegramId(ctx.chat.id.toString());
      if (motoboyAtual?.status === "OFFLINE" || motoboyAtual?.status === "CADASTRANDO") {
        await ctx.reply("\u26A0\uFE0F Voc\xEA precisa estar em expediente (ONLINE) para acionar o socorro. Compartilhe sua localiza\xE7\xE3o em tempo real para bater o ponto.");
        return;
      }
      const nome = motoboyAtual?.nome?.split(" ")[0] || "Um motoboy";
      userSessions[ctx.chat.id] = { step: "SOS_CHAT", data: {} };
      broadcastLog("SOS", `O motoboy ${nome} acionou o ALARME DE EMERG\xCANCIA!`, { telegram_id: ctx.chat.id.toString() });
      await ctx.reply("\u{1F6A8} Seu sinal de emerg\xEAncia foi enviado para a base. Aguarde, a loja vai entrar em contato com voc\xEA imediatamente.", import_telegraf.Markup.inlineKeyboard([
        import_telegraf.Markup.button.callback("\u2716\uFE0F Encerrar Emerg\xEAncia", "cancelar_chat")
      ]));
    });
    bot.hears("\u{1F4AC} Falar com Cliente", async (ctx) => {
      if (!await checarCadastro(ctx.chat.id.toString(), ctx)) return;
      const motoboyAtual = await getMotoboyByTelegramId(ctx.chat.id.toString());
      if (motoboyAtual?.status === "OFFLINE" || motoboyAtual?.status === "CADASTRANDO") {
        await ctx.reply("\u26A0\uFE0F Voc\xEA precisa estar em expediente (ONLINE) para falar com o cliente.");
        return;
      }
      const chatId = ctx.chat.id.toString();
      const rotas = await getRotasMotoboy(chatId);
      if (rotas.length === 0) return ctx.reply("Voc\xEA n\xE3o tem nenhuma rota ativa no momento.");
      const botoes = rotas.map((r) => [import_telegraf.Markup.button.callback(`Falar com ${r.pedido.nomeCliente.split(" ")[0]}`, `chat_${r.pedido.id}`)]);
      await ctx.reply("Com qual cliente voc\xEA precisa falar?", import_telegraf.Markup.inlineKeyboard(botoes));
    });
    bot.action(/^chat_(.+)$/, async (ctx) => {
      if (!await checarCadastro(ctx.chat.id.toString(), ctx)) {
        await ctx.answerCbQuery();
        return;
      }
      const pedidoId = ctx.match[1];
      const chatId = ctx.chat.id;
      const rotas = await getRotasMotoboy(chatId.toString());
      const rota = rotas.find((r) => r.pedido.id === pedidoId);
      if (!rota) return ctx.answerCbQuery("Pedido n\xE3o encontrado ou j\xE1 finalizado.");
      userSessions[chatId] = { step: "CHAT_CLIENTE", data: { telefone_cliente: rota.pedido.telefone || rota.pedido.telefoneCliente || rota.pedido.whatsapp || rota.pedido.telefone_cliente, nome_cliente: rota.pedido.nomeCliente } };
      await ctx.editMessageText(`Aberta linha direta com *${rota.pedido.nomeCliente.split(" ")[0]}*.\\
\\
Digite a mensagem abaixo e eu enviarei para o WhatsApp do cliente de forma oculta.`, {
        parse_mode: "Markdown",
        ...import_telegraf.Markup.inlineKeyboard([
          import_telegraf.Markup.button.callback("\u2716\uFE0F Encerrar Conversa", "cancelar_chat")
        ])
      });
      await ctx.answerCbQuery();
    });
    bot.action(/^aceitar_nuvem_(.+)$/, async (ctx) => {
      const pacoteId = ctx.match[1];
      await ctx.answerCbQuery("Convite aceito!");
      const chatId = ctx.chat.id;
      const motoboyExistente = await getMotoboyByTelegramId(chatId.toString());
      const nomeNuvem = motoboyExistente?.nome || ctx.from.first_name || "Motoboy";
      await upsertFleet({ telegram_id: chatId.toString(), nome: nomeNuvem, vinculo: "Nuvem", status: "CADASTRANDO" });
      userSessions[chatId] = { step: "AGUARDANDO_GPS_NUVEM", data: { pacote_id_nuvem: pacoteId } };
      broadcastLog("NUVEM", `Motoboy aceitou chamado Nuvem para pacote ${pacoteId}.`, { pacoteId });
      try {
        await ctx.editMessageText((ctx.callbackQuery.message?.text ?? "") + "\n\n\u2705 *ACEITO!*", { parse_mode: "Markdown" });
        await ctx.reply(`Voc\xEA aceitou a rota Nuvem. \u2601\uFE0F\u{1F6F5}\\
\\
\u{1F4CD} **\xDALTIMO PASSO:** Precisamos do seu GPS para rastrear sua chegada. Toque no \xEDcone de clipe (\u{1F4CE}), escolha "Localiza\xE7\xE3o" e envie sua **Localiza\xE7\xE3o em Tempo Real** aqui no chat para avisar o cliente e liberar os detalhes da entrega.`, import_telegraf.Markup.removeKeyboard());
      } catch (_e) {
      }
    });
    bot.action(/^confirmar_pgto_(.+)$/, async (ctx) => {
      const motoboyId = ctx.match[1];
      await ctx.answerCbQuery("Confirma\xE7\xE3o registrada!");
      const motoboy = await getMotoboyByTelegramId(motoboyId);
      const nome = motoboy?.nome || motoboyId;
      if (!motoboy || motoboy.vinculo === "Nuvem") {
        await deletarMotoboy(motoboyId);
        try {
          await ctx.editMessageText("\u2705 Pagamento confirmado! Obrigado por rodar com a gente. At\xE9 a pr\xF3xima!");
        } catch (_e) {
        }
        broadcastLog("FINANCEIRO", `Motoboy ${nome} confirmou recebimento e foi removido.`);
      } else {
        await atualizarCamposMotoboy(motoboyId, { pagamento_pendente: 0, pendente_desde: null, status: "ONLINE" });
        try {
          await ctx.editMessageText("\u2705 Pagamento confirmado! Bom trabalho. Voc\xEA est\xE1 de volta ao ONLINE.");
        } catch (_e) {
        }
        broadcastLog("FINANCEIRO", `Motoboy fixo ${nome} confirmou recebimento e voltou para ONLINE.`);
      }
    });
    bot.action(/^pgto_pendente_(.+)$/, async (ctx) => {
      const motoboyId = ctx.match[1];
      await ctx.answerCbQuery("Sinalizado!");
      try {
        await ctx.editMessageText("\u26A0\uFE0F Entendido. O lojista ser\xE1 notificado. Por favor, entre em contato.");
      } catch (_e) {
      }
      const motoboy = await getMotoboyByTelegramId(motoboyId);
      const nome = motoboy?.nome || motoboyId;
      await atualizarCamposMotoboy(motoboyId, {
        pagamento_pendente: 1,
        pendente_desde: (/* @__PURE__ */ new Date()).toISOString(),
        status: "OFFLINE"
      });
      broadcastLog("ALERTA", `Motoboy ${nome} sinalizou n\xE3o recebimento.`);
    });
    bot.action(/^aceitar_(.+)$/, async (ctx) => {
      if (!await checarCadastro(ctx.chat.id.toString(), ctx)) {
        await ctx.answerCbQuery();
        return;
      }
      const pacoteId = ctx.match[1];
      const motoboyDb = await getMotoboyByTelegramId(ctx.from.id.toString());
      const nomeMotoboyAceite = motoboyDb?.nome?.split(" ")[0] || "Um parceiro";
      broadcastLog("ACEITE_ROTA", `${nomeMotoboyAceite} confirmou a rota!`, { pacoteId });
      await ctx.editMessageText(ctx.callbackQuery.message?.text + "\n\n\u2705 *ROTA ACEITA!* Pode iniciar o deslocamento.", { parse_mode: "Markdown", disable_web_page_preview: true });
      await ctx.answerCbQuery("Rota Aceita!");
      const pacotesRaw = await getPacotes();
      const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
      const pacote = pacotes.find((p) => p.id === pacoteId);
      const pedidosRaw = await getPedidos();
      const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
      if (pacote) {
        pacote.motoboy = { telegram_id: ctx.from.id.toString(), nome: motoboyDb?.nome || "Parceiro" };
        pacote.status = "EM_ROTA";
        const pedidosDoPacote = (pacote.pedidosIds || []).map((id) => pedidos.find((p) => p.id === id)).filter(Boolean);
        if (pedidosDoPacote.length > 0) pacote.pedidos_snapshot = pedidosDoPacote;
        await savePacote(pacote);
        await atualizarCamposMotoboy(ctx.from.id.toString(), { status: "EM_ENTREGA" });
        for (const pId of pacote.pedidosIds || []) {
          const p = pedidos.find((ped) => ped.id === pId);
          const telefoneCliente = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
          if (p && telefoneCliente) {
            const num = telefoneCliente.replace(/\D/g, "");
            if (num.length >= 10) {
              const nomeSplit = p.nomeCliente ? p.nomeCliente.split(" ")[0] : "cliente";
              const msgCliente = `Ol\xE1, ${nomeSplit}! O seu pedido acabou de sair para entrega com o parceiro *${pacote.motoboy.nome}*. \u{1F6F5}\u{1F4A8}\\
\\
\u26A0\uFE0F *Aten\xE7\xE3o:* Para a seguran\xE7a da sua entrega, informe o c\xF3digo *${p?.codigo_entrega || "4 d\xEDgitos"}* ao motoboy quando ele chegar.`;
              enviarMensagemWhatsApp("55" + num, msgCliente).catch((e) => console.error(e));
            }
          }
        }
        let detalheMsg = "\u{1F4DD} *DETALHES DA ROTA:*\n\n";
        let index = 0;
        for (const pId of pacote.pedidosIds || []) {
          const p = pedidos.find((ped) => ped.id === pId);
          if (p) {
            const wazeLink = `https://waze.com/ul?q=${encodeURIComponent(p.endereco)}`;
            const mapsLink = `https://maps.google.com/?q=${encodeURIComponent(p.endereco)}`;
            detalheMsg += `*Cliente ${++index}: ${p.cliente_nome || p.nomeCliente || "Cliente"}*\\
`;
            detalheMsg += `\u{1F4CD} ${p.endereco}\\
`;
            if (p.numero) detalheMsg += `  \u2022 N\xFAmero: ${p.numero}\\
`;
            if (p.apartamento) detalheMsg += `  \u2022 Apartamento: ${p.apartamento}\\
`;
            if (p.complemento) detalheMsg += `  \u2022 Complemento: ${p.complemento}\\
`;
            if (p.observacoes) detalheMsg += `  \u{1F4AC} Obs: ${p.observacoes}\\
`;
            detalheMsg += `[\u{1F5FA}\uFE0F Waze](${wazeLink}) | [\u{1F4CD} Maps](${mapsLink})\\
\\
`;
          }
        }
        detalheMsg += `\u{1F4A1} Ao chegar, pe\xE7a o *c\xF3digo de 4 d\xEDgitos* ao cliente e digite aqui para dar baixa.`;
        await ctx.reply(detalheMsg, { parse_mode: "Markdown", disable_web_page_preview: true, ...defaultKeyboard });
      }
    });
    bot.action(/^recusar_(.+)$/, async (ctx) => {
      if (!await checarCadastro(ctx.chat.id.toString(), ctx)) {
        await ctx.answerCbQuery();
        return;
      }
      const pacoteId = ctx.match[1];
      const pacotesRaw = await getPacotes();
      const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
      const pacote = pacotes.find((p) => p.id === pacoteId);
      if (pacote) {
        pacote.motoboy = null;
        pacote.status = "AGUARDANDO";
        await savePacote(pacote);
      }
      const motoboyRecusou = await getMotoboyByTelegramId(ctx.from.id.toString());
      const nomeMotoboyRecusa = motoboyRecusou?.nome?.split(" ")[0] || "Um parceiro";
      broadcastLog("RECUSA_ROTA", `O motoboy ${nomeMotoboyRecusa} RECUSOU o Pacote #${pacoteId.split("_")[1].substring(6)}.`, { pacoteId });
      await ctx.editMessageText("\u274C *ROTA RECUSADA*. Foi devolvida para a base.", { parse_mode: "Markdown" });
      await ctx.answerCbQuery("Rota Recusada");
    });
    bot.action("recusar_nuvem", async (ctx) => {
      await ctx.editMessageText("\u2601\uFE0F Convite da rede nuvem recusado.");
      await ctx.answerCbQuery();
    });
    bot.action("cancelar_chat", async (ctx) => {
      const eraSOS = userSessions[ctx.chat.id]?.step === "SOS_CHAT";
      delete userSessions[ctx.chat.id];
      if (eraSOS) {
        broadcastLog("SOS_ENCERRADO", "", { telegram_id: ctx.chat.id.toString() });
      }
      await ctx.editMessageText("\u2705 Conversa encerrada.");
      await ctx.reply("Voc\xEA voltou ao menu principal.", defaultKeyboard);
      await ctx.answerCbQuery();
    });
    bot.hears(/^\d{4}$/, async (ctx) => {
      if (!await checarCadastro(ctx.chat.id.toString(), ctx)) return;
      const chatId = ctx.chat.id.toString();
      const codigo = ctx.message.text;
      const sucesso = await processarBaixaPeloTelegram(chatId, codigo);
      if (sucesso) {
        if (userSessions[ctx.chat.id]?.step === "CHAT_CLIENTE") delete userSessions[ctx.chat.id];
        await ctx.reply(`\u2705 C\xF3digo aceito! A entrega foi confirmada e o valor lan\xE7ado no seu extrato.`);
      } else {
        await ctx.reply(`\u274C C\xF3digo inv\xE1lido ou essa entrega j\xE1 est\xE1 finalizada.`);
      }
    });
    bot.on("location", async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        if (!await checarCadastro(chatId.toString(), ctx)) return;
        const { latitude, longitude } = ctx.message.location;
        const motoboy = await getMotoboyByTelegramId(chatId.toString());
        const session = userSessions[chatId];
        const midInterview = session != null && session.step !== "AGUARDANDO_GPS_NUVEM";
        if (!motoboy || motoboy.status === "CADASTRANDO" && midInterview) {
          await ctx.reply("\u26A0\uFE0F Voc\xEA precisa concluir o cadastro (/start) antes de compartilhar a localiza\xE7\xE3o.");
          return;
        }
        if (motoboy && motoboy.vinculo === "Nuvem" && session?.step === "AGUARDANDO_GPS_NUVEM" && ctx.message.location.live_period) {
          await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: "EM_ENTREGA" });
          broadcastLog("NUVEM", `Motoboy Nuvem [${motoboy.nome}] est\xE1 ONLINE e pronto para a rota.`);
          await ctx.reply("\u2705 Localiza\xE7\xE3o recebida! Sua rota est\xE1 sendo preparada...");
          const pacoteId = session.data.pacote_id_nuvem;
          if (pacoteId) {
            const pacotesRaw = await getPacotes();
            const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
            const pacote = pacotes.find((p) => p.id === pacoteId);
            const pedidosRaw = await getPedidos();
            const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
            if (pacote) {
              pacote.motoboy = { telegram_id: chatId.toString(), nome: motoboy.nome };
              pacote.status = "EM_ROTA";
              if (pacote.deslocamento_pago === void 0) pacote.deslocamento_pago = false;
              await savePacote(pacote);
              for (const pId of pacote.pedidosIds || []) {
                const p = pedidos.find((ped) => ped.id === pId);
                const telefoneCliente = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
                if (p && telefoneCliente) {
                  const num = telefoneCliente.replace(/\D/g, "");
                  if (num.length >= 10) {
                    const nomeSplit = p.nomeCliente ? p.nomeCliente.split(" ")[0] : "cliente";
                    const msgCliente = `Ol\xE1, ${nomeSplit}! O seu pedido acabou de sair para entrega com o parceiro *${pacote.motoboy.nome}*. \u{1F6F5}\u{1F4A8}\\
\\
\u26A0\uFE0F *Aten\xE7\xE3o:* Para a seguran\xE7a da sua entrega, informe o c\xF3digo *${p?.codigo_entrega || "4 d\xEDgitos"}* ao motoboy quando ele chegar.`;
                    enviarMensagemWhatsApp("55" + num, msgCliente).catch((e) => console.error(e));
                  }
                }
              }
              let detalheMsg = "\u{1F4DD} *DETALHES DA ROTA:*\n\n";
              let index = 0;
              for (const pId of pacote.pedidosIds || []) {
                const p = pedidos.find((ped) => ped.id === pId);
                if (p) {
                  const wazeLink = `https://waze.com/ul?q=${encodeURIComponent(p.endereco)}`;
                  const mapsLink = `https://maps.google.com/?q=${encodeURIComponent(p.endereco)}`;
                  detalheMsg += `*Cliente ${++index}: ${p.cliente_nome || p.nomeCliente || "Cliente"}*\\
`;
                  detalheMsg += `\u{1F4CD} ${p.endereco}\\
`;
                  if (p.numero) detalheMsg += `  \u2022 N\xFAmero: ${p.numero}\\
`;
                  if (p.apartamento) detalheMsg += `  \u2022 Apartamento: ${p.apartamento}\\
`;
                  if (p.complemento) detalheMsg += `  \u2022 Complemento: ${p.complemento}\\
`;
                  if (p.observacoes) detalheMsg += `  \u{1F4AC} Obs: ${p.observacoes}\\
`;
                  detalheMsg += `[\u{1F5FA}\uFE0F Waze](${wazeLink}) | [\u{1F4CD} Maps](${mapsLink})\\
\\
`;
                }
              }
              detalheMsg += `\u{1F4A1} Ao chegar, pe\xE7a o *c\xF3digo de 4 d\xEDgitos* ao cliente e digite aqui para dar baixa.`;
              detalheMsg += `\\
\\
\u{1F4B0} *Taxa de Deslocamento Acordada:* R$ ${(pacote.taxa_deslocamento || 0).toFixed(2)} (Adicionada ao extrato na primeira entrega)`;
              await ctx.reply(detalheMsg, { parse_mode: "Markdown", disable_web_page_preview: true, ...defaultKeyboard });
              delete userSessions[chatId];
            } else {
              await ctx.reply("\u26A0\uFE0F N\xE3o foi poss\xEDvel encontrar os detalhes da sua rota. Entre em contato com a loja.");
            }
          }
          return;
        }
        if (ctx.message.location.live_period) {
          await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: "ONLINE" });
          broadcastLog("FROTA", `Motoboy [${motoboy?.nome?.split(" ")[0] || "Parceiro"}] bateu o ponto e est\xE1 ONLINE \u{1F7E2}`);
          await ctx.reply("\u{1F7E2} Ponto registrado! Voc\xEA est\xE1 ONLINE no radar da loja.\n\nFique atento \xE0s novas rotas. (Para sair, pare de compartilhar a localiza\xE7\xE3o ou digite /offline)", defaultKeyboard);
        } else {
          await ctx.reply("\u26A0\uFE0F Aten\xE7\xE3o: voc\xEA enviou uma localiza\xE7\xE3o fixa. Voc\xEA precisa compartilhar a **Localiza\xE7\xE3o em Tempo Real**.");
        }
      } catch (e) {
      }
    });
    bot.on("edited_message", async (ctx) => {
      try {
        if ("location" in ctx.editedMessage) {
          const chatId = ctx.editedMessage.chat.id;
          const motoboy = await getMotoboyByTelegramId(chatId.toString());
          if (!motoboy) return;
          const { latitude, longitude } = ctx.editedMessage.location;
          await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: "ONLINE" });
        }
      } catch (e) {
      }
    });
    bot.command("offline", async (ctx) => {
      const chatId = ctx.chat.id;
      await upsertFleet({ telegram_id: chatId.toString(), status: "OFFLINE" });
      const motoboyOffline = await getMotoboyByTelegramId(chatId.toString());
      broadcastLog("FROTA", `Motoboy [${motoboyOffline?.nome?.split(" ")[0] || "Parceiro"}] encerrou o expediente via comando \u{1F534}`);
      await ctx.reply("\u{1F534} Expediente encerrado.", import_telegraf.Markup.removeKeyboard());
    });
    bot.command("cancelar", async (ctx) => {
      delete userSessions[ctx.chat.id];
      await ctx.reply("\u2705 Conversa encerrada. Voc\xEA voltou ao menu principal.", defaultKeyboard);
    });
    bot.command("reset", async (ctx) => {
      const chatId = ctx.chat.id;
      delete userSessions[chatId];
      await ctx.reply("\u{1F504} Seu estado foi resetado. Digite /start para iniciar o cadastro novamente.", import_telegraf.Markup.removeKeyboard());
    });
    bot.command("limpar", async (ctx) => {
      const chatId = ctx.chat.id;
      delete userSessions[chatId];
      await ctx.reply("\u{1F504} Seu estado foi resetado. Digite /start para iniciar o cadastro novamente.", import_telegraf.Markup.removeKeyboard());
    });
    bot.command("sair", async (ctx) => {
      const chatId = ctx.chat.id;
      const motoboy = await getMotoboyByTelegramId(chatId.toString());
      if (!motoboy) {
        await ctx.reply("\u26A0\uFE0F Voc\xEA n\xE3o est\xE1 cadastrado nesta loja.");
        return;
      }
      if ((motoboy.pagamento_pendente ?? 0) > 0) {
        await ctx.reply("\u274C Voc\xEA possui acertos pendentes com esta loja. Aguarde o pagamento antes de se desvincular.");
        return;
      }
      await deletarMotoboy(chatId.toString());
      delete userSessions[chatId];
      await ctx.reply("\u2705 Voc\xEA foi desvinculado desta loja com sucesso. Voc\xEA est\xE1 livre para operar como Global ou em outra loja.", import_telegraf.Markup.removeKeyboard());
    });
    bot.command("desvincular", async (ctx) => {
      const chatId = ctx.chat.id;
      const motoboy = await getMotoboyByTelegramId(chatId.toString());
      if (!motoboy) {
        await ctx.reply("\u26A0\uFE0F Voc\xEA n\xE3o est\xE1 cadastrado nesta loja.");
        return;
      }
      if ((motoboy.pagamento_pendente ?? 0) > 0) {
        await ctx.reply("\u274C Voc\xEA possui acertos pendentes com esta loja. Aguarde o pagamento antes de se desvincular.");
        return;
      }
      await deletarMotoboy(chatId.toString());
      delete userSessions[chatId];
      await ctx.reply("\u2705 Voc\xEA foi desvinculado desta loja com sucesso. Voc\xEA est\xE1 livre para operar como Global ou em outra loja.", import_telegraf.Markup.removeKeyboard());
    });
    bot.on("text", async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const session = userSessions[chatId];
        const text = ctx.message.text;
        if (text.startsWith("/")) return;
        if (session?.step === "SOS_CHAT") {
          if (!await checarCadastro(chatId.toString(), ctx)) return;
          broadcastLog("SOS_MSG", text, { telegram_id: chatId.toString() });
          return;
        }
        if (session?.step === "CHAT_CLIENTE") {
          const num = session.data.telefone_cliente?.replace(/\D/g, "");
          const motoboyChat = await getMotoboyByTelegramId(chatId.toString());
          const nomeMotoboySender = motoboyChat?.nome?.split(" ")[0] || "Parceiro";
          if (num) {
            try {
              const sentMessage = await ctx.reply("Processando e reescrevendo para o cliente...");
              const textoProfissional = await traduzirMotoboyParaCliente(text);
              if (textoProfissional.trim().toUpperCase().includes("IGNORAR")) {
                await ctx.telegram.editMessageText(ctx.chat.id, sentMessage.message_id, void 0, "Sinal recebido (IA optou por n\xE3o incomodar o cliente).");
                return;
              }
              const jidCliente = await enviarMensagemWhatsApp("55" + num, textoProfissional, ctx.chat.id.toString(), text, nomeMotoboySender);
              if (jidCliente) {
                await ctx.telegram.editMessageText(ctx.chat.id, sentMessage.message_id, void 0, "\u2705 Mensagem enviada ao cliente!");
              } else {
                await ctx.telegram.editMessageText(ctx.chat.id, sentMessage.message_id, void 0, "\u274C Falha ao enviar. Verifique a conex\xE3o do WhatsApp.");
              }
            } catch (e) {
              console.error("[DEBUG WHATSAPP] Erro CR\xCDTICO na API ou IA:", e);
              await ctx.reply("\u274C Falha ao enviar a mensagem. Verifique a conex\xE3o.");
            }
          } else {
            await ctx.reply("\u274C Erro: Cliente sem n\xFAmero de telefone para esta rota.");
          }
          return;
        }
        if (!session) {
          const motoboyEmCadastro = await getMotoboyByTelegramId(chatId.toString());
          if (motoboyEmCadastro && motoboyEmCadastro.status === "CADASTRANDO") {
            let restoredStep = "NOME";
            if (!motoboyEmCadastro.nome) restoredStep = "NOME";
            else if (!motoboyEmCadastro.whatsapp && !motoboyEmCadastro.cpf) restoredStep = "WHATSAPP";
            else if (!motoboyEmCadastro.vinculo) restoredStep = "VINCULO";
            else if (!motoboyEmCadastro.pix) restoredStep = "PIX";
            else restoredStep = "VEICULO";
            userSessions[chatId] = {
              step: restoredStep,
              data: {
                nome: motoboyEmCadastro.nome || void 0,
                whatsapp: motoboyEmCadastro.whatsapp || motoboyEmCadastro.cpf || void 0,
                vinculo: motoboyEmCadastro.vinculo || void 0,
                pix: motoboyEmCadastro.pix || void 0
              }
            };
            if (restoredStep === "VINCULO" && text !== "Fixo" && text !== "Freelancer") {
              await ctx.reply('Qual o seu **V\xEDnculo** com a loja? (Como "Freelancer", voc\xEA tamb\xE9m poder\xE1 receber chamados de outras lojas da rede no futuro).', import_telegraf.Markup.keyboard([["Fixo", "Freelancer"]]).oneTime().resize());
              return;
            }
          } else {
            return;
          }
        }
        const activeSession = userSessions[chatId];
        if (!activeSession) return;
        switch (activeSession.step) {
          case "NOME":
            try {
              await updateProgress(chatId, "nome", text, "WHATSAPP");
              await ctx.reply("Perfeito! Agora, qual \xE9 o seu **WhatsApp**? (somente n\xFAmeros com DDD)");
            } catch (e) {
              await ctx.reply("\u274C Falha ao salvar no banco. Tente digitar novamente.");
            }
            break;
          case "WHATSAPP": {
            const numeroWpp = text.replace(/\D/g, "");
            if (numeroWpp.length < 10) {
              await ctx.reply("\u274C N\xFAmero inv\xE1lido. Digite apenas os n\xFAmeros com DDD (ex: 31999998888):");
              break;
            }
            try {
              await updateProgress(chatId, "whatsapp", numeroWpp, "VINCULO");
              await ctx.reply('Qual o seu **V\xEDnculo** com a loja? (Como "Freelancer", voc\xEA tamb\xE9m poder\xE1 receber chamados de outras lojas da rede no futuro).', import_telegraf.Markup.keyboard([["Fixo", "Freelancer"]]).oneTime().resize());
            } catch (e) {
              await ctx.reply("\u274C Falha ao salvar no banco. Tente digitar novamente.");
            }
            break;
          }
          case "VINCULO":
            if (text !== "Fixo" && text !== "Freelancer") {
              return ctx.reply('Por favor, selecione "Fixo" ou "Freelancer".', import_telegraf.Markup.keyboard([["Fixo", "Freelancer"]]).oneTime().resize());
            }
            try {
              await updateProgress(chatId, "vinculo", text, "PIX");
              await ctx.reply("Qual a sua **Chave PIX** para recebimentos?", import_telegraf.Markup.removeKeyboard());
            } catch (e) {
              await ctx.reply("\u274C Falha ao salvar no banco. Tente digitar novamente.");
            }
            break;
          case "PIX":
            try {
              await updateProgress(chatId, "pix", text, "VEICULO");
              await ctx.reply("Qual \xE9 o seu **Ve\xEDculo**? (Ex: Scooter, Carro)");
            } catch (e) {
              await ctx.reply("\u274C Falha ao salvar no banco. Tente digitar novamente.");
            }
            break;
          case "VEICULO": {
            const nomeParaBanco = activeSession.data.nome || ctx.from?.first_name || "Parceiro";
            const dadosCadastro = {
              telegram_id: chatId.toString(),
              veiculo: text,
              nome: nomeParaBanco,
              cpf: activeSession.data.whatsapp || null,
              vinculo: activeSession.data.vinculo || null,
              pix: activeSession.data.pix || null,
              status: "CADASTRANDO"
            };
            try {
              await upsertFleet(dadosCadastro);
            } catch (e) {
              console.error("[ERRO BANCO - VEICULO]:", e);
              await ctx.reply("\u274C Erro tempor\xE1rio no banco da loja. Digite o ve\xEDculo novamente para tentar de novo.");
              return;
            }
            broadcastLog("FROTA", `Novo cadastro finalizado: ${nomeParaBanco} (${text})`);
            const isFreelancer = activeSession.data.vinculo === "Freelancer";
            const msgFinal = isFreelancer ? "\u2705 Cadastro conclu\xEDdo e sincronizado com a rede!\n\nCompartilhe sua **Localiza\xE7\xE3o em Tempo Real** aqui neste chat para entrar no radar e come\xE7ar a receber rotas." : "\u2705 Cadastro conclu\xEDdo com sucesso!\n\nCompartilhe sua **Localiza\xE7\xE3o em Tempo Real** aqui no chat para entrar no radar da loja e come\xE7ar a receber rotas.";
            const payloadNuvem = isFreelancer ? {
              telegram_id: chatId.toString(),
              nome: nomeParaBanco,
              whatsapp: activeSession.data.whatsapp || null,
              pix: activeSession.data.pix || null,
              veiculo: text
            } : null;
            delete userSessions[chatId];
            await ctx.reply(msgFinal, defaultKeyboard);
            if (isFreelancer && payloadNuvem) {
              fetch("https://frota.ceia.ia.br/wp-json/frota/v1/cadastrar_freelancer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payloadNuvem),
                signal: AbortSignal.timeout(8e3)
              }).then(async (res) => {
                if (!res.ok) {
                  const erroTxt = await res.text();
                  console.error(`[API NUVEM ERRO] HTTP ${res.status}:`, erroTxt);
                }
              }).catch((_e) => {
                console.error("[CATCH NUVEM ERRO]: Falha de rede ao tentar sincronizar com a Nuvem:", _e);
              });
            }
            break;
          }
        }
      } catch (e) {
        console.error("[ERRO FATAL NO TELEGRAM BOT ON TEXT]:", e);
      }
    });
    botLaunchPromise = bot.launch().catch((err) => {
      broadcastLog("ERROR", `Falha ao iniciar o bot Telegram: ${err?.message || err}`);
      bot = null;
    });
    broadcastLog("TELEGRAM", "Conectado aos servidores. R\xE1dio da frota operante!");
    process.once("SIGINT", () => bot?.stop("SIGINT"));
    process.once("SIGTERM", () => bot?.stop("SIGTERM"));
  } catch (error) {
    broadcastLog("ERROR", "Falha ao iniciar o r\xE1dio da frota.");
  }
}

// whatsapp/baileys.ts
var ultimoNuvemPorCliente = /* @__PURE__ */ new Map();
var BaileysProvider = class {
  sock = null;
  status = "DISCONNECTED";
  state = null;
  destroyed = false;
  contextCache = /* @__PURE__ */ new Map();
  lidToPhone = /* @__PURE__ */ new Map();
  customerSessionCache = /* @__PURE__ */ new Map();
  isConnected() {
    return this.status === "CONNECTED";
  }
  async disconnect() {
    this.destroyed = true;
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(void 0);
      } catch (_) {
      }
      this.sock = null;
    }
    this.status = "DISCONNECTED";
    this.state?.setStatus("DISCONNECTED");
    this.state?.setQr(null);
  }
  async connect(state) {
    if (this.destroyed) return;
    this.state = state;
    this.status = "CONNECTING";
    state.setStatus("CONNECTING");
    state.setQr(null);
    broadcastLog("WHATSAPP", "Iniciando conex\xE3o nativa com Baileys...");
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(void 0);
      } catch (_) {
      }
      this.sock = null;
    }
    const { state: authState, saveCreds } = await (0, import_baileys.useMultiFileAuthState)("auth_info_baileys");
    const { version } = await (0, import_baileys.fetchLatestBaileysVersion)();
    this.sock = (0, import_baileys.makeWASocket)({
      auth: authState,
      version,
      logger: (0, import_pino.default)({ level: "silent" }),
      browser: import_baileys.Browsers.macOS("Desktop"),
      syncFullHistory: false,
      getMessage: async () => void 0
    });
    this.sock.ev.on("creds.update", saveCreds);
    const mapearContato = (contact) => {
      if (contact.lid && contact.id && contact.id.endsWith("@s.whatsapp.net")) {
        const lid = contact.lid.split("@")[0];
        const phone = contact.id.split("@")[0].replace(/\D/g, "");
        if (lid && phone) this.lidToPhone.set(lid, phone);
      }
    };
    this.sock.ev.on("contacts.upsert", (contacts) => contacts.forEach(mapearContato));
    this.sock.ev.on("contacts.update", (updates) => updates.forEach(mapearContato));
    this.sock.ev.on("connection.update", async (update) => {
      if (this.destroyed) return;
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        try {
          const qrBase64 = await import_qrcode.default.toDataURL(qr);
          state.setQr(qrBase64);
          broadcastLog("WHATSAPP", "Novo QR Code gerado. Aguardando leitura na tela...");
        } catch (e) {
          console.error("Erro ao gerar imagem do QR Code:", e);
        }
      }
      if (connection === "close") {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== import_baileys.DisconnectReason.loggedOut;
        broadcastLog("WHATSAPP", `Conex\xE3o fechada. Motivo: ${lastDisconnect?.error?.message}. Reconectando: ${shouldReconnect}`);
        if (shouldReconnect && !this.destroyed) {
          setTimeout(() => {
            if (!this.destroyed) this.connect(state);
          }, 3e3);
        } else if (!shouldReconnect) {
          this.status = "DISCONNECTED";
          state.setStatus("DISCONNECTED");
          state.setQr(null);
          import_fs.default.rmSync("auth_info_baileys", { recursive: true, force: true });
          broadcastLog("WHATSAPP", "Sess\xE3o encerrada. Ser\xE1 necess\xE1rio ler o QR Code novamente.");
        }
      } else if (connection === "open") {
        this.status = "CONNECTED";
        state.setStatus("CONNECTED");
        state.setQr(null);
        broadcastLog("WHATSAPP", "WhatsApp conectado e operante! \u{1F7E2}");
      }
    });
    this.sock.ev.on("messages.upsert", async (m) => {
      if (m.type !== "notify") return;
      const msg = m.messages[0];
      const numeroCliente = msg.key.remoteJid;
      if (!msg.message || msg.key.fromMe || !numeroCliente || numeroCliente.endsWith("@g.us") || numeroCliente.endsWith("@broadcast") || numeroCliente.endsWith("@newsletter")) return;
      const configKS = await getConfiguracoes();
      if (configKS.whatsapp_ativo === false || configKS.whatsapp_ativo === 0) return;
      const numeroNormalizado = this.normalizePhone(numeroCliente);
      await this.sock.readMessages([msg.key]);
      const isAudio = !!(msg.message.audioMessage || msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage);
      const location = msg.message.locationMessage;
      let mensagemTexto = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
      if (isAudio && !mensagemTexto) {
        try {
          const config2 = await getConfiguracoes();
          if (!config2.openai_key) throw new Error("OpenAI Key n\xE3o configurada para transcri\xE7\xE3o.");
          const buffer = await (0, import_baileys.downloadMediaMessage)(msg, "buffer", {}, { logger: void 0 });
          const file = await (0, import_openai.toFile)(buffer, "audio.ogg", { type: "audio/ogg" });
          const openai = new import_openai.default({ apiKey: config2.openai_key });
          const transcription = await openai.audio.transcriptions.create({ file, model: "whisper-1" });
          mensagemTexto = transcription.text || "";
        } catch (err) {
          console.error("Erro na transcri\xE7\xE3o:", err);
        }
      }
      if (!mensagemTexto && !location) return;
      const jidAlt = msg.key.remoteJidAlt;
      const participant = msg.participant;
      const candidatoJid = jidAlt && !jidAlt.includes("@lid") ? jidAlt : participant && !participant.includes("@lid") ? participant : null;
      const jidParaBusca = candidatoJid ?? numeroCliente;
      const numeroExibicao = jidParaBusca.split("@")[0];
      broadcastLog("WHATSAPP", `Recebido de [${numeroExibicao}]: ${mensagemTexto || "Localiza\xE7\xE3o"}`);
      if (mensagemTexto) {
        const notaStr = mensagemTexto.trim();
        const nota = parseInt(notaStr, 10);
        if (!isNaN(nota) && nota >= 1 && nota <= 10 && notaStr === String(nota)) {
          const motoboyNuvemId = ultimoNuvemPorCliente.get(jidParaBusca);
          if (motoboyNuvemId) {
            const motoboyAvaliado = await getMotoboyByTelegramId(motoboyNuvemId);
            if (motoboyAvaliado?.vinculo === "Nuvem") {
              try {
                await atualizarCamposMotoboy(motoboyNuvemId, { ultima_nota: nota });
              } catch (_e) {
              }
              if (process.env.HUB_URL) {
                fetch(`${process.env.HUB_URL}/reputacao`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ telegram_id: motoboyNuvemId, nota }),
                  signal: AbortSignal.timeout(5e3)
                }).catch((e) => console.error("[HUB REPUTACAO] Falha:", e));
              }
              await this.sendMessage(numeroCliente, "\u2B50 Obrigado pela sua avalia\xE7\xE3o!", "SISTEMA", "avaliacao", "BOT");
              return;
            }
          }
        }
      }
      const rota = await getRotaPeloCliente(numeroNormalizado);
      if (rota && rota.telegram_id) {
        const motoboyRota = await getMotoboyByTelegramId(rota.telegram_id);
        if (motoboyRota?.vinculo === "Nuvem") {
          ultimoNuvemPorCliente.set(jidParaBusca, rota.telegram_id);
        }
        if (location) {
          const mapsLink = `https://www.google.com/maps?q=${location.degreesLatitude},${location.degreesLongitude}`;
          await enviarMensagemTelegram(rota.telegram_id, `\u{1F4CD} Localiza\xE7\xE3o enviada pelo cliente: ${mapsLink}`);
          return;
        }
        const prefixo = isAudio ? "\u{1F399}\uFE0F \xC1udio do Cliente:\n" : "\u{1F5E3}\uFE0F Cliente: ";
        await enviarMensagemTelegram(rota.telegram_id, prefixo + mensagemTexto);
        broadcastLog("TELEGRAM", `Mensagem do cliente ${numeroNormalizado} enviada diretamente ao motoboy.`);
        return;
      }
      const jidNormalized = (0, import_baileys.jidNormalizedUser)(msg.key.remoteJid);
      if (this.contextCache.has(jidNormalized)) {
        const contextoEncontrado = this.contextCache.get(jidNormalized);
        const prefixo = isAudio ? "\u{1F399}\uFE0F \xC1udio do Cliente:\n" : "\u{1F5E3}\uFE0F Cliente: ";
        await enviarMensagemTelegram(contextoEncontrado.telegramId, prefixo + mensagemTexto);
        broadcastLog("TELEGRAM", `Resposta de ${numeroNormalizado} roteada via cache para ${contextoEncontrado.motoboyName}.`);
        return;
      }
      const session = this.manageCustomerSession(jidNormalized);
      if (session.mode === "HUMAN") {
        broadcastLog("SAC_MSG", mensagemTexto, { jid: jidNormalized, nome: msg.pushName || numeroNormalizado });
        return;
      }
      const config = await getConfiguracoes();
      const nomeCliente = msg.pushName?.split(" ")[0]?.trim() || null;
      try {
        const respostaIA = await this.processarMensagemIA(mensagemTexto, config, nomeCliente);
        if (respostaIA.includes("[ACTION_HUMAN]")) {
          session.mode = "HUMAN";
          broadcastLog("SAC_REQUEST", `Cliente [${msg.pushName || numeroNormalizado}] pediu para falar com um atendente.`, { jid: jidNormalized, nome: msg.pushName || numeroNormalizado });
          await this.sendMessage(numeroCliente, "Um de nossos atendentes j\xE1 vai falar com voc\xEA. Aguarde um instante.", "SISTEMA", "transfere_humano", "BOT");
          return;
        }
        const contextoPedido = await this.buscarContextoPedidoCliente(jidParaBusca, config, mensagemTexto);
        if (contextoPedido) broadcastLog("WHATSAPP", `[RASTREIO] Pedido identificado para ${numeroExibicao}: ${contextoPedido.texto}`);
        if (contextoPedido?.respostaDireta) {
          await this.sendMessage(numeroCliente, contextoPedido.respostaDireta, "SISTEMA", "SISTEMA_RASTREIO", "BOT");
          return;
        }
        if (!contextoPedido) {
          const msgLower = mensagemTexto.toLowerCase();
          const intentRastreio = /pedido|entrega|entregador|motoboy|rastreio|onde.*pedido|demora.*entrega|chegou|chegando|status/.test(msgLower);
          if (intentRastreio) {
            await this.sendMessage(numeroCliente, "N\xE3o encontrei pedidos ativos associados ao seu n\xFAmero. Se precisar de ajuda, fale com um de nossos atendentes.", "SISTEMA", "sem_pedido", "BOT");
            return;
          }
        }
        await this.sendMessage(numeroCliente, respostaIA, "SISTEMA", "SISTEMA_AUTO_ATENDIMENTO", "BOT");
      } catch (error) {
        console.error("[ERRO FATAL] Falha na execu\xE7\xE3o do Auto-Atendimento:", error);
      }
    });
  }
  async sendMessage(numero, texto, telegramId = "SISTEMA", motoboyMessage = "envio_sistema", motoboyName = "CEIA", retryCount = 0) {
    try {
      if (this.status === "CONNECTING" && retryCount < 5) {
        console.log(`[WHATSAPP] Aguardando inicializa\xE7\xE3o... (${retryCount + 1}/5)`);
        await new Promise((resolve) => setTimeout(resolve, 2e3));
        return this.sendMessage(numero, texto, telegramId, motoboyMessage, motoboyName, retryCount + 1);
      }
      if (this.status !== "CONNECTED" || !this.sock) {
        console.error("[WHATSAPP] Tentativa de envio falhou: Sess\xE3o desconectada.");
        return null;
      }
      let idEnvio = numero;
      if (!numero.includes("@")) {
        let numeroLimpo = this.normalizePhone(numero);
        if (numeroLimpo.startsWith("5555")) {
          numeroLimpo = numeroLimpo.substring(2);
        } else if (numeroLimpo.length === 10 || numeroLimpo.length === 11) {
          numeroLimpo = "55" + numeroLimpo;
        }
        idEnvio = numeroLimpo + "@s.whatsapp.net";
        try {
          const query = await this.sock.onWhatsApp(numeroLimpo);
          if (query && query.length > 0 && query[0].exists) idEnvio = query[0].jid;
        } catch (_) {
        }
      }
      await this.sock.sendPresenceUpdate("composing", idEnvio);
      const delay = 1500 + Math.floor(Math.random() * 1500);
      await new Promise((resolve) => setTimeout(resolve, delay));
      await this.sock.sendPresenceUpdate("paused", idEnvio);
      const sentMsg = await this.sock.sendMessage(idEnvio, { text: texto });
      const realJid = (0, import_baileys.jidNormalizedUser)(idEnvio);
      if (telegramId !== "SISTEMA") {
        this.contextCache.set(realJid, { telegramId, motoboyName, lastMotoboyMessage: motoboyMessage, timestamp: Date.now() });
        setTimeout(() => {
          const cache = this.contextCache.get(realJid);
          if (cache && Date.now() - cache.timestamp >= 14 * 60 * 1e3) {
            this.contextCache.delete(realJid);
          }
        }, 15 * 60 * 1e3);
      }
      return realJid ?? null;
    } catch (error) {
      console.error("Erro ao disparar WhatsApp nativo:", error);
      return null;
    }
  }
  normalizePhone(input) {
    if (!input) return "";
    return input.includes("@") ? input.split("@")[0] : input.replace(/\D/g, "");
  }
  manageCustomerSession(jid) {
    if (this.customerSessionCache.has(jid)) {
      const session = this.customerSessionCache.get(jid);
      clearTimeout(session.timeout);
      session.timeout = setTimeout(() => this.customerSessionCache.delete(jid), 15 * 60 * 1e3);
      return session;
    }
    const newSession = {
      mode: "BOT",
      timeout: setTimeout(() => this.customerSessionCache.delete(jid), 15 * 60 * 1e3)
    };
    this.customerSessionCache.set(jid, newSession);
    return newSession;
  }
  parsearMinutos(textoTempo) {
    let total = 0;
    const h = textoTempo.match(/(\d+)\s*hora/);
    const m = textoTempo.match(/(\d+)\s*min/);
    if (h) total += parseInt(h[1]) * 60;
    if (m) total += parseInt(m[1]);
    return total || 999;
  }
  fraseETA(tempoEstimado) {
    const minutos = this.parsearMinutos(tempoEstimado);
    return minutos <= 15 ? `rapidinho, chega em ${tempoEstimado}` : `seu pedido vai chegar at\xE9 voc\xEA em ${tempoEstimado}`;
  }
  async processarMensagemIA(mensagemCliente, config, nomeCliente = null) {
    if (!config.openai_key) throw new Error("OpenAI Key n\xE3o configurada.");
    const horariosFormatados = config.horarios ? Object.entries(config.horarios).filter(([, val]) => val.on).map(([dia, val]) => `${dia.charAt(0).toUpperCase() + dia.slice(1)}: ${val.abre} \xE0s ${val.fecha}`).join(", ") : "N\xE3o informado.";
    const instrucaoNome = nomeCliente ? `Voc\xEA est\xE1 conversando com o cliente chamado ${nomeCliente}. Trate-o pelo primeiro nome de forma natural.` : "Voc\xEA n\xE3o conhece o nome do cliente. Seja cordial sem usar nomes pr\xF3prios.";
    const openai = new import_openai.default({ apiKey: config.openai_key });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Voc\xEA \xE9 o assistente virtual do estabelecimento ${config.nome || "nosso restaurante"}. ${instrucaoNome} Informa\xE7\xF5es do estabelecimento: Endere\xE7o: ${config.endereco || "N\xE3o informado"}. Hor\xE1rios: ${horariosFormatados}. Card\xE1pio: ${config.link_cardapio || "N\xE3o dispon\xEDvel online"}.

REGRAS: Se o cliente quiser fazer um pedido, oriente a usar o link do card\xE1pio. Se exigir falar com um humano/atendente, retorne ESTRITAMENTE a tag: [ACTION_HUMAN]. Se perguntar algo fora de contexto, diga educadamente que n\xE3o pode ajudar. NUNCA invente nomes, endere\xE7os ou hor\xE1rios que n\xE3o estejam nestas instru\xE7\xF5es.` },
        { role: "user", content: mensagemCliente }
      ],
      temperature: 0.5
    });
    return completion.choices[0].message?.content || "Desculpe, tive um problema ao processar sua resposta.";
  }
  async buscarContextoPedidoCliente(jidOriginal, config, mensagemCliente) {
    try {
      let jidNumber;
      if (jidOriginal.endsWith("@lid")) {
        const lidKey = jidOriginal.split("@")[0];
        const resolvedPhone = this.lidToPhone.get(lidKey);
        if (!resolvedPhone) return null;
        jidNumber = resolvedPhone.replace(/\D/g, "");
      } else {
        const jidLimpo = (0, import_baileys.jidNormalizedUser)(jidOriginal);
        jidNumber = jidLimpo.split("@")[0].replace(/\D/g, "");
      }
      if (!jidNumber) return null;
      const pedidosRaw = await getPedidos();
      if (!pedidosRaw?.length) return null;
      const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
      const ultimos6 = jidNumber.slice(-6);
      const pedidosDoCliente = pedidos.filter((p) => {
        const realNumber = (p.telefone || "").replace(/\D/g, "");
        return realNumber.length >= 6 && ultimos6 === realNumber.slice(-6);
      });
      if (!pedidosDoCliente.length) return null;
      const pedidoDoCliente = pedidosDoCliente.sort(
        (a, b) => String(b.id ?? "").localeCompare(String(a.id ?? ""))
      )[0];
      const pacotesRaw = await getPacotes();
      const pacotes = pacotesRaw?.length ? pacotesRaw.map((p) => JSON.parse(p.dados_json)) : [];
      const statusAtivos = ["AGUARDANDO", "PENDENTE_ACEITE", "EM_ROTA"];
      const pacote = pacotes.find(
        (pac) => pac.pedidosIds?.includes(pedidoDoCliente.id) && statusAtivos.includes(pac.status)
      );
      if (!pacote) return null;
      if (pacote.status === "AGUARDANDO") {
        return {
          texto: "Pedido em preparo.",
          nomeMotoboy: "",
          localizacao: "",
          fraseETA: "",
          status: "AGUARDANDO",
          respostaDireta: "Seu pedido est\xE1 sendo preparado na cozinha! \u{1F468}\u200D\u{1F373}"
        };
      }
      if (pacote.status === "PENDENTE_ACEITE") {
        return {
          texto: "Pedido pronto, aguardando entregador.",
          nomeMotoboy: "",
          localizacao: "",
          fraseETA: "",
          status: "PENDENTE_ACEITE",
          respostaDireta: "Seu pedido est\xE1 pronto e aguardando o entregador confirmar a rota! \u{1F6F5}"
        };
      }
      if (pacote.status === "EM_ROTA") {
        const telegramId = pacote.motoboy?.telegram_id;
        const frota = await getFleet();
        const motoboyDb = frota?.find((m) => m.telegram_id === telegramId);
        const primeiroNome = motoboyDb?.nome?.split(" ")[0] || pacote.motoboy?.nome?.split(" ")[0] || "o entregador";
        let localizacaoTexto = "";
        let fraseTempoEntrega = "";
        if (motoboyDb?.lat && motoboyDb?.lng && config.google_maps_key) {
          try {
            const { lat, lng } = motoboyDb;
            const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.google_maps_key}&language=pt-BR&result_type=route|street_address`);
            const geoData = await geoRes.json();
            if (geoData.status === "OK" && geoData.results?.length > 0) {
              const resultado = geoData.results[0];
              const rua = resultado.address_components?.find((c) => c.types.includes("route"))?.long_name;
              const bairro = resultado.address_components?.find(
                (c) => c.types.includes("sublocality_level_1") || c.types.includes("sublocality") || c.types.includes("neighborhood")
              )?.long_name;
              if (rua && bairro) localizacaoTexto = `na ${rua}, bairro ${bairro}`;
              else if (rua) localizacaoTexto = `na ${rua}`;
              else if (resultado.formatted_address) localizacaoTexto = resultado.formatted_address.split(",").slice(0, 2).join(",").trim();
            }
          } catch (e) {
          }
          if (pedidoDoCliente.endereco) {
            try {
              const origin = `${motoboyDb.lat},${motoboyDb.lng}`;
              const destination = encodeURIComponent(pedidoDoCliente.endereco);
              const dmRes = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&key=${config.google_maps_key}&language=pt-BR`);
              const dmData = await dmRes.json();
              if (dmData.status === "OK" && dmData.rows[0].elements[0].status === "OK") {
                fraseTempoEntrega = this.fraseETA(dmData.rows[0].elements[0].duration.text);
              }
            } catch (e) {
            }
          }
        }
        if (!localizacaoTexto && !fraseTempoEntrega) {
          return {
            texto: `EM ROTA \u2014 GPS offline`,
            nomeMotoboy: primeiroNome,
            localizacao: "",
            fraseETA: "",
            status: "EM_ROTA",
            respostaDireta: `Seu pedido j\xE1 saiu para entrega e chega em breve! \u{1F6F5}`
          };
        }
        const msg = mensagemCliente.toLowerCase();
        const querLocal = /onde|rua|bairro|regi[aã]o|endere[cç]o/.test(msg);
        const querTempo = /demora|tempo|quanto falta|minutos|logo|j[aá] chega|chegando/.test(msg);
        let respostaDireta;
        if (querLocal) {
          respostaDireta = localizacaoTexto ? `${primeiroNome} est\xE1 ${localizacaoTexto}.` : `${primeiroNome} est\xE1 a caminho.`;
        } else if (querTempo) {
          respostaDireta = fraseTempoEntrega ? `${fraseTempoEntrega.charAt(0).toUpperCase() + fraseTempoEntrega.slice(1)}.` : `${primeiroNome} est\xE1 a caminho e chega em breve.`;
        } else {
          respostaDireta = `Seu pedido est\xE1 em rota de entrega com ${primeiroNome}.`;
        }
        const locLog = localizacaoTexto ? `${primeiroNome} est\xE1 ${localizacaoTexto}` : `${primeiroNome} est\xE1 a caminho`;
        const etaLog = fraseTempoEntrega ? ` | ETA: ${fraseTempoEntrega}` : "";
        return {
          texto: `EM ROTA \u2014 ${locLog}${etaLog}`,
          nomeMotoboy: primeiroNome,
          localizacao: localizacaoTexto,
          fraseETA: fraseTempoEntrega,
          status: "EM_ROTA",
          respostaDireta
        };
      }
      return null;
    } catch (e) {
      console.error("[DEBUG CONTEXTO_PEDIDO] Erro ao buscar contexto do pedido:", e);
      return null;
    }
  }
};

// whatsapp/index.ts
var import_openai2 = __toESM(require("openai"), 1);
var qrCodeBase64 = null;
var sessionStatus = "DISCONNECTED";
var providerState = {
  setStatus(s) {
    sessionStatus = s;
  },
  setQr(qr) {
    qrCodeBase64 = qr;
  }
};
var provider = new BaileysProvider();
async function iniciarWhatsApp() {
  await provider.connect(providerState);
}
async function enviarMensagemWhatsApp(numero, texto, telegramId = "SISTEMA", motoboyMessage = "envio_sistema", motoboyName = "CEIA") {
  return provider.sendMessage(numero, texto, telegramId, motoboyMessage, motoboyName);
}
async function traduzirMotoboyParaCliente(mensagemMotoboy) {
  try {
    const config = await getConfiguracoes();
    if (!config.openai_key) throw new Error("OpenAI Key n\xE3o configurada.");
    const openai = new import_openai2.default({ apiKey: config.openai_key });
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Voc\xEA \xE9 o filtro de comunica\xE7\xE3o da CEIA. Analise a mensagem do entregador. REGRAS: 1. Se a mensagem for apenas uma sauda\xE7\xE3o (oi, ol\xE1, bom dia), uma confirma\xE7\xE3o vazia ou n\xE3o contiver uma d\xFAvida/problema real sobre a entrega, responda APENAS a palavra: IGNORAR. 2. Se a mensagem for uma d\xFAvida ou aviso real (ex: port\xE3o fechado, endere\xE7o errado, campainha estragada), traduza para um aviso profissional ao cliente sem usar sauda\xE7\xF5es ou assinaturas. 3. NUNCA invente que o entregador chegou se ele n\xE3o disser explicitamente." },
        { role: "user", content: mensagemMotoboy }
      ],
      temperature: 0.7
    });
    return completion.choices[0].message?.content || "Estamos processando uma atualiza\xE7\xE3o sobre sua entrega. Um momento, por favor.";
  } catch (error) {
    return "O sistema identificou uma breve lentid\xE3o na sua entrega. O parceiro j\xE1 est\xE1 ciente.";
  }
}

// server.ts
var dispatchTokens = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [t, d] of dispatchTokens) if (d.expiresAt < now) dispatchTokens.delete(t);
}, 5 * 60 * 1e3);
var HUB_URL = process.env.HUB_URL;
var LOJA_URL = process.env.LOJA_URL ?? "";
var app2 = (0, import_fastify.default)({ logger: false });
async function startServer() {
  await initDatabase();
  await app2.register(import_cors.default, { origin: "*", credentials: true });
  await app2.register(import_cookie.default);
  await app2.register(import_websocket.default);
  initLogger(app2);
  app2.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0];
    const publicEndpoints = ["/api/profile/public", "/api/frota-compartilhada/disponiveis", "/api/frota-compartilhada/repassar-convite"];
    if (!url.startsWith("/api/") || publicEndpoints.includes(url)) return;
    const token = request.cookies?.ceia_token;
    if (!token) {
      return reply.code(401).header("Content-Type", "application/json; charset=utf-8").send({ error: "N\xE3o autenticado" });
    }
    try {
      const secret = await getJwtSecret();
      import_jsonwebtoken.default.verify(token, secret);
    } catch {
      reply.clearCookie("ceia_token", { path: "/" });
      return reply.code(401).header("Content-Type", "application/json; charset=utf-8").send({ error: "Sess\xE3o expirada. Fa\xE7a login novamente." });
    }
  });
  app2.get("/auth/setup-needed", async (_request, reply) => {
    const count = await contarUsuarios();
    return reply.send({ needed: count === 0 });
  });
  app2.post("/auth/setup", async (request, reply) => {
    const count = await contarUsuarios();
    if (count > 0) return reply.code(403).send({ error: "Setup j\xE1 foi realizado." });
    const { whatsapp, senha, telegram_id } = request.body || {};
    if (!whatsapp || !senha) return reply.code(400).send({ error: "WhatsApp e senha s\xE3o obrigat\xF3rios." });
    if (senha.length < 6) return reply.code(400).send({ error: "A senha deve ter no m\xEDnimo 6 caracteres." });
    const hash = await import_bcryptjs.default.hash(senha, 12);
    await criarUsuario(whatsapp, hash, telegram_id || void 0);
    const secret = await getJwtSecret();
    const token = import_jsonwebtoken.default.sign({ whatsapp }, secret, { expiresIn: "8h" });
    reply.setCookie("ceia_token", token, { httpOnly: true, path: "/", maxAge: 8 * 3600, sameSite: "lax" });
    return reply.send({ ok: true });
  });
  app2.post("/auth/login", async (request, reply) => {
    const { whatsapp, senha } = request.body || {};
    if (!whatsapp || !senha) return reply.code(400).send({ error: "Preencha todos os campos." });
    const usuario = await getUsuarioPorWhatsapp(whatsapp);
    if (!usuario) return reply.code(401).send({ error: "Credenciais inv\xE1lidas." });
    const valido = await import_bcryptjs.default.compare(senha, usuario.senha_hash);
    if (!valido) return reply.code(401).send({ error: "Credenciais inv\xE1lidas." });
    const secret = await getJwtSecret();
    const token = import_jsonwebtoken.default.sign({ whatsapp }, secret, { expiresIn: "8h" });
    reply.setCookie("ceia_token", token, { httpOnly: true, path: "/", maxAge: 8 * 3600, sameSite: "lax" });
    return reply.send({ ok: true });
  });
  app2.get("/auth/check", async (request, reply) => {
    const token = request.cookies?.ceia_token;
    if (!token) return reply.code(401).send({ ok: false });
    try {
      const secret = await getJwtSecret();
      import_jsonwebtoken.default.verify(token, secret);
      return reply.send({ ok: true });
    } catch {
      reply.clearCookie("ceia_token", { path: "/" });
      return reply.code(401).send({ ok: false });
    }
  });
  app2.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie("ceia_token", { path: "/" });
    return reply.send({ ok: true });
  });
  app2.post("/api/auth/alterar-senha", async (request, reply) => {
    const { senha_atual, nova_senha } = request.body || {};
    if (!senha_atual || !nova_senha) return reply.code(400).send({ error: "Preencha todos os campos." });
    if (nova_senha.length < 6) return reply.code(400).send({ error: "A nova senha deve ter no m\xEDnimo 6 caracteres." });
    const secret = await getJwtSecret();
    const payload = import_jsonwebtoken.default.verify(request.cookies.ceia_token, secret);
    const usuario = await getUsuarioPorWhatsapp(payload.whatsapp);
    const valido = await import_bcryptjs.default.compare(senha_atual, usuario.senha_hash);
    if (!valido) return reply.code(401).send({ error: "Senha atual incorreta." });
    await atualizarSenhaUsuario(usuario.id, await import_bcryptjs.default.hash(nova_senha, 12));
    return reply.send({ ok: true });
  });
  app2.get("/", async (request, reply) => {
    const htmlPath = import_path2.default.join(__dirname, "index.html");
    const htmlContent = import_fs2.default.readFileSync(htmlPath, "utf-8");
    return reply.type("text/html").send(htmlContent);
  });
  app2.get("/api/profile/public", async (request, reply) => {
    const config = await getConfiguracoes();
    if (!config) return reply.code(200).type("application/json; charset=utf-8").send({});
    const { nome, documento, endereco, whatsapp, link_cardapio, horarios } = config;
    return reply.code(200).type("application/json; charset=utf-8").send({ nome, documento, endereco, whatsapp, link_cardapio, horarios });
  });
  app2.get("/api/profile/admin", async (request, reply) => {
    const config = await getConfiguracoes();
    return reply.code(200).type("application/json; charset=utf-8").send(config || {});
  });
  app2.post("/api/profile/admin", async (request, reply) => {
    const body = request.body;
    const PLACEHOLDER = "Configurado \u2713";
    const chaveFields = ["google_maps_key", "openai_key", "telegram_bot_token"];
    for (const field of chaveFields) {
      if (body[field] === PLACEHOLDER || body[field] === "") {
        body[field] = null;
      }
    }
    await updateConfiguracoes(body);
    await broadcastLog("SUCCESS", "Configura\xE7\xF5es atualizadas via Painel");
    iniciarTelegram();
    const config = await getConfiguracoes();
    if (body.endereco && config?.google_maps_key) {
      const enderecoEncoded = encodeURIComponent(body.endereco);
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${enderecoEncoded}&key=${config.google_maps_key}`;
      fetch(geocodeUrl, { signal: AbortSignal.timeout(8e3) }).then(async (res) => {
        const data = await res.json();
        console.log("[GEOCODING] status:", data.status, "| results:", data.results?.length ?? 0);
        if (data.status === "OK" && data.results?.[0]) {
          const { lat, lng } = data.results[0].geometry.location;
          console.log("[GEOCODING] lat:", lat, "| lng:", lng, "| endere\xE7o:", body.endereco);
          await updateConfiguracoes({ lat, lng });
        } else {
          console.warn("[GEOCODING] Sem resultado para o endere\xE7o:", body.endereco);
        }
      }).catch((e) => console.error("[GEOCODING] Erro no fetch:", e.message));
    }
    return reply.code(200).type("application/json; charset=utf-8").send({ status: "success" });
  });
  app2.get("/api/fleet", async (request, reply) => {
    const frota = await getFleet();
    return reply.code(200).type("application/json; charset=utf-8").send(frota);
  });
  app2.delete("/api/fleet/:id", async (request, reply) => {
    await deletarMotoboy(request.params.id);
    await broadcastLog("FROTA", "Perfil de motoboy e hist\xF3rico exclu\xEDdos.");
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.put("/api/fleet/:id", async (request, reply) => {
    const { veiculo, vinculo, nome, whatsapp, pix } = request.body;
    await atualizarMotoboy(request.params.id, veiculo, vinculo, nome, whatsapp, pix);
    await broadcastLog("FROTA", "Perfil de motoboy atualizado.");
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.get("/api/financeiro/:id", async (request, reply) => {
    const extrato = await getExtratoFinanceiro(request.params.id);
    return reply.code(200).type("application/json; charset=utf-8").send(extrato);
  });
  app2.post("/api/financeiro/pagar/:id", async (request, reply) => {
    const telegram_id = request.params.id;
    const extrato = await getExtratoFinanceiro(telegram_id);
    await zerarAcertoFinanceiro(telegram_id);
    const valorTotal = extrato?.total_geral ?? 0;
    if (valorTotal > 0) {
      await inserirHistoricoMotoboy(telegram_id, "ACERTO", valorTotal, `Acerto liquidado: ${extrato.qtd} corrida(s)`);
    }
    await broadcastLog("FINANCEIRO", "Acerto de motoboy liquidado com sucesso.");
    await atualizarCamposMotoboy(telegram_id, { status: "aguardando_confirmacao" });
    const motoboy = await getMotoboyByTelegramId(telegram_id);
    if (motoboy?.telegram_id) {
      await enviarConfirmacaoPagamento(motoboy.telegram_id, telegram_id, valorTotal);
    }
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true, aguardando_confirmacao: true });
  });
  app2.get("/api/historico/:telegram_id", async (request, reply) => {
    const historico = await getHistoricoMotoboy(request.params.telegram_id);
    return reply.code(200).type("application/json; charset=utf-8").send(historico);
  });
  app2.post("/api/nuvem/receber-convite", async (request, reply) => {
    const { telegram_id, loja_destino_nome, link_bot_destino, taxa_estimada } = request.body;
    const frota = await getFleet();
    const motoboy = frota.find((m) => m.telegram_id === telegram_id);
    if (!motoboy) {
      return reply.code(404).type("application/json; charset=utf-8").send({ error: "Motoboy n\xE3o encontrado na base local." });
    }
    await repassarConviteNuvem(telegram_id, { loja_destino_nome, link_bot_destino, taxa_estimada });
    await broadcastLog("NUVEM", `Convite da loja ${loja_destino_nome} repassado para ${motoboy.nome}.`);
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.post("/api/operacao/despachar", async (request, reply) => {
    const { pacoteId, motoboy, pedidos } = request.body;
    const config = await getConfiguracoes();
    if (!config.openai_key) {
      return reply.code(500).type("application/json; charset=utf-8").send({ error: "Chave OpenAI n\xE3o configurada no QG Log\xEDstico." });
    }
    let resumoBairros;
    try {
      const allEnderecos = pedidos.map((p) => p.endereco).join("\n");
      const resOpenAI = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.openai_key}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: `Resuma os bairros destes endere\xE7os em no m\xE1ximo 4 palavras:\\
\\
${allEnderecos}` }],
          max_tokens: 20
        })
      });
      if (!resOpenAI.ok) throw new Error("Falha na API OpenAI");
      const data = await resOpenAI.json();
      resumoBairros = data.choices[0].message.content.trim();
    } catch (e) {
      console.error("FALHA NA OPENAI:", e);
      return reply.code(500).type("application/json; charset=utf-8").send({ error: "A IA n\xE3o conseguiu analisar os endere\xE7os desta rota." });
    }
    const totalTaxa = pedidos.reduce((acc, p) => acc + (p.taxa || 0), 0);
    const msgMotoboy = `\u{1F680} *NOVA ROTA DE ENTREGA!*\\
\\
*Setor:* ${resumoBairros}\\
*Qtd:* ${pedidos.length} entregas\\
*Total a Faturar:* R$ ${totalTaxa.toFixed(2)}`;
    try {
      for (const pedido of pedidos) {
        if (pedido?.id) await savePedido(pedido);
      }
      const pacotesRaw = await getPacotes();
      const pacotesDb = pacotesRaw.map((p) => JSON.parse(p.dados_json));
      const pacoteParaSalvar = pacotesDb.find((p) => p.id === pacoteId);
      if (pacoteParaSalvar) {
        pacoteParaSalvar.status = "PENDENTE_ACEITE";
        pacoteParaSalvar.motoboy = motoboy;
        pacoteParaSalvar.pedidos_snapshot = pedidos.filter((p) => p?.id);
        await savePacote(pacoteParaSalvar);
      }
    } catch (e) {
      console.error("[DESPACHAR] Falha ao persistir pacote/pedidos no banco:", e);
    }
    await enviarConviteRotaTelegram(motoboy.telegram_id, msgMotoboy, pacoteId);
    await broadcastLog("SISTEMA", `Convite de rota enviado para ${motoboy.nome}. Aguardando aceite do motoboy.`);
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.post("/api/operacao/gerar-qr", async (request, reply) => {
    const { pacoteId, motoboy } = request.body || {};
    if (!pacoteId || !motoboy) return reply.code(400).send({ error: "pacoteId e motoboy s\xE3o obrigat\xF3rios." });
    const token = import_crypto2.default.randomUUID();
    dispatchTokens.set(token, { pacoteId, motoboy, expiresAt: Date.now() + 30 * 60 * 1e3 });
    const host = request.headers["x-forwarded-host"] || request.headers.host;
    const proto2 = request.headers["x-forwarded-proto"] || "http";
    const url = `${proto2}://${host}/rota/${token}`;
    const qrBase64 = await import_qrcode2.default.toDataURL(url, { width: 300, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } });
    return reply.send({ token, url, qrBase64 });
  });
  app2.get("/rota/:token", async (request, reply) => {
    const dispatch = dispatchTokens.get(request.params.token);
    if (!dispatch || dispatch.expiresAt < Date.now()) {
      return reply.type("text/html; charset=utf-8").send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expirado</title><style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f1f5f9}h2{color:#ef4444}p{color:#64748b}</style></head><body><h2>\u274C Link expirado</h2><p>Este convite n\xE3o \xE9 mais v\xE1lido.<br>Pe\xE7a um novo QR Code ao operador.</p></body></html>`);
    }
    const [pacotesRaw, pedidosRaw] = await Promise.all([getPacotes(), getPedidos()]);
    const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
    const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
    const pacote = pacotes.find((p) => p.id === dispatch.pacoteId);
    if (!pacote) return reply.type("text/html; charset=utf-8").send("<html><body><h2>Pacote n\xE3o encontrado.</h2></body></html>");
    const stops = (pacote.pedidosIds || []).map((id) => pedidos.find((p) => p.id === id)).filter(Boolean);
    const totalTaxa = stops.reduce((acc, p) => acc + (p.taxa || 0), 0);
    const listaHTML = stops.map((p, i) => {
      const enc = encodeURIComponent(p.endereco);
      return `<div class="stop"><div class="stop-num">${i + 1}</div><div class="stop-info"><div class="stop-cliente">${p.nomeCliente || p.cliente_nome || "Cliente"}</div><div class="stop-end">${p.endereco}</div><div class="stop-links"><a href="https://waze.com/ul?q=${enc}" class="link-waze">\u{1F5FA} Waze</a><a href="https://maps.google.com/?q=${enc}" class="link-maps">\u{1F4CD} Maps</a></div></div></div>`;
    }).join("");
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
<title>Nova Rota</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;min-height:100vh;padding:16px}
.card{background:#fff;border-radius:16px;padding:20px;max-width:480px;margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.header{text-align:center;padding-bottom:16px;border-bottom:1px solid #e2e8f0;margin-bottom:16px}
.title{font-size:1.5rem;font-weight:700;color:#0f172a}
.subtitle{font-size:.9rem;color:#64748b;margin-top:4px}
.stats{display:flex;gap:10px;margin-bottom:16px}
.stat{flex:1;background:#f8fafc;border-radius:10px;padding:12px;text-align:center}
.stat-v{font-size:1.4rem;font-weight:700;color:#0f172a}
.stat-l{font-size:.72rem;color:#64748b;margin-top:2px}
.stop{display:flex;gap:12px;background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:10px}
.stop-num{width:28px;height:28px;background:#0f172a;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;flex-shrink:0;margin-top:2px}
.stop-info{flex:1}
.stop-cliente{font-weight:600;color:#0f172a;margin-bottom:2px}
.stop-end{font-size:.82rem;color:#475569;margin-bottom:8px}
.stop-links{display:flex;gap:8px}
.link-waze,.link-maps{flex:1;padding:7px;border-radius:6px;text-align:center;text-decoration:none;font-size:.8rem;font-weight:600}
.link-waze{background:#33ccff;color:#fff}
.link-maps{background:#34a853;color:#fff}
#btn-aceitar{width:100%;background:#22c55e;color:#fff;border:none;padding:18px;border-radius:12px;font-size:1.1rem;font-weight:700;cursor:pointer;margin-top:16px;transition:background .15s}
#btn-aceitar:active{background:#16a34a}
#btn-aceitar:disabled{background:#86efac;cursor:default}
.success{text-align:center;padding:40px 0}
.success-icon{font-size:3.5rem}
.success-msg{font-size:1.3rem;font-weight:700;color:#15803d;margin-top:14px}
.success-sub{font-size:.9rem;color:#64748b;margin-top:6px}
</style>
</head>
<body>
<div class="card" id="main">
  <div class="header">
    <div class="title">\u{1F6F5} Nova Rota!</div>
    <div class="subtitle">Ol\xE1, ${dispatch.motoboy.nome.split(" ")[0]}. Confira as entregas abaixo.</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-v">${stops.length}</div><div class="stat-l">Paradas</div></div>
    <div class="stat"><div class="stat-v">R$ ${totalTaxa.toFixed(2)}</div><div class="stat-l">A faturar</div></div>
  </div>
  ${listaHTML}
  <button id="btn-aceitar" onclick="aceitar()">\u2705 ACEITAR ROTA</button>
</div>
<script>
async function aceitar(){
  const btn=document.getElementById('btn-aceitar');
  btn.disabled=true; btn.textContent='Confirmando...';
  try{
    const res=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aceitar:true})});
    const data=await res.json();
    if(res.ok&&data.ok){
      document.getElementById('main').innerHTML='<div class="success"><div class="success-icon">\u2705</div><div class="success-msg">Rota aceita!</div><div class="success-sub">Boa entrega! \u{1F3C1}</div></div>';
    } else {
      btn.disabled=false; btn.textContent='\u2705 ACEITAR ROTA';
      alert(data.error||'Erro ao aceitar. Tente novamente.');
    }
  } catch(e){
    btn.disabled=false; btn.textContent='\u2705 ACEITAR ROTA';
    alert('Falha de conex\xE3o. Verifique sua internet.');
  }
}
</script>
</body>
</html>`;
    return reply.type("text/html; charset=utf-8").send(html);
  });
  app2.post("/rota/:token", async (request, reply) => {
    const dispatch = dispatchTokens.get(request.params.token);
    if (!dispatch || dispatch.expiresAt < Date.now()) {
      return reply.code(410).send({ error: "Link expirado. Pe\xE7a um novo QR Code ao operador." });
    }
    const { pacoteId, motoboy } = dispatch;
    dispatchTokens.delete(request.params.token);
    const [pacotesRaw, pedidosRaw] = await Promise.all([getPacotes(), getPedidos()]);
    const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
    const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
    const pacote = pacotes.find((p) => p.id === pacoteId);
    if (!pacote) return reply.code(404).send({ error: "Pacote n\xE3o encontrado." });
    pacote.motoboy = motoboy;
    pacote.status = "EM_ROTA";
    await savePacote(pacote);
    for (const pId of pacote.pedidosIds || []) {
      const p = pedidos.find((ped) => ped.id === pId);
      const tel = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
      if (p && tel) {
        const num = tel.replace(/\D/g, "");
        if (num.length >= 10) {
          await enviarMensagemWhatsApp(`55${num}`, `Ol\xE1, ${(p.nomeCliente || "cliente").split(" ")[0]}! Seu pedido saiu para entrega com ${motoboy.nome.split(" ")[0]}. \u{1F6F5}\u{1F4A8}`);
        }
      }
    }
    broadcastLog("ACEITE_ROTA", `${motoboy.nome.split(" ")[0]} aceitou a rota via QR! Rota em andamento.`, { pacoteId });
    return reply.send({ ok: true });
  });
  app2.post("/api/operacao/sos/reply", async (request, reply) => {
    const { telegram_id, texto } = request.body;
    await enviarMensagemTelegram(telegram_id, texto);
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.post("/api/sac/reply", async (request, reply) => {
    const { jid, texto } = request.body;
    const sucesso = await enviarMensagemWhatsApp(jid, texto, "SISTEMA", "atendimento_humano", "Atendente");
    if (sucesso) return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
    return reply.code(500).type("application/json; charset=utf-8").send({ error: "Falha no envio da mensagem via WhatsApp." });
  });
  app2.post("/api/operacao/coletar", async (request, reply) => {
    const { pacoteId } = request.body || {};
    if (!pacoteId) return reply.code(400).send({ error: "pacoteId \xE9 obrigat\xF3rio." });
    const pacotesRaw = await getPacotes();
    const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
    const pacote = pacotes.find((p) => p.id === pacoteId);
    if (!pacote) return reply.code(404).send({ error: "Pacote n\xE3o encontrado." });
    pacote.coletado = true;
    await savePacote(pacote);
    if (pacote.motoboy?.telegram_id) {
      await enviarMensagemTelegram(pacote.motoboy.telegram_id, "\u2705 *Coleta confirmada pela loja!* Os pacotes est\xE3o com voc\xEA. Boa rota!");
    }
    const pedidosRaw = await getPedidos();
    const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
    for (const pId of pacote.pedidosIds || []) {
      const p = pedidos.find((ped) => ped.id === pId);
      const telefoneCliente = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
      if (p && telefoneCliente) {
        const num = telefoneCliente.replace(/\D/g, "");
        if (num.length >= 10) {
          const nomeSplit = p.nomeCliente ? p.nomeCliente.split(" ")[0] : "cliente";
          const msgCliente = `Ol\xE1, ${nomeSplit}! O seu pedido acabou de sair para entrega com o parceiro *${pacote.motoboy.nome}*. \u{1F6F5}\u{1F4A8}\\
\\
\u26A0\uFE0F *Aten\xE7\xE3o:* Para a seguran\xE7a da sua entrega, informe o c\xF3digo *${p.codigo_entrega}* ao motoboy quando ele chegar.`;
          await enviarMensagemWhatsApp("55" + num, msgCliente);
        }
      }
    }
    await broadcastLog("OPERACAO", `Coleta confirmada para o pacote ${pacoteId}.`);
    return reply.send({ ok: true });
  });
  app2.post("/api/operacao/baixa", async (request, reply) => {
    const { pedidoId } = request.body;
    const pacotesRaw = await getPacotes();
    const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
    const pedidosRaw = await getPedidos();
    const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
    let rotaInfo = null;
    const pacotesAtivos = pacotes.filter((p) => p.status === "PENDENTE_ACEITE" || p.status === "EM_ROTA");
    findRota:
      for (const pacote of pacotesAtivos) {
        for (const pId of pacote.pedidosIds) {
          if (String(pId) === String(pedidoId)) {
            const pedido = pedidos.find((p) => String(p.id) === String(pedidoId)) || (pacote.pedidos_snapshot || []).find((p) => String(p.id) === String(pedidoId));
            if (pedido && pacote.motoboy) {
              rotaInfo = { telegram_id: pacote.motoboy.telegram_id, pedido, pacote };
              break findRota;
            }
          }
        }
      }
    if (rotaInfo) {
      await registrarEntrega(rotaInfo.telegram_id, rotaInfo.pedido.taxa);
      const nomeCliente = rotaInfo.pedido.nomeCliente || "Cliente";
      await inserirHistoricoMotoboy(rotaInfo.telegram_id, "ENTREGA", rotaInfo.pedido.taxa || 0, `Entrega para ${nomeCliente}`);
      await broadcastLog("FINANCEIRO", `Baixa manual conclu\xEDda. Taxa de R$${(rotaInfo.pedido.taxa || 0).toFixed(2)} faturada.`);
      if (rotaInfo.pacote) {
        const pac = rotaInfo.pacote;
        if (pac.pedidos_snapshot) {
          pac.pedidos_snapshot = pac.pedidos_snapshot.filter((p) => String(p.id) !== String(pedidoId));
        }
        pac.pedidosIds = (pac.pedidosIds || []).filter((id) => String(id) !== String(pedidoId));
        if (pac.pedidosIds.length === 0) {
          await deletePacote(pac.id);
          await atualizarCamposMotoboy(rotaInfo.telegram_id, { status: "ONLINE" });
        } else {
          await savePacote(pac);
        }
      }
      await deletePedido(pedidoId);
    }
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.get("/api/whatsapp/start", async (request, reply) => {
    await iniciarWhatsApp();
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.get("/api/whatsapp/status", async (request, reply) => {
    return reply.code(200).type("application/json; charset=utf-8").send({ status: sessionStatus, qr: qrCodeBase64 });
  });
  app2.post("/api/whatsapp/send", async (request, reply) => {
    const { numero, texto } = request.body;
    const sucesso = await enviarMensagemWhatsApp(numero, texto);
    if (sucesso) return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
    return reply.code(500).type("application/json; charset=utf-8").send({ error: "Falha no disparo via API" });
  });
  app2.get("/api/pedidos", async (req, reply) => {
    const pedidos = await getPedidos();
    return reply.send(pedidos.map((p) => JSON.parse(p.dados_json)));
  });
  app2.post("/api/pedidos", async (req, reply) => {
    await clearPedidos();
    for (const pedido of req.body) await savePedido(pedido);
    return reply.send({ ok: true });
  });
  app2.delete("/api/pedidos/:id", async (req, reply) => {
    await deletePedido(req.params.id);
    return reply.send({ ok: true });
  });
  app2.get("/api/pacotes", async (req, reply) => {
    const pacotes = await getPacotes();
    return reply.send(pacotes.map((p) => JSON.parse(p.dados_json)));
  });
  app2.post("/api/pacotes", async (req, reply) => {
    await clearPacotes();
    for (const pacote of req.body) await savePacote(pacote);
    return reply.send({ ok: true });
  });
  app2.delete("/api/pacotes/:id", async (req, reply) => {
    await deletePacote(req.params.id);
    return reply.send({ ok: true });
  });
  app2.get("/api/zonas", async (req, reply) => {
    const zonas = await getZonas();
    return reply.send(zonas.map((z) => JSON.parse(z.dados_json)));
  });
  app2.post("/api/zonas", async (req, reply) => {
    await clearZonas();
    for (const zona of req.body) await saveZona(zona);
    return reply.send({ ok: true });
  });
  app2.delete("/api/zonas/:id", async (req, reply) => {
    await deleteZona(req.params.id);
    return reply.send({ ok: true });
  });
  app2.get("/api/parceiros", async (_request, reply) => {
    const parceiros = await getNosParceiros();
    return reply.send(parceiros);
  });
  app2.post("/api/parceiros", async (request, reply) => {
    const { nome, url } = request.body || {};
    if (!nome || !url) return reply.code(400).send({ error: "Nome e URL s\xE3o obrigat\xF3rios." });
    const id = import_crypto2.default.randomUUID();
    await saveNoParceiro(id, nome.trim(), url.trim().replace(/\/$/, ""));
    return reply.send({ ok: true, id });
  });
  app2.delete("/api/parceiros/:id", async (request, reply) => {
    await deleteNoParceiro(request.params.id);
    return reply.send({ ok: true });
  });
  app2.get("/api/frota-compartilhada/disponiveis", async (_request, reply) => {
    const config = await getConfiguracoes();
    const agora = /* @__PURE__ */ new Date();
    const diasSemana = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const diaKey = diasSemana[agora.getDay()];
    const horaAtual = agora.getHours() * 60 + agora.getMinutes();
    let dentrDoExpediente = false;
    if (config?.horarios) {
      const dia = config.horarios[diaKey];
      if (dia?.ativo && dia.abre && dia.fecha) {
        const [ah, am] = dia.abre.split(":").map(Number);
        const [fh, fm] = dia.fecha.split(":").map(Number);
        const abre = ah * 60 + am;
        const fecha = fh * 60 + fm;
        if (abre <= fecha) {
          dentrDoExpediente = horaAtual >= abre && horaAtual < fecha;
        } else {
          dentrDoExpediente = horaAtual >= abre || horaAtual < fecha;
        }
      }
    }
    if (dentrDoExpediente) return reply.send([]);
    const motoboys = await getMotoboysOnline();
    const disponiveis = motoboys.filter((m) => m.status === "ONLINE" && m.lat && m.lng).map((m) => ({
      telegram_id: m.telegram_id,
      nome: m.nome,
      veiculo: m.veiculo,
      lat: m.lat,
      lng: m.lng
    }));
    return reply.send(disponiveis);
  });
  app2.get("/api/frota-compartilhada/buscar", async (_request, reply) => {
    const config = await getConfiguracoes();
    console.log("[BUSCAR] lat:", config?.lat, "lng:", config?.lng);
    if ((!config?.lat || !config?.lng) && config?.google_maps_key && config?.endereco) {
      try {
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(config.endereco)}&key=${config.google_maps_key}`
        );
        const geoData = await geoRes.json();
        if (geoData.status === "OK") {
          const { lat, lng } = geoData.results[0].geometry.location;
          await updateConfiguracoes({ lat, lng });
          config.lat = lat;
          config.lng = lng;
          console.log("[GEOCODING] Coordenadas obtidas:", lat, lng);
        }
      } catch (e) {
        console.error("[GEOCODING] Erro:", e.message);
      }
    }
    try {
      const lojaLat = config?.lat;
      const lojaLng = config?.lng;
      const buscarUrl = `${HUB_URL}/buscar?lat=${lojaLat || 0}&lng=${lojaLng || 0}`;
      console.log("[BUSCAR NUVEM] URL do fetch:", buscarUrl);
      const res = await fetch(buscarUrl, {
        signal: AbortSignal.timeout(8e3)
      });
      const bodyText = await res.text();
      console.log("[BUSCAR NUVEM] Status HTTP:", res.status);
      console.log("[BUSCAR NUVEM] Body:", bodyText);
      if (!res.ok) {
        return reply.code(502).send({ error: "Falha ao consultar o Hub Central." });
      }
      const resultados = JSON.parse(bodyText);
      return reply.send(resultados);
    } catch (e) {
      console.error("[FROTA COMPARTILHADA] Hub Central inacess\xEDvel:", e);
      return reply.code(502).send({ error: "Hub Central inacess\xEDvel." });
    }
  });
  app2.post("/api/frota-compartilhada/convidar", async (request, reply) => {
    const { telegram_id, no_url, pacoteId, pedidos, taxa_deslocamento_brl, distancia_km, nome } = request.body || {};
    if (!telegram_id || !no_url) return reply.code(400).send({ error: "telegram_id e no_url s\xE3o obrigat\xF3rios." });
    const motoboyLocal = await getMotoboyByTelegramId(telegram_id);
    if (motoboyLocal && (motoboyLocal.status === "EM_ROTA" || motoboyLocal.pagamento_pendente === 1)) {
      return reply.code(409).send({ error: "Motoboy indispon\xEDvel: em rota ou com pagamento pendente." });
    }
    const config = await getConfiguracoes();
    const loja_nome = config?.nome || "Loja Parceira";
    const bot_username = config?.telegram_bot_token ? "bot" : null;
    const pedidos_resumo = (pedidos || []).map((p) => `${p.nomeCliente} \u2014 ${p.endereco}`).join("\n");
    const taxa_entrega = (pedidos || []).reduce((acc, p) => acc + (p.taxa || 0), 0);
    const taxa_desl = taxa_deslocamento_brl || 0;
    const valor_total = taxa_desl + taxa_entrega;
    if (no_url === "GLOBAL") {
      await upsertFleet({ telegram_id, nome: nome || telegram_id, vinculo: "Nuvem", status: "ONLINE" });
      await broadcastLog("FROTA", `Parceiro Global ${nome || telegram_id} adicionado provisoriamente \xE0 frota.`);
      if (pacoteId) {
        const pacotesRaw = await getPacotes();
        const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
        const pacote = pacotes.find((p) => p.id === pacoteId);
        if (pacote) {
          pacote.taxa_deslocamento = taxa_desl;
          pacote.deslocamento_pago = false;
          await savePacote(pacote);
        }
      }
      const enviado = await repassarConviteNuvem(telegram_id, {
        loja_destino_nome: loja_nome,
        link_bot_destino: "",
        taxa_estimada: taxa_desl,
        distancia_km: distancia_km || 0,
        taxa_deslocamento_brl: taxa_desl,
        taxa_entrega,
        valor_total,
        pacote_id: pacoteId || ""
      });
      if (!enviado) return reply.code(502).send({ error: "Falha ao enviar convite via bot local." });
      await broadcastLog("FROTA_COMPARTILHADA", `Convite Global enviado diretamente para motoboy ${telegram_id} via bot local`);
      return reply.send({ ok: true });
    }
    try {
      const res = await fetch(`${no_url}/api/frota-compartilhada/repassar-convite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id,
          loja_nome,
          loja_bot_link: bot_username ? `https://t.me/${bot_username}?start=frota_${pacoteId}` : null,
          pedidos_resumo,
          taxa_total: taxa_desl,
          distancia_km: distancia_km || 0,
          taxa_deslocamento_brl: taxa_desl,
          taxa_entrega,
          valor_total,
          pacote_id: pacoteId || ""
        }),
        signal: AbortSignal.timeout(8e3)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return reply.code(502).send({ error: err.error || "N\xF3 parceiro rejeitou o convite." });
      }
      await broadcastLog("FROTA_COMPARTILHADA", `Convite enviado para motoboy ${telegram_id} via n\xF3 ${no_url}`);
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(502).send({ error: "N\xE3o foi poss\xEDvel contactar o n\xF3 parceiro." });
    }
  });
  app2.post("/api/frota-compartilhada/repassar-convite", async (request, reply) => {
    const { telegram_id, loja_nome, loja_bot_link, pedidos_resumo, taxa_total, distancia_km, taxa_deslocamento_brl, taxa_entrega, valor_total, pacote_id } = request.body || {};
    if (!telegram_id || !loja_nome) return reply.code(400).send({ error: "Dados insuficientes." });
    const motoboy = await getMotoboyByTelegramId(telegram_id);
    if (!motoboy) return reply.code(404).send({ error: "Motoboy n\xE3o encontrado neste n\xF3." });
    if (pacote_id) {
      const pacotesRaw = await getPacotes();
      const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
      const pacote = pacotes.find((p) => p.id === pacote_id);
      if (pacote) {
        pacote.taxa_deslocamento = Number(taxa_deslocamento_brl || taxa_total || 0);
        pacote.deslocamento_pago = false;
        await savePacote(pacote);
      }
    }
    await repassarConviteNuvem(telegram_id, {
      loja_destino_nome: loja_nome,
      link_bot_destino: loja_bot_link || "",
      taxa_estimada: Number(taxa_total || 0),
      distancia_km: Number(distancia_km || 0),
      taxa_deslocamento_brl: Number(taxa_deslocamento_brl || taxa_total || 0),
      taxa_entrega: Number(taxa_entrega || 0),
      valor_total: Number(valor_total || 0),
      pacote_id: pacote_id || ""
    });
    await broadcastLog("FROTA_COMPARTILHADA", `Convite de ${loja_nome} repassado para ${motoboy.nome}.`);
    return reply.send({ ok: true });
  });
  app2.register(async (instance) => {
    instance.get("/ws/logs", { websocket: true }, (connection) => {
      connection.send(JSON.stringify({ tipo: "SYSTEM", mensagem: "Conectado ao terminal de Logs.", data: (/* @__PURE__ */ new Date()).toISOString() }));
    });
  });
  const checkInactiveDrivers = async () => {
    try {
      const derrubados = await limparRadarInativo();
      if (derrubados > 0) {
        await broadcastLog("FROTA", `Radar: ${derrubados} motoboy(s) ficaram OFFLINE por perda de sinal GPS.`);
      }
    } catch (e) {
      console.error("Erro ao verificar motoboys inativos:", e);
    } finally {
      setTimeout(checkInactiveDrivers, 6e4);
    }
  };
  setTimeout(checkInactiveDrivers, 6e4);
  setInterval(async () => {
    try {
      console.log("[HUB SYNC] Ciclo executando \xE0s:", (/* @__PURE__ */ new Date()).toLocaleTimeString("pt-BR"));
      const config = await getConfiguracoes();
      const agora = /* @__PURE__ */ new Date();
      const diasSemana = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
      const diaKey = diasSemana[agora.getDay()];
      const horaAtual = agora.getHours() * 60 + agora.getMinutes();
      let dentroDoExpediente = false;
      if (config?.horarios) {
        const dia = config.horarios[diaKey];
        if (dia?.ativo && dia.abre && dia.fecha) {
          const [ah, am] = dia.abre.split(":").map(Number);
          const [fh, fm] = dia.fecha.split(":").map(Number);
          const abre = ah * 60 + am;
          const fecha = fh * 60 + fm;
          if (abre <= fecha) {
            dentroDoExpediente = horaAtual >= abre && horaAtual < fecha;
          } else {
            dentroDoExpediente = horaAtual >= abre || horaAtual < fecha;
          }
        }
      }
      const motoboys = await getMotoboysOnline();
      const online = motoboys.filter(
        (m) => m.status === "ONLINE" && m.lat && m.lng && (m.vinculo === "Nuvem" || !dentroDoExpediente)
      );
      console.log(
        "[HUB SYNC] dentroDoExpediente:",
        dentroDoExpediente,
        "| online no radar:",
        motoboys.length,
        "| passaram no filtro:",
        online.length,
        "|",
        online.map((m) => `${m.nome}(${m.vinculo})`).join(", ") || "nenhum"
      );
      const noUrl = config?.url_publica || LOJA_URL;
      console.log("[HUB SYNC] noUrl:", noUrl, "| HUB_URL:", HUB_URL);
      if (!noUrl || online.length === 0) return;
      for (const m of online) {
        fetch(`${HUB_URL}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegram_id: m.telegram_id, nome: m.nome, lat: m.lat, lng: m.lng, no_url: noUrl, no_nome: config?.nome || "Loja Parceira" }),
          signal: AbortSignal.timeout(5e3)
        }).then(async (res) => {
          if (!res.ok) {
            const errText = await res.text();
            console.error(`[HUB SYNC] ERRO ${res.status} da HostGator:`, errText);
          } else {
            console.log(`[HUB SYNC] Sucesso! ${m.nome} atualizado na Nuvem.`);
          }
        }).catch((e) => console.error("[HUB SYNC] Falha de rede:", e.message));
      }
    } catch (e) {
      console.error("[HUB SYNC] Erro no intervalo de sincroniza\xE7\xE3o:", e);
    }
  }, 2 * 60 * 1e3);
  app2.get("/api/gerar-token-bot", async (_request, reply) => {
    const token = await gerarTokenCadastro();
    return reply.send({ token });
  });
  setInterval(async () => {
    try {
      await limparParceirosNuvemExpirados();
    } catch (e) {
      console.error("[LIMPEZA NUVEM] Erro na limpeza hor\xE1ria:", e);
    }
  }, 60 * 60 * 1e3);
  await app2.listen({ port: 3e3, host: "0.0.0.0" });
  console.log("\u{1F680} SERVIDOR CEIA NO AR: Aceda a http://localhost:3000 no navegador");
  console.log("\u2705 Tudo pronto e operando!");
  iniciarTelegram();
}

// index.ts
async function bootstrap() {
  try {
    console.log("--- INICIANDO SISTEMA CEIA ---");
    await initDatabase();
    iniciarWhatsApp();
    await startServer();
    console.log("\u2705 Tudo pronto e operando!");
  } catch (error) {
    console.error("FALHA CR\xCDTICA NO BOOTSTRAP:", error);
    process.exit(1);
  }
}
bootstrap();
