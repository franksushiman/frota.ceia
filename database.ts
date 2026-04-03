import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.sqlite');

export let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;

export async function initDatabase(): Promise<Database> {
    if (db) return db;
    if (dbPromise) return await dbPromise;

    dbPromise = open({ filename: dbPath, driver: sqlite3.Database }).then(async (database) => {
        console.log('✔ Conexão com SQLite estabelecida (Caminho Absoluto Ativado).');

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
        config.auto_responder = config.auto_responder === 1;
    }
    return config;
}

export async function updateConfiguracoes(dados: any) {
    const database = await initDatabase();

    const check = await database.get('SELECT id FROM configuracoes WHERE id = 1');
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
    return await database.all('SELECT * FROM motoboys ORDER BY nome ASC');
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

export async function atualizarMotoboy(telegram_id: string, veiculo: string, vinculo: string) {
    const database = await initDatabase();
    await database.run('UPDATE motoboys SET veiculo = ?, vinculo = ? WHERE telegram_id = ?', [veiculo, vinculo, telegram_id]);
}

function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

export async function registrarEntrega(telegram_id: string, valor_entrega: number) {
    const database = await initDatabase();

    const config = await getConfiguracoes();
    const moto = await database.get('SELECT * FROM motoboys WHERE telegram_id = ?', [telegram_id]);

    if (!moto || !config) return false;

    let distancia = 0;
    let taxa_deslocamento = 0;

    if (moto.vinculo === 'Nuvem' && config.lat && config.lng && moto.lat && moto.lng) {
        distancia = calcularDistanciaKm(moto.lat, moto.lng, config.lat, config.lng);
        taxa_deslocamento = distancia * 1.50;
    }

    await database.run(`
        INSERT INTO entregas (telegram_id, valor_entrega, distancia_km, taxa_deslocamento, data)
        VALUES (?, ?, ?, ?, ?)
    `, [telegram_id, valor_entrega, distancia, taxa_deslocamento, new Date().toISOString()]);

    return true;
}

export async function getExtratoFinanceiro(telegram_id: string) {
    const database = await initDatabase();

    const entregas = await database.all('SELECT * FROM entregas WHERE telegram_id = ? AND status = "PENDENTE"', [telegram_id]);

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
    await database.run('UPDATE entregas SET status = "PAGO" WHERE telegram_id = ? AND status = "PENDENTE"', [telegram_id]);
}
