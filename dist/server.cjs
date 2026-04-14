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
var import_websocket = __toESM(require("@fastify/websocket"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_url2 = require("url");

// database.ts
var import_sqlite3 = __toESM(require("sqlite3"), 1);
var import_sqlite = require("sqlite");
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_meta = {};
var __filename = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = import_path.default.dirname(__filename);
var dbPath = import_path.default.join(__dirname, "database.sqlite");
var db = null;
var dbPromise = null;
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
      await database.run('INSERT INTO configuracoes (id, nome) VALUES (1, "Minha Base Ceia")');
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
                lat REAL, lng REAL, ultima_atualizacao TEXT
            );
        `);
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
    config.auto_responder = config.auto_responder === 1;
  }
  return config;
}
async function updateConfiguracoes(dados) {
  const database = await initDatabase();
  const check = await database.get("SELECT id FROM configuracoes WHERE id = 1");
  if (!check) {
    await database.run('INSERT INTO configuracoes (id, nome) VALUES (1, "Minha Base Ceia")');
  }
  const query = `
        UPDATE configuracoes SET
            nome = ?, endereco = ?, whatsapp = ?, link_cardapio = ?,
            google_maps_key = ?, openai_key = ?, meta_api_token = ?,
            telegram_bot_token = ?, horarios = ?, auto_responder = ?
        WHERE id = 1
    `;
  await database.run(query, [
    dados.nome || null,
    dados.endereco || null,
    dados.whatsapp || null,
    dados.link_cardapio || null,
    dados.google_maps_key || null,
    dados.openai_key || null,
    dados.meta_api_token || null,
    dados.telegram_bot_token || null,
    dados.horarios ? JSON.stringify(dados.horarios) : null,
    dados.auto_responder ? 1 : 0
  ]);
}
async function registrarLog(tipo, mensagem) {
  const database = await initDatabase();
  await database.run("INSERT INTO logs (tipo, mensagem, data) VALUES (?, ?, ?)", [tipo, mensagem, (/* @__PURE__ */ new Date()).toISOString()]);
}
async function getFleet() {
  const database = await initDatabase();
  return await database.all("SELECT * FROM motoboys ORDER BY nome ASC");
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
async function atualizarMotoboy(telegram_id, veiculo, vinculo) {
  const database = await initDatabase();
  await database.run("UPDATE motoboys SET veiculo = ?, vinculo = ? WHERE telegram_id = ?", [veiculo, vinculo, telegram_id]);
}
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
async function registrarEntrega(telegram_id, valor_entrega) {
  const database = await initDatabase();
  const config = await getConfiguracoes();
  const moto = await database.get("SELECT * FROM motoboys WHERE telegram_id = ?", [telegram_id]);
  if (!moto || !config) return false;
  let distancia = 0;
  let taxa_deslocamento = 0;
  if (moto.vinculo === "Nuvem" && config.lat && config.lng && moto.lat && moto.lng) {
    distancia = calcularDistanciaKm(moto.lat, moto.lng, config.lat, config.lng);
    taxa_deslocamento = distancia * 1.5;
  }
  await database.run(`
        INSERT INTO entregas (telegram_id, valor_entrega, distancia_km, taxa_deslocamento, data)
        VALUES (?, ?, ?, ?, ?)
    `, [telegram_id, valor_entrega, distancia, taxa_deslocamento, (/* @__PURE__ */ new Date()).toISOString()]);
  return true;
}
async function getExtratoFinanceiro(telegram_id) {
  const database = await initDatabase();
  const entregas = await database.all('SELECT * FROM entregas WHERE telegram_id = ? AND status = "PENDENTE"', [telegram_id]);
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
  await database.run('UPDATE entregas SET status = "PAGO" WHERE telegram_id = ? AND status = "PENDENTE"', [telegram_id]);
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

// whatsappBot.ts
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

// whatsappBot.ts
var contextCache = /* @__PURE__ */ new Map();
var customerSessionCache = /* @__PURE__ */ new Map();
function manageCustomerSession(jid) {
  if (customerSessionCache.has(jid)) {
    const session = customerSessionCache.get(jid);
    clearTimeout(session.timeout);
    session.timeout = setTimeout(() => {
      customerSessionCache.delete(jid);
      broadcastLog("INFO", `Sess\xE3o de atendimento para ${jid} expirou.`);
    }, 15 * 60 * 1e3);
    return session;
  }
  const newSession = {
    mode: "BOT",
    timeout: setTimeout(() => {
      customerSessionCache.delete(jid);
      broadcastLog("INFO", `Sess\xE3o de atendimento para ${jid} expirou.`);
    }, 15 * 60 * 1e3)
  };
  customerSessionCache.set(jid, newSession);
  return newSession;
}
var qrCodeBase64 = null;
var sessionStatus = "DISCONNECTED";
var sock = null;
function normalizePhone(input) {
  if (!input) return "";
  return input.includes("@") ? input.split("@")[0] : input.replace(/\D/g, "");
}
async function iniciarWhatsApp() {
  sessionStatus = "CONNECTING";
  qrCodeBase64 = null;
  broadcastLog("WHATSAPP", "Iniciando conex\xE3o nativa com Baileys...");
  const { state, saveCreds } = await (0, import_baileys.useMultiFileAuthState)("auth_info_baileys");
  const { version } = await (0, import_baileys.fetchLatestBaileysVersion)();
  sock = (0, import_baileys.makeWASocket)({
    auth: state,
    version,
    logger: (0, import_pino.default)({ level: "silent" }),
    // Silencia os logs vermelhos do Baileys
    browser: import_baileys.Browsers.macOS("Desktop"),
    syncFullHistory: false
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        qrCodeBase64 = await import_qrcode.default.toDataURL(qr);
        broadcastLog("WHATSAPP", "Novo QR Code gerado. Aguardando leitura na tela...");
      } catch (e) {
        console.error("Erro ao gerar imagem do QR Code:", e);
      }
    }
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== import_baileys.DisconnectReason.loggedOut;
      broadcastLog("WHATSAPP", `Conex\xE3o fechada. Motivo: ${lastDisconnect?.error?.message}. Reconectando: ${shouldReconnect}`);
      if (shouldReconnect) {
        iniciarWhatsApp();
      } else {
        sessionStatus = "DISCONNECTED";
        qrCodeBase64 = null;
        import_fs.default.rmSync("auth_info_baileys", { recursive: true, force: true });
        broadcastLog("WHATSAPP", "Sess\xE3o encerrada/deslogada. Ser\xE1 necess\xE1rio ler o QR Code novamente.");
      }
    } else if (connection === "open") {
      sessionStatus = "CONNECTED";
      qrCodeBase64 = null;
      broadcastLog("WHATSAPP", "WhatsApp conectado e operante! \u{1F7E2}");
    }
  });
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    const msg = m.messages[0];
    const numeroCliente = msg.key.remoteJid;
    if (!msg.message || msg.key.fromMe || !numeroCliente || numeroCliente.endsWith("@g.us") || numeroCliente.endsWith("@broadcast")) {
      return;
    }
    const numeroNormalizado = normalizePhone(numeroCliente);
    await sock.readMessages([msg.key]);
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
    broadcastLog("WHATSAPP", `Recebido de [${numeroNormalizado}]: ${mensagemTexto || "Localiza\xE7\xE3o"}`);
    const rota = await getRotaPeloCliente(numeroNormalizado);
    if (rota && rota.telegram_id) {
      if (location) {
        const mapsLink = `https://www.google.com/maps?q=${location.degreesLatitude},${location.degreesLongitude}`;
        await sendTelegramMessage(rota.telegram_id, `\u{1F4CD} Localiza\xE7\xE3o enviada pelo cliente: ${mapsLink}`);
        return;
      }
      const resumo = await resumirClienteParaMotoboy(mensagemTexto);
      const prefixo = isAudio ? "\u{1F399}\uFE0F \xC1udio do Cliente (Resumo):\n" : "\u26A0\uFE0F Retorno do Cliente: ";
      await sendTelegramMessage(rota.telegram_id, prefixo + resumo);
      broadcastLog("TELEGRAM", `Resumo do cliente ${numeroNormalizado} enviado ao motoboy.`);
      return;
    }
    const jidBruto = msg.key.remoteJid;
    if (contextCache.size > 0) {
      console.log(`[DEBUG] Tentando match sem\xE2ntico para a resposta: '${mensagemTexto}'`);
      const contextosAtivos = Array.from(contextCache.entries()).map(([key, value]) => ({ ...value, originalJid: key }));
      const telegramIdMatch = await analisarRespostaComContextoIA(mensagemTexto, contextosAtivos);
      if (telegramIdMatch && telegramIdMatch !== "NAO") {
        const contextoEncontrado = contextosAtivos.find((c) => c.telegramId === telegramIdMatch);
        if (contextoEncontrado) {
          console.log(`[DEBUG] Match encontrado! Encaminhando para motoboy ${contextoEncontrado.motoboyName}`);
          const resumoTecnico = await resumirRespostaClienteParaMotoboy(mensagemTexto);
          await sendTelegramMessage(contextoEncontrado.telegramId, `\u26A0\uFE0F Retorno do Cliente: ${resumoTecnico}`);
          contextCache.delete(contextoEncontrado.originalJid);
          broadcastLog("TELEGRAM", `Resposta de ${numeroNormalizado} roteada para ${contextoEncontrado.motoboyName} via Roteamento Sem\xE2ntico.`);
          return;
        }
      }
    }
    const session = manageCustomerSession(jidBruto);
    if (session.mode === "HUMAN") {
      broadcastLog("SAC_MSG", mensagemTexto, { jid: jidBruto, nome: msg.pushName || numeroNormalizado });
      return;
    }
    if (session.mode === "WAITING_CODE") {
      if (mensagemTexto.match(/^\d{4}$/)) {
        const config2 = await getConfiguracoes();
        const status = await gerarRastreioHumanizado(mensagemTexto, config2);
        await enviarMensagemWhatsApp(numeroCliente, status, "SISTEMA", "status_pedido", "BOT");
        if (!status.startsWith("\u274C")) {
          session.mode = "BOT";
        }
        return;
      }
    }
    console.log("[DEBUG] Mensagem n\xE3o atrelada a motoboy. Enviando para IA de Auto-Atendimento...");
    const config = await getConfiguracoes();
    console.log("[DEBUG] Valor do auto_responder no banco:", config.auto_responder);
    try {
      console.log("[DEBUG] \u{1F9E0} Chamando motor da OpenAI (processarMensagemIA)...");
      const respostaIA = await processarMensagemIA(mensagemTexto);
      console.log(`[DEBUG] \u{1F916} Resposta gerada pela IA: "${respostaIA}"`);
      if (respostaIA.includes("[ACTION_TRACKING]")) {
        session.mode = "WAITING_CODE";
        await enviarMensagemWhatsApp(numeroCliente, "Para localizar sua entrega, por favor, digite o c\xF3digo de 4 d\xEDgitos do seu pedido.", "SISTEMA", "pede_codigo", "BOT");
        return;
      }
      if (respostaIA.includes("[ACTION_HUMAN]")) {
        session.mode = "HUMAN";
        broadcastLog("SAC_REQUEST", `Cliente [${msg.pushName || numeroNormalizado}] pediu para falar com um atendente.`, { jid: jidBruto, nome: msg.pushName || numeroNormalizado });
        await enviarMensagemWhatsApp(numeroCliente, "Um de nossos atendentes j\xE1 vai falar com voc\xEA. Aguarde um instante.", "SISTEMA", "transfere_humano", "BOT");
        return;
      }
      console.log("[DEBUG] \u{1F4E4} Disparando mensagem de volta para o WhatsApp...");
      await enviarMensagemWhatsApp(numeroCliente, respostaIA, "SISTEMA", "SISTEMA_AUTO_ATENDIMENTO", "BOT");
      console.log("[DEBUG] \u2705 Mensagem enviada com sucesso ao cliente!");
    } catch (error) {
      console.error("[ERRO FATAL] Falha na execu\xE7\xE3o do Auto-Atendimento:", error);
    }
  });
}
async function enviarMensagemWhatsApp(numero, texto, telegramId = "SISTEMA", motoboyMessage = "envio_sistema", motoboyName = "CEIA", retryCount = 0) {
  try {
    if (sessionStatus === "CONNECTING" && retryCount < 5) {
      console.log(`[WHATSAPP] Aguardando inicializa\xE7\xE3o do aparelho para disparar... (${retryCount + 1}/5)`);
      await new Promise((resolve) => setTimeout(resolve, 2e3));
      return enviarMensagemWhatsApp(numero, texto, telegramId, motoboyMessage, motoboyName, retryCount + 1);
    }
    if (sessionStatus !== "CONNECTED" || !sock) {
      console.error("[WHATSAPP] Tentativa de envio falhou: Sess\xE3o desconectada.");
      return null;
    }
    let idEnvio = numero;
    if (!numero.includes("@")) {
      let numeroLimpo = normalizePhone(numero);
      if (numeroLimpo.startsWith("5555")) {
        numeroLimpo = numeroLimpo.substring(2);
      } else if (numeroLimpo.length === 10 || numeroLimpo.length === 11) {
        numeroLimpo = "55" + numeroLimpo;
      }
      idEnvio = numeroLimpo + "@s.whatsapp.net";
      try {
        const query = await sock.onWhatsApp(numeroLimpo);
        if (query && query.length > 0 && query[0].exists) {
          idEnvio = query[0].jid;
        }
      } catch (e) {
      }
    }
    await sock.sendPresenceUpdate("composing", idEnvio);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await sock.sendPresenceUpdate("paused", idEnvio);
    const sentMsg = await sock.sendMessage(idEnvio, { text: texto });
    const realJid = sentMsg.key.remoteJid;
    if (realJid && telegramId !== "SISTEMA") {
      console.log(`[CACHE] Armazenando contexto para JID: ${realJid}`);
      contextCache.set(realJid, {
        telegramId,
        motoboyName,
        lastMotoboyMessage: motoboyMessage,
        timestamp: Date.now()
      });
      setTimeout(() => {
        contextCache.delete(realJid);
      }, 15 * 60 * 1e3);
    }
    return realJid;
  } catch (error) {
    console.error("Erro ao disparar WhatsApp nativo:", error);
    return null;
  }
}
async function gerarRastreioHumanizado(codigo, config) {
  try {
    const pedidosRaw = await getPedidos();
    const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
    const pedidoEncontrado = pedidos.find((p) => p.codigo_entrega === codigo);
    if (!pedidoEncontrado) return "\u274C C\xF3digo n\xE3o encontrado. Verifique os 4 d\xEDgitos e tente novamente.";
    const pacotesRaw = await getPacotes();
    const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
    const pacoteDoPedido = pacotes.find((pac) => pac.pedidosIds.includes(pedidoEncontrado.id));
    if (!pacoteDoPedido) return "Seu pedido est\xE1 sendo preparado na cozinha!";
    if (pacoteDoPedido.status === "PENDENTE_ACEITE") return "Estamos aguardando o entregador iniciar a rota.";
    const telegramId = pacoteDoPedido.motoboy?.telegram_id;
    const nomeCompleto = pacoteDoPedido.motoboy?.nome || "o entregador";
    const primeiroNome = nomeCompleto !== "o entregador" ? nomeCompleto.split(" ")[0] : nomeCompleto;
    const frota = await getFleet();
    const motoboyDb = frota.find((m) => m.telegram_id === telegramId);
    let tempoEstimado = "em breve";
    let localizacaoAtual = "a caminho";
    if (motoboyDb && motoboyDb.lat && motoboyDb.lng && config.google_maps_key && pedidoEncontrado.endereco) {
      try {
        const origin = `${motoboyDb.lat},${motoboyDb.lng}`;
        const destination = encodeURIComponent(pedidoEncontrado.endereco);
        const dmUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&key=${config.google_maps_key}&language=pt-BR`;
        const dmRes = await fetch(dmUrl);
        const dmData = await dmRes.json();
        if (dmData.status === "OK" && dmData.rows[0].elements[0].status === "OK") {
          tempoEstimado = dmData.rows[0].elements[0].duration.text;
          const enderecoOrigem = dmData.origin_addresses[0];
          localizacaoAtual = enderecoOrigem.split(",")[1]?.trim() || enderecoOrigem.split("-")[0]?.trim() || "na sua regi\xE3o";
        }
      } catch (e) {
        console.error("[DEBUG MAPS] Erro ao calcular ETA:", e);
      }
    }
    const openai = new import_openai.default({ apiKey: config.openai_key });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Voc\xEA \xE9 o r\xE1dio comunicador amig\xE1vel do restaurante. O entregador ${primeiroNome} est\xE1 passando por ${localizacaoAtual}. O GPS informa que ele chegar\xE1 em exatamente ${tempoEstimado}. Escreva uma resposta curta (m\xE1x 20 palavras), informando o tempo de chegada. Seja direto e n\xE3o ofere\xE7a ajuda extra.` }
      ],
      temperature: 0.3
    });
    return completion.choices[0].message?.content || `O entregador ${primeiroNome} est\xE1 a caminho e chega em ${tempoEstimado}!`;
  } catch (e) {
    console.error("[DEBUG RASTREIO] Erro geral:", e);
    return "Seu pedido j\xE1 saiu para entrega e est\xE1 a caminho!";
  }
}
async function processarMensagemIA(mensagemCliente) {
  try {
    const config = await getConfiguracoes();
    if (!config.openai_key) throw new Error("OpenAI Key n\xE3o configurada.");
    const horariosFormatados = config.horarios ? Object.entries(config.horarios).filter(([, val]) => val.on).map(([dia, val]) => `${dia.charAt(0).toUpperCase() + dia.slice(1)}: ${val.abre} \xE0s ${val.fecha}`).join(", ") : "N\xE3o informado.";
    const openai = new import_openai.default({ apiKey: config.openai_key });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Voc\xEA \xE9 o assistente virtual do estabelecimento ${config.nome || "nosso restaurante"}. Nossas informa\xE7\xF5es \xFAteis: Endere\xE7o: ${config.endereco || "N\xE3o informado"}. Hor\xE1rios: ${horariosFormatados}. Card\xE1pio: ${config.link_cardapio || "N\xE3o dispon\xEDvel online"}. REGRAS: Se o cliente quiser fazer um pedido, oriente a usar o link do card\xE1pio. Se perguntar sobre entrega/pedido, retorne ESTRITAMENTE a tag: [ACTION_TRACKING]. Se exigir falar com um humano/atendente, retorne ESTRITAMENTE a tag: [ACTION_HUMAN]. Se perguntar algo fora de contexto (pol\xEDtica, piadas), ignore ou diga que n\xE3o pode ajudar.` },
        { role: "user", content: mensagemCliente }
      ],
      temperature: 0.5
    });
    return completion.choices[0].message?.content || "Desculpe, tive um problema ao processar sua resposta.";
  } catch (error) {
    console.error("[ERRO OPENAI]", error);
    return "Ol\xE1! Nosso sistema est\xE1 passando por uma manuten\xE7\xE3o r\xE1pida.";
  }
}
async function traduzirMotoboyParaCliente(mensagemMotoboy) {
  try {
    const config = await getConfiguracoes();
    if (!config.openai_key) throw new Error("OpenAI Key n\xE3o configurada.");
    const openai = new import_openai.default({ apiKey: config.openai_key });
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
async function analisarRespostaComContextoIA(respostaCliente, contextos) {
  try {
    const config = await getConfiguracoes();
    if (!config.openai_key) throw new Error("OpenAI Key n\xE3o configurada.");
    const listaDeContextos = contextos.map((c) => `telegramId: ${c.telegramId} | Motoboy: ${c.motoboyName} | Pergunta: "${c.lastMotoboyMessage}"`).join("\n");
    const prompt = `Um cliente acaba de enviar a seguinte resposta: '${respostaCliente}'.
Temos os seguintes motoboys aguardando retorno:
${listaDeContextos}

Essa resposta faz sentido para qual dessas perguntas? Responda ESTRITAMENTE com o 'telegramId' correspondente, ou retorne a palavra 'NAO' se a resposta n\xE3o fizer sentido para nenhum dos contextos.`;
    const openai = new import_openai.default({ apiKey: config.openai_key });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Voc\xEA \xE9 um roteador l\xF3gico. Analise a resposta do cliente e os contextos pendentes. Sua resposta deve ser apenas o 'telegramId' do motoboy correspondente ou a palavra 'NAO'." },
        { role: "user", content: prompt }
      ],
      temperature: 0
    });
    return completion.choices[0].message?.content || "NAO";
  } catch (error) {
    console.error("Erro na an\xE1lise de contexto da IA:", error);
    return "NAO";
  }
}
async function resumirClienteParaMotoboy(mensagemCliente) {
  try {
    const config = await getConfiguracoes();
    if (!config.openai_key) throw new Error("OpenAI Key n\xE3o configurada.");
    const openai = new import_openai.default({ apiKey: config.openai_key });
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Voc\xEA \xE9 o assistente de tr\xE2nsito do entregador. Sua miss\xE3o \xE9 ler o que o cliente escreveu e entregar apenas a instru\xE7\xE3o de a\xE7\xE3o em 5 ou 6 palavras no m\xE1ximo. REGRAS CR\xCDTICAS: 1. NUNCA deixe o entregador sem resposta. 2. Se o cliente apenas agradeceu, disse 'ok' ou algo irrelevante, responda apenas: 'Ciente.'. 3. Foco total em: endere\xE7o, port\xE3o, quem vai receber ou tempo de espera." },
        { role: "user", content: mensagemCliente }
      ],
      temperature: 0.5
    });
    return completion.choices[0].message?.content || "Cliente respondeu, verifique o hist\xF3rico.";
  } catch (error) {
    return "O cliente enviou uma mensagem. Verifique o chat se necess\xE1rio.";
  }
}
async function resumirRespostaClienteParaMotoboy(respostaCliente) {
  try {
    const config = await getConfiguracoes();
    if (!config.openai_key) throw new Error("OpenAI Key n\xE3o configurada.");
    const openai = new import_openai.default({ apiKey: config.openai_key });
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Voc\xEA \xE9 o r\xE1dio comunicador da frota. Traduza a mensagem do cliente em uma mensagem curta e t\xE9cnica para o motoboy (m\xE1ximo 6 palavras). NUNCA fale com o cliente. Sa\xEDda esperada ex: 'Cliente confirmou, est\xE1 ciente'." },
        { role: "user", content: `O cliente disse: '${respostaCliente}'` }
      ],
      temperature: 0.2
    });
    return completion.choices[0].message?.content || "Cliente respondeu, verifique o hist\xF3rico.";
  } catch (error) {
    return "O cliente enviou uma mensagem. Verifique o chat se necess\xE1rio.";
  }
}
async function sendTelegramMessage(chatId, text) {
  try {
    const config = await getConfiguracoes();
    const token = config.telegram_token || config.telegram_bot_token;
    if (!token) {
      broadcastLog("ERROR", "Token do Telegram n\xE3o configurado.");
      return;
    }
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (error) {
    broadcastLog("ERROR", `Erro inesperado ao encaminhar mensagem para o Telegram: ${error}`);
  }
}

// telegramBot.ts
var import_telegraf = require("telegraf");
var userSessions = {};
var bot = null;
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
  const texto = `\u2601\uFE0F *CHAMADO NUVEM* \u2601\uFE0F

A loja *${dados_loja.loja_destino_nome}* precisa de um motoboy para uma entrega.

*Taxa Estimada:* R$ ${dados_loja.taxa_estimada.toFixed(2)}`;
  try {
    await bot.telegram.sendMessage(telegram_id, texto, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      ...import_telegraf.Markup.inlineKeyboard([
        import_telegraf.Markup.button.url("\u2705 Aceitar Rota", dados_loja.link_bot_destino),
        import_telegraf.Markup.button.callback("\u274C Recusar", "recusar_nuvem")
      ])
    });
    return true;
  } catch (e) {
    console.error("Falha ao repassar convite nuvem:", e);
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
        await upsertFleet({ telegram_id: chatId.toString(), [field]: value, status: "CADASTRANDO" });
        if (userSessions[chatId]) {
          userSessions[chatId].data[field] = value;
          if (nextStep) userSessions[chatId].step = nextStep;
        }
      } catch (error) {
      }
    };
    const defaultKeyboard = import_telegraf.Markup.keyboard([
      ["\u{1F198} Pedir Ajuda (SOS)", "\u{1F4AC} Falar com Cliente"]
    ]).resize();
    bot.start(async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const startPayload = ctx.startPayload;
        if (startPayload && startPayload.startsWith("nuvem_")) {
          const pacoteId = startPayload.replace("nuvem_", "");
          const nomeNuvem = `${ctx.from.first_name || "Motoboy"} (Nuvem)`;
          await upsertFleet({ telegram_id: chatId.toString(), nome: nomeNuvem, vinculo: "Nuvem", status: "CADASTRANDO" });
          userSessions[chatId] = { step: "AGUARDANDO_GPS_NUVEM", data: { pacote_id_nuvem: pacoteId } };
          broadcastLog("NUVEM", `Motoboy ${nomeNuvem} aceitou um convite da rede e est\xE1 se registrando.`);
          await ctx.reply(`Bem-vindo! Voc\xEA aceitou uma rota da rede Nuvem.

Para prosseguir e receber os dados da entrega, por favor, partilhe a sua **Localiza\xE7\xE3o em Tempo Real** comigo.`, import_telegraf.Markup.removeKeyboard());
          return;
        }
        userSessions[chatId] = { step: "NOME", data: {} };
        await ctx.reply(`Ol\xE1! Bem-vindo \xE0 frota da CEIA.
Vamos iniciar o seu registo. Por favor, digite o seu **Nome Completo**:`, import_telegraf.Markup.removeKeyboard());
      } catch (e) {
      }
    });
    bot.hears("\u{1F198} Pedir Ajuda (SOS)", async (ctx) => {
      const nome = ctx.from.first_name;
      userSessions[ctx.chat.id] = { step: "SOS_CHAT", data: {} };
      broadcastLog("SOS", `O motoboy ${nome} acionou o ALARME DE EMERG\xCANCIA!`, { telegram_id: ctx.chat.id.toString() });
      await ctx.reply("\u{1F6A8} O seu sinal de emerg\xEAncia foi enviado para a base. Aguarde, a loja entrar\xE1 em contacto consigo imediatamente.", import_telegraf.Markup.inlineKeyboard([
        import_telegraf.Markup.button.callback("\u2716\uFE0F Encerrar Emerg\xEAncia", "cancelar_chat")
      ]));
    });
    bot.hears("\u{1F4AC} Falar com Cliente", async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const rotas = await getRotasMotoboy(chatId);
      if (rotas.length === 0) return ctx.reply("N\xE3o tem nenhuma rota ativa de momento.");
      const botoes = rotas.map((r) => [import_telegraf.Markup.button.callback(`Falar com ${r.pedido.nomeCliente.split(" ")[0]}`, `chat_${r.pedido.id}`)]);
      await ctx.reply("Com qual cliente precisa de falar?", import_telegraf.Markup.inlineKeyboard(botoes));
    });
    bot.action(/^chat_(.+)$/, async (ctx) => {
      const pedidoId = ctx.match[1];
      const chatId = ctx.chat.id;
      const rotas = await getRotasMotoboy(chatId.toString());
      const rota = rotas.find((r) => r.pedido.id === pedidoId);
      if (!rota) return ctx.answerCbQuery("Pedido n\xE3o encontrado ou j\xE1 finalizado.");
      console.log("[DEBUG PEDIDO] Dados do pedido selecionado:", rota.pedido);
      userSessions[chatId] = { step: "CHAT_CLIENTE", data: { telefone_cliente: rota.pedido.telefone || rota.pedido.telefoneCliente || rota.pedido.whatsapp || rota.pedido.telefone_cliente, nome_cliente: rota.pedido.nomeCliente } };
      await ctx.editMessageText(`Aberta linha direta com *${rota.pedido.nomeCliente.split(" ")[0]}*.

Digite a mensagem abaixo e eu enviarei para o WhatsApp do cliente de forma oculta.`, {
        parse_mode: "Markdown",
        ...import_telegraf.Markup.inlineKeyboard([
          import_telegraf.Markup.button.callback("\u2716\uFE0F Encerrar Conversa", "cancelar_chat")
        ])
      });
      await ctx.answerCbQuery();
    });
    bot.action(/^aceitar_(.+)$/, async (ctx) => {
      const pacoteId = ctx.match[1];
      broadcastLog("ACEITE_ROTA", `Motoboy confirmou a rota ${pacoteId}`, { pacoteId });
      await ctx.editMessageText(ctx.callbackQuery.message?.text + "\n\n\u2705 *ROTA ACEITE!* Pode iniciar o deslocamento.", { parse_mode: "Markdown", disable_web_page_preview: true });
      await ctx.answerCbQuery("Rota Aceite!");
      const pacotesRaw = await getPacotes();
      const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
      const pacote = pacotes.find((p) => p.id === pacoteId);
      const pedidosRaw = await getPedidos();
      const pedidos = pedidosRaw.map((p) => JSON.parse(p.dados_json));
      if (pacote) {
        pacote.motoboy = { telegram_id: ctx.from.id.toString(), nome: ctx.from.first_name };
        pacote.status = "EM_ROTA";
        await savePacote(pacote);
        for (const pId of pacote.pedidosIds || []) {
          const p = pedidos.find((ped) => ped.id === pId);
          const telefoneCliente = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
          if (p && telefoneCliente) {
            const num = telefoneCliente.replace(/\D/g, "");
            if (num.length >= 10) {
              const msgCliente = `Ol\xE1, ${p.nomeCliente.split(" ")[0]}! O seu pedido acabou de sair para entrega com o parceiro *${pacote.motoboy.nome}*. \u{1F6F5}\u{1F4A8}

\u26A0\uFE0F *Aten\xE7\xE3o:* Para a seguran\xE7a da sua entrega, informe o c\xF3digo *${p.codigo_entrega}* ao motoboy quando ele chegar.`;
              await enviarMensagemWhatsApp("55" + num, msgCliente);
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
            detalheMsg += `*Cliente ${++index}: ${p.cliente_nome || p.nomeCliente || "Cliente"}*
`;
            detalheMsg += `\u{1F4CD} ${p.endereco}
`;
            detalheMsg += `[\u{1F5FA}\uFE0F Waze](${wazeLink}) | [\u{1F4CD} Maps](${mapsLink})

`;
          }
        }
        detalheMsg += `\u{1F4A1} Ao chegar, pe\xE7a o *c\xF3digo de 4 d\xEDgitos* ao cliente e digite aqui para dar baixa.`;
        await ctx.reply(detalheMsg, { parse_mode: "Markdown", disable_web_page_preview: true });
      }
    });
    bot.action(/^recusar_(.+)$/, async (ctx) => {
      const pacoteId = ctx.match[1];
      const pacotesRaw = await getPacotes();
      const pacotes = pacotesRaw.map((p) => JSON.parse(p.dados_json));
      const pacote = pacotes.find((p) => p.id === pacoteId);
      if (pacote) {
        pacote.motoboy = null;
        pacote.status = "AGUARDANDO";
        await savePacote(pacote);
      }
      broadcastLog("RECUSA_ROTA", `O motoboy ${ctx.from.first_name} RECUSOU o Pacote #${pacoteId.split("_")[1].substring(6)}.`, { pacoteId });
      await ctx.editMessageText("\u274C *ROTA RECUSADA*. Foi devolvida para a base.", { parse_mode: "Markdown" });
      await ctx.answerCbQuery("Rota Recusada");
    });
    bot.action("recusar_nuvem", async (ctx) => {
      await ctx.editMessageText("\u2601\uFE0F Convite da rede nuvem recusado.");
      await ctx.answerCbQuery();
    });
    bot.action("cancelar_chat", async (ctx) => {
      delete userSessions[ctx.chat.id];
      await ctx.editMessageText("\u2705 Conversa encerrada.");
      await ctx.reply("Voc\xEA voltou ao menu principal.", defaultKeyboard);
      await ctx.answerCbQuery();
    });
    bot.hears(/^\d{4}$/, async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const codigo = ctx.message.text;
      const sucesso = await processarBaixaPeloTelegram(chatId, codigo);
      if (sucesso) {
        if (userSessions[ctx.chat.id]?.step === "CHAT_CLIENTE") delete userSessions[ctx.chat.id];
        await ctx.reply(`\u2705 C\xF3digo aceite! A entrega foi confirmada e o valor lan\xE7ado no seu extrato.`);
      } else {
        await ctx.reply(`\u274C C\xF3digo inv\xE1lido ou a entrega j\xE1 se encontra finalizada.`);
      }
    });
    bot.on("location", async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const { latitude, longitude } = ctx.message.location;
        const motoboy = await getMotoboyByTelegramId(chatId.toString());
        const session = userSessions[chatId];
        if (motoboy && motoboy.vinculo === "Nuvem" && session?.step === "AGUARDANDO_GPS_NUVEM" && ctx.message.location.live_period) {
          await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: "ONLINE" });
          broadcastLog("NUVEM", `Motoboy Nuvem [${motoboy.nome}] est\xE1 ONLINE e pronto para a rota.`);
          await ctx.reply("\u2705 Localiza\xE7\xE3o recebida! A sua rota est\xE1 a ser preparada...");
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
              await savePacote(pacote);
              let detalheMsg = "\u{1F4DD} *DETALHES DA ROTA:*\n\n";
              let index = 0;
              for (const pId of pacote.pedidosIds || []) {
                const p = pedidos.find((ped) => ped.id === pId);
                if (p) {
                  const wazeLink = `https://waze.com/ul?q=${encodeURIComponent(p.endereco)}`;
                  const mapsLink = `https://maps.google.com/?q=${encodeURIComponent(p.endereco)}`;
                  detalheMsg += `*Cliente ${++index}: ${p.cliente_nome || p.nomeCliente || "Cliente"}*
`;
                  detalheMsg += `\u{1F4CD} ${p.endereco}
`;
                  detalheMsg += `[\u{1F5FA}\uFE0F Waze](${wazeLink}) | [\u{1F4CD} Maps](${mapsLink})

`;
                }
              }
              detalheMsg += `\u{1F4A1} Ao chegar, pe\xE7a o *c\xF3digo de 4 d\xEDgitos* ao cliente e digite aqui para dar baixa.`;
              await ctx.reply(detalheMsg, { parse_mode: "Markdown", disable_web_page_preview: true, ...defaultKeyboard });
              delete userSessions[chatId];
            } else {
              await ctx.reply("\u26A0\uFE0F N\xE3o foi poss\xEDvel encontrar os detalhes da sua rota. Por favor, contacte a loja.");
            }
          }
          return;
        }
        if (ctx.message.location.live_period) {
          await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: "ONLINE" });
          broadcastLog("FROTA", `Motoboy [${ctx.from.first_name}] bateu o ponto e est\xE1 ONLINE \u{1F7E2}`);
          await ctx.reply("\u{1F7E2} Ponto registado! Encontra-se ONLINE no radar da loja.\n\nFique atento \xE0s novas rotas. (Para desligar, pare de partilhar a localiza\xE7\xE3o ou digite /offline)", defaultKeyboard);
        } else {
          await ctx.reply("\u26A0\uFE0F Aten\xE7\xE3o: Enviou uma localiza\xE7\xE3o fixa. Precisa de partilhar a **Localiza\xE7\xE3o em Tempo Real**.");
        }
      } catch (e) {
      }
    });
    bot.on("edited_message", async (ctx) => {
      try {
        if ("location" in ctx.editedMessage) {
          const chatId = ctx.editedMessage.chat.id;
          const { latitude, longitude } = ctx.editedMessage.location;
          await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: "ONLINE" });
        }
      } catch (e) {
      }
    });
    bot.command("offline", async (ctx) => {
      const chatId = ctx.chat.id;
      await upsertFleet({ telegram_id: chatId.toString(), status: "OFFLINE" });
      broadcastLog("FROTA", `Motoboy [${ctx.from.first_name}] encerrou o expediente via comando \u{1F534}`);
      await ctx.reply("\u{1F534} Expediente encerrado.", import_telegraf.Markup.removeKeyboard());
    });
    bot.command("cancelar", async (ctx) => {
      delete userSessions[ctx.chat.id];
      await ctx.reply("\u2705 Conversa encerrada. Voc\xEA voltou ao menu principal.", defaultKeyboard);
    });
    bot.on("text", async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const session = userSessions[chatId];
        const text = ctx.message.text;
        if (text.startsWith("/")) return;
        if (session?.step === "SOS_CHAT") {
          broadcastLog("SOS_MSG", text, { telegram_id: chatId.toString() });
          return;
        }
        if (session?.step === "CHAT_CLIENTE") {
          const num = session.data.telefone_cliente?.replace(/\D/g, "");
          if (num) {
            try {
              console.log(`[DEBUG CHAT] Motoboy digitou: "${text}"`);
              const sentMessage = await ctx.reply("Processando e reescrevendo para o cliente...");
              const textoProfissional = await traduzirMotoboyParaCliente(text);
              console.log(`[DEBUG CHAT] Resposta da IA: "${textoProfissional}"`);
              if (textoProfissional.trim().toUpperCase().includes("IGNORAR")) {
                console.log(`[DEBUG CHAT] \u{1F6D1} IA bloqueou o envio (considerou irrelevante).`);
                await ctx.telegram.editMessageText(ctx.chat.id, sentMessage.message_id, void 0, "Sinal recebido (IA optou por n\xE3o incomodar o cliente).");
                return;
              }
              console.log(`[DEBUG CHAT] \u{1F7E2} IA aprovou. Disparando para o WhatsApp...`);
              const jidCliente = await enviarMensagemWhatsApp("55" + num, textoProfissional, ctx.chat.id.toString(), text, ctx.from.first_name);
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
        if (!session) return;
        switch (session.step) {
          case "NOME":
            await updateProgress(chatId, "nome", text, "CPF");
            await ctx.reply("Perfeito! Agora, qual \xE9 o seu **CPF**?");
            break;
          case "CPF":
            await updateProgress(chatId, "cpf", text, "VINCULO");
            await ctx.reply("Qual o seu **V\xEDnculo** com a empresa?", import_telegraf.Markup.keyboard([["Fixo", "Freelancer"]]).oneTime().resize());
            break;
          case "VINCULO":
            if (text !== "Fixo" && text !== "Freelancer") return ctx.reply('Por favor, selecione "Fixo" ou "Freelancer".');
            await updateProgress(chatId, "vinculo", text, "PIX");
            await ctx.reply("Qual a sua **Chave PIX** para recebimentos?", import_telegraf.Markup.removeKeyboard());
            break;
          case "PIX":
            await updateProgress(chatId, "pix", text, "VEICULO");
            await ctx.reply("Qual \xE9 o seu **Ve\xEDculo**? (Ex: Scooter, Carro)");
            break;
          case "VEICULO":
            await upsertFleet({ telegram_id: chatId.toString(), veiculo: text, status: "OFFLINE" });
            const nomeFinal = session.data.nome || ctx.from.first_name;
            broadcastLog("FROTA", `Novo registo finalizado: ${nomeFinal} (${text})`);
            delete userSessions[chatId];
            await ctx.reply("\u2705 Registo conclu\xEDdo com sucesso!\n\nEncontra-se **OFFLINE** no momento.\n\nPara iniciar o expediente, partilhe a sua **Localiza\xE7\xE3o em Tempo Real** comigo.", defaultKeyboard);
            break;
        }
      } catch (e) {
      }
    });
    bot.launch();
    broadcastLog("TELEGRAM", "Conectado aos servidores. R\xE1dio da frota operante!");
    process.once("SIGINT", () => bot?.stop("SIGINT"));
    process.once("SIGTERM", () => bot?.stop("SIGTERM"));
  } catch (error) {
    broadcastLog("ERROR", "Falha ao iniciar o r\xE1dio da frota.");
  }
}

// server.ts
var import_meta2 = {};
var __filename2 = (0, import_url2.fileURLToPath)(import_meta2.url);
var __dirname2 = import_path2.default.dirname(__filename2);
var app2 = (0, import_fastify.default)({ logger: false });
async function startServer() {
  await initDatabase();
  await app2.register(import_cors.default, { origin: "*" });
  await app2.register(import_websocket.default);
  initLogger(app2);
  app2.get("/", async (request, reply) => {
    const htmlPath = import_path2.default.join(__dirname2, "index.html");
    const htmlContent = import_fs2.default.readFileSync(htmlPath, "utf-8");
    return reply.type("text/html").send(htmlContent);
  });
  app2.get("/api/profile", async (request, reply) => {
    console.log("\u{1F4E1} [TELA] Solicitou os dados do QG Log\xEDstico...");
    const config = await getConfiguracoes();
    console.log("\u{1F4E6} [SISTEMA] Devolvendo chaves e hor\xE1rios para a tela.");
    return reply.code(200).type("application/json; charset=utf-8").send(config || {});
  });
  app2.post("/api/profile", async (request, reply) => {
    console.log("\u{1F4BE} [TELA] Pediu para gravar novas configura\xE7\xF5es...");
    await updateConfiguracoes(request.body);
    await broadcastLog("SUCCESS", "Configura\xE7\xF5es atualizadas via Painel");
    iniciarTelegram();
    console.log("\u{1F7E2} [SISTEMA] Banco SQLite atualizado com sucesso!");
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
    const { veiculo, vinculo } = request.body;
    await atualizarMotoboy(request.params.id, veiculo, vinculo);
    await broadcastLog("FROTA", "Perfil de motoboy atualizado.");
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.get("/api/financeiro/:id", async (request, reply) => {
    const extrato = await getExtratoFinanceiro(request.params.id);
    return reply.code(200).type("application/json; charset=utf-8").send(extrato);
  });
  app2.post("/api/financeiro/pagar/:id", async (request, reply) => {
    const telegram_id = request.params.id;
    await zerarAcertoFinanceiro(telegram_id);
    await broadcastLog("FINANCEIRO", "Acerto de motoboy liquidado com sucesso.");
    const motoboy = await getMotoboyByTelegramId(telegram_id);
    if (motoboy && motoboy.vinculo === "Nuvem") {
      await enviarMensagemTelegram(telegram_id, "\u{1F4B8} Acerto recebido! Obrigado por rodar connosco hoje. A sua sess\xE3o nesta loja foi encerrada.");
      await deletarMotoboy(telegram_id);
      await broadcastLog("NUVEM", `Motoboy Nuvem [${motoboy.nome}] finalizou o ciclo e foi removido da base.`);
    }
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
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
          messages: [{ role: "user", content: `Resuma os bairros destes endere\xE7os em no m\xE1ximo 4 palavras:

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
    const msgMotoboy = `\u{1F680} *NOVA ROTA DE ENTREGA!*

*Setor:* ${resumoBairros}
*Qtd:* ${pedidos.length} entregas
*Total a Faturar:* R$ ${totalTaxa.toFixed(2)}`;
    await enviarConviteRotaTelegram(motoboy.telegram_id, msgMotoboy, pacoteId);
    await broadcastLog("SISTEMA", `Convite de rota enviado para ${motoboy.nome}. Aguardando aceite.`);
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.post("/api/operacao/sos/reply", async (request, reply) => {
    const { telegram_id, texto } = request.body;
    console.log("[DEBUG SOS] O Painel tentou enviar mensagem para o ID:", request.body.telegram_id, "| Texto:", request.body.texto);
    await enviarMensagemTelegram(telegram_id, texto);
    return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
  });
  app2.post("/api/sac/reply", async (request, reply) => {
    const { jid, texto } = request.body;
    const sucesso = await enviarMensagemWhatsApp(jid, texto, "SISTEMA", "atendimento_humano", "Atendente");
    if (sucesso) {
      return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
    }
    return reply.code(500).type("application/json; charset=utf-8").send({ error: "Falha no envio da mensagem via WhatsApp." });
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
          if (pId === pedidoId) {
            const pedido = pedidos.find((p) => p.id === pedidoId);
            if (pedido) {
              rotaInfo = { telegram_id: pacote.motoboy.telegram_id, pedido };
              break findRota;
            }
          }
        }
      }
    if (rotaInfo) {
      await registrarEntrega(rotaInfo.telegram_id, rotaInfo.pedido.taxa);
      await broadcastLog("FINANCEIRO", `Baixa manual conclu\xEDda. Taxa de R$${(rotaInfo.pedido.taxa || 0).toFixed(2)} faturada.`);
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
    if (sucesso) {
      return reply.code(200).type("application/json; charset=utf-8").send({ ok: true });
    }
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
