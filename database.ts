import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import crypto from 'crypto';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'database.sqlite');

export let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;
let _jwtSecret: string | null = null;

export async function initDatabase(): Promise<Database> {
    if (db) return db;
    if (dbPromise) return await dbPromise;

    dbPromise = open({ filename: dbPath, driver: sqlite3.Database }).then(async (database) => {
        console.log('\u2714 Conex\u00e3o com SQLite estabelecida (Caminho Absoluto Ativado).');

        await database.exec(`
            CREATE TABLE IF NOT EXISTS configuracoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT, endereco TEXT, whatsapp TEXT, link_cardapio TEXT,
                google_maps_key TEXT, openai_key TEXT, meta_api_token TEXT,
                telegram_bot_token TEXT, lat REAL, lng REAL,
                horarios TEXT, auto_responder INTEGER DEFAULT 0
            );
        `);

        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN horarios TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN auto_responder INTEGER DEFAULT 0;'); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN link_cardapio TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN google_maps_key TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN openai_key TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN meta_api_token TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN telegram_bot_token TEXT;'); } catch (e) {}

        await database.run('DELETE FROM configuracoes WHERE id != 1');
        const check = await database.get('SELECT id FROM configuracoes WHERE id = 1');
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
        try { await database.exec('ALTER TABLE motoboys ADD COLUMN pagamento_pendente INTEGER DEFAULT 0;'); } catch (e) {}
        try { await database.exec('ALTER TABLE motoboys ADD COLUMN pendente_desde TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE motoboys ADD COLUMN ultima_nota REAL;'); } catch (e) {}
        try { await database.exec('ALTER TABLE motoboys ADD COLUMN no_url TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE motoboys ADD COLUMN no_nome TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE motoboys ADD COLUMN taxa_deslocamento REAL;'); } catch (e) {}
        try { await database.exec('ALTER TABLE motoboys ADD COLUMN distancia_km REAL;'); } catch (e) {}

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

        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN jwt_secret TEXT;'); } catch (e) {}
        try { await database.exec("ALTER TABLE configuracoes ADD COLUMN whatsapp_provider TEXT DEFAULT 'baileys';"); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN meta_phone_number_id TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN documento TEXT;'); } catch (e) {}
        try { await database.exec('ALTER TABLE configuracoes ADD COLUMN whatsapp_ativo INTEGER DEFAULT 1;'); } catch (e) {}

        await database.exec('CREATE TABLE IF NOT EXISTS tokens_cadastro (token TEXT PRIMARY KEY, usado INTEGER DEFAULT 0, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)');

        db = database;
        return database;
    });

    return await dbPromise;
}

export async function getConfiguracoes() {
    const database = await initDatabase();
    const config = await database.get('SELECT * FROM configuracoes WHERE id = 1');
    if (config) {
        if (config.horarios) {
            try {
                config.horarios = JSON.parse(config.horarios);
            } catch(e) {}
        }
        config.whatsapp_provider = config.whatsapp_provider || 'baileys';
        if (config.admin_allowlist) {
            try { config.admin_allowlist = JSON.parse(config.admin_allowlist); } catch(e) { config.admin_allowlist = []; }
        } else {
            config.admin_allowlist = [];
        }
    }
    return config;
}

export async function updateConfiguracoes(dados: any) {
    const database = await initDatabase();

    const check = await database.get('SELECT id FROM configuracoes WHERE id = 1');
    if (!check) {
        await database.run("INSERT INTO configuracoes (id, nome) VALUES (1, 'Minha Base Ceia')");
    }

    // Todos os campos usam COALESCE(?, col) para que chamadas parciais
    // (ex: updateConfiguracoes({ lat, lng }) do geocoding) n\u00e3o sobrescrevam
    // campos existentes com NULL. A ordem dos ? deve espelhar 1:1 o array abaixo.
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

    //  1  nome
    //  2  documento
    //  3  endereco
    //  4  whatsapp
    //  5  link_cardapio
    //  6  google_maps_key
    //  7  openai_key
    //  8  meta_api_token
    //  9  telegram_bot_token
    // 10  horarios
    // 11  whatsapp_provider
    // 12  meta_phone_number_id
    // 13  whatsapp_ativo
    // 14  lat
    // 15  lng
    await database.run(query, [
        dados.nome               || null,                                             //  1
        dados.documento          || null,                                             //  2
        dados.endereco           || null,                                             //  3
        dados.whatsapp           || null,                                             //  4
        dados.link_cardapio      || null,                                             //  5
        dados.google_maps_key    || null,                                             //  6
        dados.openai_key         || null,                                             //  7
        dados.meta_api_token     || null,                                             //  8
        dados.telegram_bot_token || null,                                             //  9
        dados.horarios ? JSON.stringify(dados.horarios) : null,                      // 10
        dados.whatsapp_provider  || null,                                             // 11
        dados.meta_phone_number_id || null,                                           // 12
        dados.whatsapp_ativo !== undefined ? (dados.whatsapp_ativo ? 1 : 0) : null,  // 13
        dados.lat  || null,                                                           // 14
        dados.lng  || null,                                                           // 15
    ]);
}

export async function registrarLog(tipo: string, mensagem: string) {
    const database = await initDatabase();
    await database.run('INSERT INTO logs (tipo, mensagem, data) VALUES (?, ?, ?)', [tipo, mensagem, new Date().toISOString()]);
}

export async function getMotoboysOnline() {
    const database = await initDatabase();
    return await database.all(`SELECT * FROM motoboys WHERE status IN ('ONLINE', 'EM_ENTREGA')`);
}

export async function getFleet() {
    const database = await initDatabase();
    const rows = await database.all('SELECT * FROM motoboys ORDER BY nome ASC');
    // Exp\u00f5e cpf como whatsapp para o frontend sem exigir migration
    return rows.map((m: any) => ({ ...m, whatsapp: m.whatsapp ?? m.cpf ?? null }));
}

export async function getMotoboyByTelegramId(telegram_id: string) {
    const database = await initDatabase();
    return await database.get('SELECT * FROM motoboys WHERE telegram_id = ?', [telegram_id]);
}

export async function upsertFleet(dados: any) {
    const database = await initDatabase();
    const { telegram_id, ...campos } = dados;
    if (!telegram_id) return;

    if (campos.latitude !== undefined) campos.lat = campos.latitude;
    if (campos.longitude !== undefined) campos.lng = campos.longitude;
    delete campos.latitude;
    delete campos.longitude;

    campos.ultima_atualizacao = new Date().toISOString();

    const chaves = Object.keys(campos);
    const valores = Object.values(campos);

    if (chaves.length === 0) {
        await database.run('INSERT OR IGNORE INTO motoboys (telegram_id) VALUES (?)', [telegram_id]);
        return;
    }

    const colunasStr = ['telegram_id', ...chaves].join(', ');
    const placeholdersStr = Array(chaves.length + 1).fill('?').join(', ');
    const updateStr = chaves.map(c => `${c} = EXCLUDED.${c}`).join(', ');

    const query = `INSERT INTO motoboys (${colunasStr}) VALUES (${placeholdersStr}) ON CONFLICT(telegram_id) DO UPDATE SET ${updateStr}`;
    await database.run(query, [telegram_id, ...valores]);
}

export async function limparRadarInativo() {
    const database = await initDatabase();
    const result = await database.run(`
        UPDATE motoboys SET status = 'OFFLINE'
        WHERE status IN ('ONLINE', 'EM_ENTREGA') AND datetime(ultima_atualizacao) < datetime('now', '-5 minutes')
    `);
    return result.changes || 0;
}

export async function deletarMotoboy(telegram_id: string) {
    const database = await initDatabase();
    await database.run('DELETE FROM motoboys WHERE telegram_id = ?', [telegram_id]);
    await database.run('DELETE FROM entregas WHERE telegram_id = ?', [telegram_id]);
}

export async function atualizarMotoboy(telegram_id: string, veiculo: string, vinculo: string, nome?: string, whatsapp?: string, pix?: string) {
    const database = await initDatabase();
    await database.run(
        'UPDATE motoboys SET veiculo = ?, vinculo = ?, nome = COALESCE(?, nome), cpf = COALESCE(?, cpf), pix = COALESCE(?, pix) WHERE telegram_id = ?',
        [veiculo, vinculo, nome || null, whatsapp || null, pix || null, telegram_id]
    );
}

function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

export async function registrarEntrega(telegram_id: string, valor_entrega: number, taxa_deslocamento: number = 0) {
    const database = await initDatabase();

    await database.run(`
        INSERT INTO entregas (telegram_id, valor_entrega, distancia_km, taxa_deslocamento, data)
        VALUES (?, ?, ?, ?, ?)
    `, [telegram_id, valor_entrega, 0, taxa_deslocamento, new Date().toISOString()]);

    return true;
}

export async function getExtratoFinanceiro(telegram_id: string) {
    const database = await initDatabase();

    const entregas = await database.all("SELECT * FROM entregas WHERE telegram_id = ? AND status = 'PENDENTE'", [telegram_id]);

    let total_entregas = 0;
    let total_deslocamento = 0;

    entregas.forEach(e => {
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

export async function zerarAcertoFinanceiro(telegram_id: string) {
    const database = await initDatabase();
    await database.run("UPDATE entregas SET status = 'PAGO' WHERE telegram_id = ? AND status = 'PENDENTE'", [telegram_id]);
}

export async function inserirHistoricoMotoboy(telegram_id: string, tipo: string, valor: number, descricao: string) {
    const database = await initDatabase();
    await database.run(
        'INSERT INTO historico_motoboys (telegram_id, tipo, valor, descricao) VALUES (?, ?, ?, ?)',
        [telegram_id, tipo, valor, descricao]
    );
}

export async function getHistoricoMotoboy(telegram_id: string) {
    const database = await initDatabase();
    return await database.all(
        'SELECT * FROM historico_motoboys WHERE telegram_id = ? ORDER BY data_criacao DESC LIMIT 100',
        [telegram_id]
    );
}

export async function getPedidos() {
    const database = await initDatabase();
    return await database.all('SELECT dados_json FROM pedidos');
}
export async function savePedido(pedido: any) {
    const database = await initDatabase();
    await database.run('INSERT OR REPLACE INTO pedidos (id, dados_json) VALUES (?, ?)', [pedido.id, JSON.stringify(pedido)]);
}
export async function deletePedido(id: string) {
    const database = await initDatabase();
    await database.run('DELETE FROM pedidos WHERE id = ?', [id]);
}
export async function clearPedidos() {
    const database = await initDatabase();
    await database.run('DELETE FROM pedidos');
}

export async function getPacotes() {
    const database = await initDatabase();
    return await database.all('SELECT dados_json FROM pacotes');
}
export async function savePacote(pacote: any) {
    const database = await initDatabase();
    await database.run('INSERT OR REPLACE INTO pacotes (id, dados_json) VALUES (?, ?)', [pacote.id, JSON.stringify(pacote)]);
}
export async function deletePacote(id: string) {
    const database = await initDatabase();
    await database.run('DELETE FROM pacotes WHERE id = ?', [id]);
}
export async function clearPacotes() {
    const database = await initDatabase();
    await database.run('DELETE FROM pacotes');
}

export async function getZonas() {
    const database = await initDatabase();
    return await database.all('SELECT dados_json FROM zonas');
}
export async function saveZona(zona: any) {
    const database = await initDatabase();
    await database.run('INSERT OR REPLACE INTO zonas (id, dados_json) VALUES (?, ?)', [zona.id, JSON.stringify(zona)]);
}
export async function deleteZona(id: string) {
    const database = await initDatabase();
    await database.run('DELETE FROM zonas WHERE id = ?', [id]);
}
export async function clearZonas() {
    const database = await initDatabase();
    await database.run('DELETE FROM zonas');
}

// ==================== USU\u00c1RIOS ADMIN ====================

export async function getJwtSecret(): Promise<string> {
    if (_jwtSecret) return _jwtSecret;
    const database = await initDatabase();
    const row = await database.get('SELECT jwt_secret FROM configuracoes WHERE id = 1');
    if (row?.jwt_secret) {
        _jwtSecret = row.jwt_secret;
        return _jwtSecret!;
    }
    const novo = crypto.randomBytes(64).toString('hex');
    await database.run('UPDATE configuracoes SET jwt_secret = ? WHERE id = 1', [novo]);
    _jwtSecret = novo;
    return _jwtSecret!;
}

export async function contarUsuarios(): Promise<number> {
    const database = await initDatabase();
    const row = await database.get('SELECT COUNT(*) as cnt FROM usuarios');
    return row?.cnt ?? 0;
}

export async function criarUsuario(whatsapp: string, senha_hash: string, telegram_id?: string): Promise<void> {
    const database = await initDatabase();
    await database.run(
        'INSERT INTO usuarios (whatsapp, senha_hash, telegram_id) VALUES (?, ?, ?)',
        [whatsapp, senha_hash, telegram_id ?? null]
    );
}

export async function getUsuarioPorWhatsapp(whatsapp: string): Promise<any> {
    const database = await initDatabase();
    return await database.get('SELECT * FROM usuarios WHERE whatsapp = ?', [whatsapp]);
}

export async function getUsuarioPorTelegramId(telegram_id: string): Promise<any> {
    const database = await initDatabase();
    return await database.get('SELECT * FROM usuarios WHERE telegram_id = ?', [telegram_id]);
}

export async function atualizarSenhaUsuario(id: number, senha_hash: string): Promise<void> {
    const database = await initDatabase();
    await database.run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [senha_hash, id]);
}

export async function vincularTelegramUsuario(whatsapp: string, telegram_id: string): Promise<boolean> {
    const database = await initDatabase();
    const usuario = await database.get('SELECT id FROM usuarios WHERE whatsapp = ?', [whatsapp]);
    if (!usuario) return false;
    await database.run('UPDATE usuarios SET telegram_id = ? WHERE id = ?', [telegram_id, usuario.id]);
    return true;
}

// ==================== N\u00d3S PARCEIROS ====================

export async function getNosParceiros(): Promise<any[]> {
    const database = await initDatabase();
    return await database.all('SELECT * FROM nos_parceiros ORDER BY nome ASC');
}

export async function saveNoParceiro(id: string, nome: string, url: string): Promise<void> {
    const database = await initDatabase();
    await database.run(
        'INSERT OR REPLACE INTO nos_parceiros (id, nome, url, ativo) VALUES (?, ?, ?, 1)',
        [id, nome, url]
    );
}

export async function deleteNoParceiro(id: string): Promise<void> {
    const database = await initDatabase();
    await database.run('DELETE FROM nos_parceiros WHERE id = ?', [id]);
}

// ==================== NUVEM / LIMPEZA ====================

/**
 * Remove motoboys Nuvem com pagamento liquidado (pagamento_pendente = 0)
 * e motoboys Nuvem com pagamento pendente h\u00e1 mais de 30 dias.
 */
export async function limparParceirosNuvemExpirados(): Promise<void> {
    const database = await initDatabase();
    const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    await database.run(
        `DELETE FROM motoboys WHERE vinculo = 'Nuvem' AND (pagamento_pendente = 0 OR pagamento_pendente IS NULL)`
    );

    await database.run(
        `DELETE FROM motoboys WHERE vinculo = 'Nuvem' AND pagamento_pendente = 1 AND pendente_desde < ?`,
        [trintaDiasAtras]
    );
}

/**
 * Atualiza campos arbitr\u00e1rios de um motoboy por telegram_id.
 */
export async function atualizarCamposMotoboy(telegram_id: string, campos: Record<string, unknown>): Promise<void> {
    const database = await initDatabase();
    const chaves = Object.keys(campos);
    if (chaves.length === 0) return;
    const setStr = chaves.map(c => `${c} = ?`).join(', ');
    const valores = Object.values(campos);
    await database.run(`UPDATE motoboys SET ${setStr} WHERE telegram_id = ?`, [...valores, telegram_id]);
}

export async function gerarTokenCadastro(): Promise<string> {
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const database = await initDatabase();
    await database.run('INSERT INTO tokens_cadastro (token) VALUES (?)', [token]);
    return token;
}

export async function validarEUsarToken(token: string): Promise<boolean> {
    const database = await initDatabase();
    const row = await database.get('SELECT * FROM tokens_cadastro WHERE token = ? AND usado = 0', [token]);
    if (!row) return false;
    await database.run('UPDATE tokens_cadastro SET usado = 1 WHERE token = ?', [token]);
    return true;
}

