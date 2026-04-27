import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import QRCode from 'qrcode';

// \u2500\u2500 Tokens de despacho presencial \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// token UUID \u2192 {pacoteId, motoboy, expiresAt}. Sem persist\u00eancia \u2014 reinicia com o servidor.
const dispatchTokens = new Map<string, { pacoteId: string; motoboy: any; expiresAt: number }>();

const HASH_PLACEHOLDER: string = bcrypt.hashSync('placeholder-ceia-never-matches', 12);

function gerarCodigoRecuperacao(): string {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(12);
    const grupos: string[] = [];
    for (let g = 0; g < 3; g++) {
        let grupo = '';
        for (let i = 0; i < 4; i++) grupo += alfabeto[bytes[g * 4 + i] % alfabeto.length];
        grupos.push(grupo);
    }
    return `CEIA-${grupos[0]}-${grupos[1]}-${grupos[2]}`;
}

setInterval(() => {
    const now = Date.now();
    for (const [t, d] of dispatchTokens) if (d.expiresAt < now) dispatchTokens.delete(t);
}, 5 * 60 * 1000);

import { initDatabase, getConfiguracoes, updateConfiguracoes, getFleet, limparRadarInativo, deletarMotoboy, atualizarMotoboy, atualizarCamposMotoboy, upsertFleet, getExtratoFinanceiro, zerarAcertoFinanceiro, registrarEntrega, getMotoboyByTelegramId, getPedidos, savePedido, deletePedido, clearPedidos, getPacotes, savePacote, deletePacote, clearPacotes, getZonas, saveZona, deleteZona, clearZonas, getJwtSecret, contarUsuarios, criarUsuario, getUsuarioPorWhatsapp, atualizarSenhaUsuario, atualizarCodigoRecuperacao, getCodigoRecuperacaoHash, inserirHistoricoMotoboy, getHistoricoMotoboy, getNosParceiros, saveNoParceiro, deleteNoParceiro, getMotoboysOnline, limparParceirosNuvemExpirados, gerarTokenCadastro } from './database';
import { iniciarWhatsApp, trocarNumeroWhatsApp, qrCodeBase64, sessionStatus, enviarMensagemWhatsApp, setClienteSAC, traduzirMotoboyParaCliente, isIgnorar } from './whatsapp/index';
import { iniciarTelegram, enviarConviteRotaTelegram, enviarMensagemTelegram, repassarConviteNuvem, enviarConfirmacaoPagamento, iniciarChatOperador } from './telegramBot';
import { initLogger, broadcastLog, broadcastMessage } from './logger';


const HUB_URL = process.env.HUB_URL;
const NODE_TOKEN = process.env.NODE_TOKEN;
const LOJA_URL = process.env.LOJA_URL ?? '';

if (!NODE_TOKEN) console.warn('[CEIA] WARNING: NODE_TOKEN não definido — requisições ao Hub serão rejeitadas.');

async function hubFetch(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
    if (!HUB_URL) throw new Error('HUB_URL não configurado.');
    const url = `${HUB_URL}/wp-json/ceia/v1${path}`;
    const headers: Record<string, string> = {
        'X-Ceia-Node-Token': NODE_TOKEN || '',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> || {})
    };
    const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(8000) });
    let data: any;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw new Error(`Hub respondeu ${res.status}: ${JSON.stringify(data)}`);
    return { ok: res.ok, status: res.status, data };
}

export const app: FastifyInstance = Fastify({ logger: false });

async function processarMensagensNuvem(mensagens: any[]): Promise<number> {
    let processadas = 0;
    for (const msg of mensagens) {
        try {
            if (msg.tipo === 'cliente') {
                const traduzido = await traduzirMotoboyParaCliente(msg.mensagem || '');
                if (!isIgnorar(traduzido)) {
                    const num = String(msg.telefone_cliente || '').replace(/\D/g, '');
                    if (num.length >= 10) {
                        await enviarMensagemWhatsApp('55' + num, traduzido);
                    }
                }

            } else if (msg.tipo === 'sos_abriu') {
                await broadcastLog(
                    'SOS',
                    `O motoboy ${msg.nome_motoboy || msg.telegram_id} acionou o ALARME DE EMERGÊNCIA!`,
                    { telegram_id: String(msg.telegram_id) }
                );

            } else if (msg.tipo === 'sos_msg' || msg.tipo === 'sos') {
                await broadcastLog(
                    'SOS_MSG',
                    String(msg.mensagem || ''),
                    { telegram_id: String(msg.telegram_id) }
                );

            } else if (msg.tipo === 'sos_encerrado') {
                await broadcastLog('SOS_ENCERRADO', '', { telegram_id: String(msg.telegram_id) });

            } else if (msg.tipo === 'baixa') {
                const [pacotesRaw, pedidosRaw] = await Promise.all([getPacotes(), getPedidos()]);
                const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
                const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));

                const pacote = pacotes.find((p: any) => p.id === msg.pacote_id);
                if (!pacote) {
                    hubFetch('/rota/baixa-resposta', {
                        method: 'POST',
                        body: JSON.stringify({ pacote_id: msg.pacote_id, telegram_id: msg.telegram_id, ok: false, error: 'Pacote não encontrado.' })
                    }).catch((e: any) => broadcastLog('HUB', `Falha ao reportar baixa-resposta: ${e.message}`));
                    processadas++;
                    continue;
                }

                const todosPedidos = (pacote.pedidosIds || []).map((id: string) =>
                    pedidos.find((p: any) => p.id === id) ||
                    (pacote.pedidos_snapshot || []).find((p: any) => p.id === id)
                ).filter(Boolean);

                const pedido = todosPedidos.find((p: any) => p.codigo_entrega === msg.codigo);
                if (!pedido) {
                    hubFetch('/rota/baixa-resposta', {
                        method: 'POST',
                        body: JSON.stringify({ pacote_id: msg.pacote_id, telegram_id: msg.telegram_id, ok: false, error: 'Código inválido.' })
                    }).catch((e: any) => broadcastLog('HUB', `Falha ao reportar baixa-resposta: ${e.message}`));
                    processadas++;
                    continue;
                }

                await registrarEntrega(msg.telegram_id, pedido.taxa);
                await inserirHistoricoMotoboy(msg.telegram_id, 'ENTREGA', pedido.taxa || 0, `Entrega Nuvem para ${pedido.nomeCliente || 'Cliente'}`);

                pacote.pedidosIds = (pacote.pedidosIds || []).filter((id: string) => id !== pedido.id);
                if (pacote.pedidos_snapshot) {
                    pacote.pedidos_snapshot = pacote.pedidos_snapshot.filter((p: any) => p.id !== pedido.id);
                }
                const pacoteConcluido = pacote.pedidosIds.length === 0;
                if (pacoteConcluido) {
                    await deletePacote(pacote.id);
                    await atualizarCamposMotoboy(msg.telegram_id, { status: 'ONLINE' });
                } else {
                    await savePacote(pacote);
                }
                await deletePedido(pedido.id);
                await broadcastLog('FINANCEIRO', `Baixa Nuvem confirmada. Taxa de R$${(pedido.taxa || 0).toFixed(2)} faturada.`);
                broadcastMessage(JSON.stringify({ tipo: 'BAIXA_PEDIDO', mensagem: 'Baixa Nuvem', pedidoId: pedido.id, data: new Date().toISOString() }));

                hubFetch('/rota/baixa-resposta', {
                    method: 'POST',
                    body: JSON.stringify({ pacote_id: msg.pacote_id, telegram_id: msg.telegram_id, ok: true, taxa: pedido.taxa, pacote_concluido: pacoteConcluido })
                }).catch((e: any) => broadcastLog('HUB', `Falha ao reportar baixa-resposta ao Hub: ${e.message}`));
            }
            // tipo desconhecido: ignora silenciosamente
            processadas++;
        } catch (e: any) {
            broadcastLog('ERRO', `Erro processando mensagem Nuvem tipo ${msg.tipo}: ${e.message}`).catch(() => {});
        }
    }
    return processadas;
}

export async function startServer() {
    await initDatabase();

    await app.register(cors, { origin: '*', credentials: true });
    await app.register(cookie);
    await app.register(websocket);

    initLogger(app);

    // \u2500\u2500 JWT middleware: protege todas as rotas /api/* \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    app.addHook('onRequest', async (request: any, reply) => {
        const url = request.url.split('?')[0];
        const publicEndpoints = ['/api/profile/public', '/api/frota-compartilhada/disponiveis'];
        if (!url.startsWith('/api/') || publicEndpoints.includes(url)) return;
        const token: string | undefined = request.cookies?.ceia_token;
        if (!token) {
            return reply.code(401).header('Content-Type', 'application/json; charset=utf-8').send({ error: 'N\u00e3o autenticado' });
        }
        try {
            const secret = await getJwtSecret();
            jwt.verify(token, secret);
        } catch {
            reply.clearCookie('ceia_token', { path: '/' });
            return reply.code(401).header('Content-Type', 'application/json; charset=utf-8').send({ error: 'Sess\u00e3o expirada. Fa\u00e7a login novamente.' });
        }
    });

    // \u2500\u2500 Auth endpoints (sem JWT obrigat\u00f3rio) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

    app.get('/auth/setup-needed', async (_request, reply) => {
        const count = await contarUsuarios();
        return reply.send({ needed: count === 0 });
    });

    app.post('/auth/setup', async (request: any, reply) => {
        const count = await contarUsuarios();
        if (count > 0) return reply.code(403).send({ error: 'Setup j\u00e1 foi realizado.' });

        const { whatsapp, senha, telegram_id } = request.body || {};
        if (!whatsapp || !senha) return reply.code(400).send({ error: 'WhatsApp e senha s\u00e3o obrigat\u00f3rios.' });
        if (senha.length < 6) return reply.code(400).send({ error: 'A senha deve ter no m\u00ednimo 6 caracteres.' });

        const hash = await bcrypt.hash(senha, 12);
        await criarUsuario(whatsapp, hash, telegram_id || undefined);

        const secret = await getJwtSecret();
        const token = jwt.sign({ whatsapp }, secret, { expiresIn: '8h' });
        reply.setCookie('ceia_token', token, { httpOnly: true, path: '/', maxAge: 8 * 3600, sameSite: 'lax' });
        return reply.send({ ok: true });
    });

    app.post('/auth/login', async (request: any, reply) => {
        const { whatsapp, senha } = request.body || {};
        if (!whatsapp || !senha) return reply.code(400).send({ error: 'Preencha todos os campos.' });

        const usuario = await getUsuarioPorWhatsapp(whatsapp);
        if (!usuario) return reply.code(401).send({ error: 'Credenciais inv\u00e1lidas.' });

        const valido = await bcrypt.compare(senha, usuario.senha_hash);
        if (!valido) return reply.code(401).send({ error: 'Credenciais inv\u00e1lidas.' });

        const secret = await getJwtSecret();
        const token = jwt.sign({ whatsapp }, secret, { expiresIn: '8h' });
        reply.setCookie('ceia_token', token, { httpOnly: true, path: '/', maxAge: 8 * 3600, sameSite: 'lax' });
        return reply.send({ ok: true });
    });

    app.get('/auth/check', async (request: any, reply) => {
        const token: string | undefined = request.cookies?.ceia_token;
        if (!token) return reply.code(401).send({ ok: false });
        try {
            const secret = await getJwtSecret();
            jwt.verify(token, secret);
            return reply.send({ ok: true });
        } catch {
            reply.clearCookie('ceia_token', { path: '/' });
            return reply.code(401).send({ ok: false });
        }
    });

    app.post('/auth/logout', async (_request, reply) => {
        reply.clearCookie('ceia_token', { path: '/' });
        return reply.send({ ok: true });
    });

    app.post('/api/auth/alterar-senha', async (request: any, reply) => {
        const { senha_atual, nova_senha } = request.body || {};
        if (!senha_atual || !nova_senha) return reply.code(400).send({ error: 'Preencha todos os campos.' });
        if (nova_senha.length < 6) return reply.code(400).send({ error: 'A nova senha deve ter no m\u00ednimo 6 caracteres.' });

        const secret = await getJwtSecret();
        const payload = jwt.verify(request.cookies.ceia_token, secret) as { whatsapp: string };
        const usuario = await getUsuarioPorWhatsapp(payload.whatsapp);

        const valido = await bcrypt.compare(senha_atual, usuario.senha_hash);
        if (!valido) return reply.code(401).send({ error: 'Senha atual incorreta.' });

        await atualizarSenhaUsuario(usuario.id, await bcrypt.hash(nova_senha, 12));
        return reply.send({ ok: true });
    });

    app.get('/api/auth/codigo-recuperacao/status', async (request: any, reply) => {
        try {
            const secret = await getJwtSecret();
            const payload = jwt.verify(request.cookies?.ceia_token, secret) as { whatsapp: string };
            const hash = await getCodigoRecuperacaoHash(payload.whatsapp);
            return reply.send({ tem_codigo: !!hash });
        } catch {
            return reply.code(401).send({ error: 'N\u00e3o autenticado.' });
        }
    });

    app.post('/api/auth/codigo-recuperacao/gerar', async (request: any, reply) => {
        try {
            const secret = await getJwtSecret();
            const payload = jwt.verify(request.cookies?.ceia_token, secret) as { whatsapp: string };
            const { senha_atual } = request.body || {};
            if (!senha_atual) return reply.code(400).send({ error: 'Senha atual \u00e9 obrigat\u00f3ria.' });

            const usuario = await getUsuarioPorWhatsapp(payload.whatsapp);
            const valido = await bcrypt.compare(senha_atual, usuario.senha_hash);
            if (!valido) return reply.code(401).send({ error: 'Senha incorreta.' });

            const codigo = gerarCodigoRecuperacao();
            const codigoSemHifens = codigo.replace(/-/g, '');
            const hash = await bcrypt.hash(codigoSemHifens, 12);
            await atualizarCodigoRecuperacao(payload.whatsapp, hash);
            broadcastLog('SEGURANCA', `Novo código de recuperação gerado para ${payload.whatsapp}.`);
            return reply.send({ codigo });
        } catch {
            return reply.code(401).send({ error: 'N\u00e3o autenticado.' });
        }
    });

    app.post('/api/auth/recuperar-senha', async (request: any, reply) => {
        const { whatsapp, codigo, nova_senha } = request.body || {};
        if (!whatsapp || !codigo || !nova_senha) return reply.code(400).send({ error: 'Preencha todos os campos.' });
        if (nova_senha.length < 6) return reply.code(400).send({ error: 'A nova senha deve ter no m\u00ednimo 6 caracteres.' });

        const usuario = await getUsuarioPorWhatsapp(whatsapp);
        const hashArmazenado = usuario ? await getCodigoRecuperacaoHash(whatsapp) : null;
        const hashParaComparar = hashArmazenado || HASH_PLACEHOLDER;
        const codigoNormalizado = codigo.toUpperCase().trim().replace(/-/g, '');

        const valido = await bcrypt.compare(codigoNormalizado, hashParaComparar);

        if (!usuario || !hashArmazenado || !valido) {
            return reply.code(401).send({ error: 'C\u00f3digo inv\u00e1lido.' });
        }

        await atualizarSenhaUsuario(usuario.id, await bcrypt.hash(nova_senha, 12));
        broadcastLog('SEGURANCA', `Senha redefinida via código de recuperação para ${whatsapp}.`);
        return reply.send({ ok: true });
    });

    // \u2500\u2500 P\u00e1ginas e API \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

    app.get('/', async (request, reply) => {
        const htmlPath = path.join(__dirname, 'index.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        return reply.type('text/html').send(htmlContent);
    });

    app.get('/api/profile/public', async (request, reply) => {
        const config = await getConfiguracoes();
        if (!config) return reply.code(200).type('application/json; charset=utf-8').send({});
        const { nome, documento, endereco, whatsapp, link_cardapio, horarios } = config;
        return reply.code(200).type('application/json; charset=utf-8').send({ nome, documento, endereco, whatsapp, link_cardapio, horarios });
    });

    app.get('/api/profile/admin', async (request, reply) => {
        const config = await getConfiguracoes();
        return reply.code(200).type('application/json; charset=utf-8').send(config || {});
    });

    app.post('/api/profile/admin', async (request: any, reply) => {
        const body = request.body as Record<string, any>;
        const PLACEHOLDER = 'Configurado \u2713';
        const chaveFields = ['google_maps_key', 'openai_key', 'telegram_bot_token'];
        for (const field of chaveFields) {
            if (body[field] === PLACEHOLDER || body[field] === '') {
                body[field] = null;
            }
        }
        await updateConfiguracoes(body);
        await broadcastLog('SUCCESS', 'Configura\u00e7\u00f5es atualizadas via Painel');
        iniciarTelegram();

        // Geocoding autom\u00e1tico do endere\u00e7o
        const config = await getConfiguracoes();
        if (body.endereco && config?.google_maps_key) {
            const enderecoEncoded = encodeURIComponent(body.endereco);
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${enderecoEncoded}&key=${config.google_maps_key}`;
            fetch(geocodeUrl, { signal: AbortSignal.timeout(8000) })
                .then(async (res) => {
                    const data = await res.json() as { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] };
                    console.log('[GEOCODING] status:', data.status, '| results:', data.results?.length ?? 0);
                    if (data.status === 'OK' && data.results?.[0]) {
                        const { lat, lng } = data.results[0].geometry.location;
                        console.log('[GEOCODING] lat:', lat, '| lng:', lng, '| endere\u00e7o:', body.endereco);
                        await updateConfiguracoes({ lat, lng });
                    } else {
                        console.warn('[GEOCODING] Sem resultado para o endere\u00e7o:', body.endereco);
                    }
                })
                .catch(e => console.error('[GEOCODING] Erro no fetch:', e.message));
        }

        return reply.code(200).type('application/json; charset=utf-8').send({ status: 'success' });
    });

    app.get('/api/fleet', async (request, reply) => {
        const frota = await getFleet();
        return reply.code(200).type('application/json; charset=utf-8').send(frota);
    });

    app.delete('/api/fleet/:id', async (request: any, reply) => {
        await deletarMotoboy(request.params.id);
        await broadcastLog('FROTA', 'Perfil de motoboy e hist\u00f3rico exclu\u00eddos.');
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.put('/api/fleet/:id', async (request: any, reply) => {
        const { veiculo, vinculo, nome, whatsapp, pix } = request.body;
        await atualizarMotoboy(request.params.id, veiculo, vinculo, nome, whatsapp, pix);
        await broadcastLog('FROTA', 'Perfil de motoboy atualizado.');
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.get('/api/financeiro/:id', async (request: any, reply) => {
        const extrato = await getExtratoFinanceiro(request.params.id);
        return reply.code(200).type('application/json; charset=utf-8').send(extrato);
    });

    app.post('/api/financeiro/pagar/:id', async (request: any, reply) => {
        const telegram_id = request.params.id;
        const extrato = await getExtratoFinanceiro(telegram_id);
        await zerarAcertoFinanceiro(telegram_id);
        const valorTotal = extrato?.total_geral ?? 0;
        if (valorTotal > 0) {
            await inserirHistoricoMotoboy(telegram_id, 'ACERTO', valorTotal, `Acerto liquidado: ${extrato.qtd} corrida(s)`);
        }
        await broadcastLog('FINANCEIRO', 'Acerto de motoboy liquidado com sucesso.');

        await atualizarCamposMotoboy(telegram_id, { status: 'aguardando_confirmacao' });

        const motoboy = await getMotoboyByTelegramId(telegram_id);
        if (motoboy?.telegram_id) {
            await enviarConfirmacaoPagamento(motoboy.telegram_id, telegram_id, valorTotal);
        }

        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true, aguardando_confirmacao: true });
    });

    app.get('/api/historico/:telegram_id', async (request: any, reply) => {
        const historico = await getHistoricoMotoboy(request.params.telegram_id);
        return reply.code(200).type('application/json; charset=utf-8').send(historico);
    });

    app.post('/api/nuvem/receber-convite', async (request: any, reply) => {
        const { telegram_id, loja_destino_nome, link_bot_destino, taxa_estimada } = request.body;
        const frota = await getFleet();
        const motoboy = frota.find((m: any) => m.telegram_id === telegram_id);

        if (!motoboy) {
            return reply.code(404).type('application/json; charset=utf-8').send({ error: 'Motoboy n\u00e3o encontrado na base local.' });
        }

        await repassarConviteNuvem(telegram_id, { loja_destino_nome, link_bot_destino, taxa_estimada });
        await broadcastLog('NUVEM', `Convite da loja ${loja_destino_nome} repassado para ${motoboy.nome}.`);
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/operacao/despachar', async (request: any, reply) => {
        const { pacoteId, motoboy, pedidos } = request.body;

        const config = await getConfiguracoes();

        // Resumo via IA é opcional — se não tiver key ou a API falhar, usa endereços diretos
        let resumoBairros = pedidos.map((p: any) => p.endereco).join(', ').slice(0, 80);
        if (config.openai_key) {
            try {
                const allEnderecos = pedidos.map((p: any) => p.endereco).join('\n');
                const resOpenAI = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openai_key}` },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'user', content: `Resuma os bairros destes endereços em no máximo 4 palavras:\n\n${allEnderecos}` }],
                        max_tokens: 20
                    })
                });
                if (resOpenAI.ok) {
                    const data = await resOpenAI.json();
                    resumoBairros = data.choices[0].message.content.trim();
                }
            } catch (e) {
                console.error('FALHA NA OPENAI (usando endereços diretos):', e);
            }
        }

        const totalTaxa = pedidos.reduce((acc: number, p: any) => acc + (p.taxa || 0), 0);
        const msgMotoboy = `\ud83d\ude80 *NOVA ROTA DE ENTREGA!*\\
\\
*Setor:* ${resumoBairros}\\
*Qtd:* ${pedidos.length} entregas\\
*Total a Faturar:* R$ ${totalTaxa.toFixed(2)}`;

        try {
            for (const pedido of pedidos) {
                if (pedido?.id) await savePedido(pedido);
            }
            const pacotesRaw = await getPacotes();
            const pacotesDb = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
            const pacoteParaSalvar = pacotesDb.find((p: any) => p.id === pacoteId);
            if (pacoteParaSalvar) {
                pacoteParaSalvar.status = 'PENDENTE_ACEITE';
                pacoteParaSalvar.motoboy = motoboy;
                pacoteParaSalvar.pedidos_snapshot = pedidos.filter((p: any) => p?.id);
                await savePacote(pacoteParaSalvar);
            }
        } catch (e) {
            console.error('[DESPACHAR] Falha ao persistir pacote/pedidos no banco:', e);
        }

        await enviarConviteRotaTelegram(motoboy.telegram_id, msgMotoboy, pacoteId);
        await broadcastLog('SISTEMA', `Convite de rota enviado para ${motoboy.nome}. Aguardando aceite do motoboy.`);
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    // \u2500\u2500 Despacho presencial via QR Code \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

    app.post('/api/operacao/gerar-qr', async (request: any, reply) => {
        const { pacoteId, motoboy } = request.body || {};
        if (!pacoteId || !motoboy) return reply.code(400).send({ error: 'pacoteId e motoboy s\u00e3o obrigat\u00f3rios.' });

        const token = crypto.randomUUID();
        dispatchTokens.set(token, { pacoteId, motoboy, expiresAt: Date.now() + 30 * 60 * 1000 });

        const host = request.headers['x-forwarded-host'] || request.headers.host;
        const proto = request.headers['x-forwarded-proto'] || 'http';
        const url = `${proto}://${host}/rota/${token}`;
        const qrBase64 = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });

        return reply.send({ token, url, qrBase64 });
    });

    app.get('/rota/:token', async (request: any, reply) => {
        const dispatch = dispatchTokens.get(request.params.token);
        if (!dispatch || dispatch.expiresAt < Date.now()) {
            return reply.type('text/html; charset=utf-8').send(`<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Link expirado</title><style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f1f5f9}h2{color:#ef4444}p{color:#64748b}</style></head><body><h2>\u274c Link expirado</h2><p>Este convite n\u00e3o \u00e9 mais v\u00e1lido.<br>Pe\u00e7a um novo QR Code ao operador.</p></body></html>`);
        }

        const [pacotesRaw, pedidosRaw] = await Promise.all([getPacotes(), getPedidos()]);
        const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
        const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));
        const pacote = pacotes.find((p: any) => p.id === dispatch.pacoteId);
        if (!pacote) return reply.type('text/html; charset=utf-8').send('<html><body><h2>Pacote n\u00e3o encontrado.</h2></body></html>');

        const stops = (pacote.pedidosIds || []).map((id: string) => pedidos.find((p: any) => p.id === id)).filter(Boolean);
        const totalTaxa = stops.reduce((acc: number, p: any) => acc + (p.taxa || 0), 0);

        const listaHTML = stops.map((p: any, i: number) => {
            const enc = encodeURIComponent(p.endereco);
            return `<div class=\"stop\"><div class=\"stop-num\">${i + 1}</div><div class=\"stop-info\"><div class=\"stop-cliente\">${p.nomeCliente || p.cliente_nome || 'Cliente'}</div><div class=\"stop-end\">${p.endereco}</div><div class=\"stop-links\"><a href=\"https://waze.com/ul?q=${enc}\" class=\"link-waze\">\ud83d\uddfa Waze</a><a href=\"https://maps.google.com/?q=${enc}\" class=\"link-maps\">\ud83d\udccd Maps</a></div></div></div>`;
        }).join('');

        const html = `<!DOCTYPE html>
<html lang=\"pt-BR\">
<head>
<meta charset=\"UTF-8\">
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0,maximum-scale=1.0\">
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
<div class=\"card\" id=\"main\">
  <div class=\"header\">
    <div class=\"title\">\ud83d\udef5 Nova Rota!</div>
    <div class=\"subtitle\">Ol\u00e1, ${dispatch.motoboy.nome.split(' ')[0]}. Confira as entregas abaixo.</div>
  </div>
  <div class=\"stats\">
    <div class=\"stat\"><div class=\"stat-v\">${stops.length}</div><div class=\"stat-l\">Paradas</div></div>
    <div class=\"stat\"><div class=\"stat-v\">R$ ${totalTaxa.toFixed(2)}</div><div class=\"stat-l\">A faturar</div></div>
  </div>
  ${listaHTML}
  <button id=\"btn-aceitar\" onclick=\"aceitar()\">\u2705 ACEITAR ROTA</button>
</div>
<script>
async function aceitar(){
  const btn=document.getElementById('btn-aceitar');
  btn.disabled=true; btn.textContent='Confirmando...';
  try{
    const res=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aceitar:true})});
    const data=await res.json();
    if(res.ok&&data.ok){
      document.getElementById('main').innerHTML='<div class=\"success\"><div class=\"success-icon\">\u2705</div><div class=\"success-msg\">Rota aceita!</div><div class=\"success-sub\">Boa entrega! \ud83c\udfc1</div></div>';
    } else {
      btn.disabled=false; btn.textContent='\u2705 ACEITAR ROTA';
      alert(data.error||'Erro ao aceitar. Tente novamente.');
    }
  } catch(e){
    btn.disabled=false; btn.textContent='\u2705 ACEITAR ROTA';
    alert('Falha de conex\u00e3o. Verifique sua internet.');
  }
}
</script>
</body>
</html>`;
        return reply.type('text/html; charset=utf-8').send(html);
    });

    app.post('/rota/:token', async (request: any, reply) => {
        const dispatch = dispatchTokens.get(request.params.token);
        if (!dispatch || dispatch.expiresAt < Date.now()) {
            return reply.code(410).send({ error: 'Link expirado. Pe\u00e7a um novo QR Code ao operador.' });
        }

        const { pacoteId, motoboy } = dispatch;
        dispatchTokens.delete(request.params.token);

        const [pacotesRaw, pedidosRaw] = await Promise.all([getPacotes(), getPedidos()]);
        const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
        const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));
        const pacote = pacotes.find((p: any) => p.id === pacoteId);
        if (!pacote) return reply.code(404).send({ error: 'Pacote n\u00e3o encontrado.' });

        pacote.motoboy = motoboy;
        pacote.status = 'EM_ROTA';
        await savePacote(pacote);

        for (const pId of pacote.pedidosIds || []) {
            const p = pedidos.find((ped: any) => ped.id === pId);
            const tel = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
            if (p && tel) {
                const num = tel.replace(/\D/g, '');
                if (num.length >= 10) {
                    await enviarMensagemWhatsApp(`55${num}`, `Ol\u00e1, ${(p.nomeCliente || 'cliente').split(' ')[0]}! Seu pedido saiu para entrega com ${motoboy.nome.split(' ')[0]}. \ud83d\udef5\ud83d\udca8`);
                }
            }
        }

        broadcastLog('ACEITE_ROTA', `${motoboy.nome.split(' ')[0]} aceitou a rota via QR! Rota em andamento.`, { pacoteId });
        return reply.send({ ok: true });
    });

    app.post('/api/operacao/sos/reply', async (request: any, reply) => {
        const { telegram_id, texto } = request.body;
        if (!telegram_id) return reply.code(400).send({ error: 'telegram_id obrigatório.' });

        const motoboy = await getMotoboyByTelegramId(telegram_id);
        if (motoboy?.vinculo === 'Nuvem') {
            try {
                await hubFetch('/rota/sos-reply', {
                    method: 'POST',
                    body: JSON.stringify({ telegram_id, texto }),
                });
            } catch (e: any) {
                return reply.code(502).send({ ok: false, error: e.message || 'Falha ao enviar via Hub.' });
            }
        } else {
            await enviarMensagemTelegram(telegram_id, texto);
        }
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/operacao/sos/encerrar', async (request: any, reply) => {
        const { telegram_id } = request.body;
        if (telegram_id) {
            const motoboy = await getMotoboyByTelegramId(telegram_id);
            if (motoboy?.vinculo === 'Nuvem') {
                try {
                    await hubFetch('/rota/sos-reply', {
                        method: 'POST',
                        body: JSON.stringify({ telegram_id, encerrar: true }),
                    });
                } catch (e: any) {
                    console.error('[SOS] Falha ao encerrar via Hub:', e?.message);
                }
            } else {
                await enviarMensagemTelegram(telegram_id, '✅ Emergência encerrada pela base. Pode continuar operando normalmente.');
            }
        }
        await broadcastLog('SOS_ENCERRADO', '', { telegram_id: telegram_id || '' });
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/operacao/chat-motoboy', async (request: any, reply) => {
        const { telegram_id, nome } = request.body || {};
        if (!telegram_id) return reply.code(400).send({ error: 'telegram_id é obrigatório.' });
        await iniciarChatOperador(telegram_id, nome || 'Motoboy');
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/sac/iniciar', async (request: any, reply) => {
        const { jid, nome } = request.body || {};
        if (!jid) return reply.code(400).send({ error: 'jid é obrigatório.' });
        setClienteSAC(jid, true, nome);
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/sac/encerrar', async (request: any, reply) => {
        const { jid } = request.body || {};
        if (jid) setClienteSAC(jid, false);
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/sac/reply', async (request: any, reply) => {
        const { jid, texto } = request.body;
        if (jid) setClienteSAC(jid, true); // idempotente — defesa se /iniciar foi pulado
        const sucesso = await enviarMensagemWhatsApp(jid, texto, 'SISTEMA', 'atendimento_humano', 'Atendente');
        if (sucesso) return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
        return reply.code(500).type('application/json; charset=utf-8').send({ error: 'Falha no envio da mensagem via WhatsApp.' });
    });

    app.post('/api/operacao/coletar', async (request: any, reply) => {
        const { pacoteId } = request.body || {};
        if (!pacoteId) return reply.code(400).send({ error: 'pacoteId \u00e9 obrigat\u00f3rio.' });

        const pacotesRaw = await getPacotes();
        const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
        const pacote = pacotes.find((p: any) => p.id === pacoteId);
        if (!pacote) return reply.code(404).send({ error: 'Pacote n\u00e3o encontrado.' });

        pacote.coletado = true;
        await savePacote(pacote);

        if (pacote.motoboy?.telegram_id) {
            await enviarMensagemTelegram(pacote.motoboy.telegram_id, '\u2705 *Coleta confirmada pela loja!* Os pacotes est\u00e3o com voc\u00ea. Boa rota!');
        }

        const pedidosRaw = await getPedidos();
        const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));
        for (const pId of pacote.pedidosIds || []) {
            const p = pedidos.find((ped: any) => ped.id === pId);
            const telefoneCliente = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
            if (p && telefoneCliente) {
                const num = telefoneCliente.replace(/\D/g, '');
                if (num.length >= 10) {
                    const nomeSplit = p.nomeCliente ? p.nomeCliente.split(' ')[0] : 'cliente';
                    const msgCliente = `Ol\u00e1, ${nomeSplit}! O seu pedido acabou de sair para entrega com o parceiro *${pacote.motoboy.nome}*. \ud83d\udef5\ud83d\udca8\\
\\
\u26a0\ufe0f *Aten\u00e7\u00e3o:* Para a seguran\u00e7a da sua entrega, informe o c\u00f3digo *${p.codigo_entrega}* ao motoboy quando ele chegar.`;
                    await enviarMensagemWhatsApp('55' + num, msgCliente);
                }
            }
        }

        await broadcastLog('OPERACAO', `Coleta confirmada para o pacote ${pacoteId}.`);
        return reply.send({ ok: true });
    });

    app.post('/api/operacao/baixa', async (request: any, reply) => {
        const { pedidoId } = request.body;

        const pacotesRaw = await getPacotes();
        const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
        const pedidosRaw = await getPedidos();
        const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));

        let rotaInfo: any = null;
        const pacotesAtivos = pacotes.filter((p: any) => p.status === 'PENDENTE_ACEITE' || p.status === 'EM_ROTA');

        findRota:
        for (const pacote of pacotesAtivos) {
            for (const pId of pacote.pedidosIds) {
                if (String(pId) === String(pedidoId)) {
                    const pedido = pedidos.find((p: any) => String(p.id) === String(pedidoId))
                        || (pacote.pedidos_snapshot || []).find((p: any) => String(p.id) === String(pedidoId));
                    if (pedido && pacote.motoboy) {
                        rotaInfo = { telegram_id: pacote.motoboy.telegram_id, pedido, pacote };
                        break findRota;
                    }
                }
            }
        }

        if (rotaInfo) {
            await registrarEntrega(rotaInfo.telegram_id, rotaInfo.pedido.taxa);
            const nomeCliente = rotaInfo.pedido.nomeCliente || 'Cliente';
            await inserirHistoricoMotoboy(rotaInfo.telegram_id, 'ENTREGA', rotaInfo.pedido.taxa || 0, `Entrega para ${nomeCliente}`);
            await broadcastLog('FINANCEIRO', `Baixa manual conclu\u00edda. Taxa de R$${(rotaInfo.pedido.taxa || 0).toFixed(2)} faturada.`);

            if (rotaInfo.pacote) {
                const pac = rotaInfo.pacote;
                if (pac.pedidos_snapshot) {
                    pac.pedidos_snapshot = pac.pedidos_snapshot.filter((p: any) => String(p.id) !== String(pedidoId));
                }
                pac.pedidosIds = (pac.pedidosIds || []).filter((id: string) => String(id) !== String(pedidoId));
                if (pac.pedidosIds.length === 0) {
                    await deletePacote(pac.id);
                    await atualizarCamposMotoboy(rotaInfo.telegram_id, { status: 'ONLINE' });
                } else {
                    await savePacote(pac);
                }
            }
            await deletePedido(pedidoId);
        }
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.get('/api/whatsapp/start', async (request, reply) => {
        await iniciarWhatsApp();
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.get('/api/whatsapp/status', async (request, reply) => {
        return reply.code(200).type('application/json; charset=utf-8').send({ status: sessionStatus, qr: qrCodeBase64 });
    });

    app.post('/api/whatsapp/trocar-numero', async (_request, reply) => {
        await trocarNumeroWhatsApp();
        await broadcastLog('WHATSAPP', 'Sessão encerrada e arquivos limpos. Leia o QR Code para parear um novo número.');
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/whatsapp/send', async (request: any, reply) => {
        const { numero, texto } = request.body;
        const sucesso = await enviarMensagemWhatsApp(numero, texto);
        if (sucesso) return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
        return reply.code(500).type('application/json; charset=utf-8').send({ error: 'Falha no disparo via API' });
    });


    app.get('/api/pedidos', async (req, reply) => {
        const pedidos = await getPedidos();
        return reply.send(pedidos.map((p: any) => JSON.parse(p.dados_json)));
    });

    app.post('/api/pedidos', async (req: any, reply) => {
        await clearPedidos();
        for (const pedido of req.body) await savePedido(pedido);
        return reply.send({ ok: true });
    });

    app.delete('/api/pedidos/:id', async (req: any, reply) => {
        await deletePedido(req.params.id);
        return reply.send({ ok: true });
    });

    app.get('/api/pacotes', async (req, reply) => {
        const pacotes = await getPacotes();
        return reply.send(pacotes.map((p: any) => JSON.parse(p.dados_json)));
    });

    app.post('/api/pacotes', async (req: any, reply) => {
        await clearPacotes();
        for (const pacote of req.body) await savePacote(pacote);
        return reply.send({ ok: true });
    });

    app.delete('/api/pacotes/:id', async (req: any, reply) => {
        await deletePacote(req.params.id);
        return reply.send({ ok: true });
    });

    app.get('/api/zonas', async (req, reply) => {
        const zonas = await getZonas();
        return reply.send(zonas.map((z: any) => JSON.parse(z.dados_json)));
    });

    app.post('/api/zonas', async (req: any, reply) => {
        await clearZonas();
        for (const zona of req.body) await saveZona(zona);
        return reply.send({ ok: true });
    });

    app.delete('/api/zonas/:id', async (req: any, reply) => {
        await deleteZona(req.params.id);
        return reply.send({ ok: true });
    });

    app.get('/api/parceiros', async (_request, reply) => {
        const parceiros = await getNosParceiros();
        return reply.send(parceiros);
    });

    app.post('/api/parceiros', async (request: any, reply) => {
        const { nome, url } = request.body || {};
        if (!nome || !url) return reply.code(400).send({ error: 'Nome e URL s\u00e3o obrigat\u00f3rios.' });
        const id = crypto.randomUUID();
        await saveNoParceiro(id, nome.trim(), url.trim().replace(/\/$/, ''));
        return reply.send({ ok: true, id });
    });

    app.delete('/api/parceiros/:id', async (request: any, reply) => {
        await deleteNoParceiro(request.params.id);
        return reply.send({ ok: true });
    });

    app.get('/api/frota-compartilhada/disponiveis', async (_request, reply) => {
        const config = await getConfiguracoes();
        const agora = new Date();
        const diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const diaKey = diasSemana[agora.getDay()];
        const horaAtual = agora.getHours() * 60 + agora.getMinutes();

        let dentrDoExpediente = false;
        if (config?.horarios) {
            const dia = config.horarios[diaKey];
            if (dia?.ativo && dia.abre && dia.fecha) {
                const [ah, am] = dia.abre.split(':').map(Number);
                const [fh, fm] = dia.fecha.split(':').map(Number);
                const abre = ah * 60 + am;
                const fecha = fh * 60 + fm;
                
                // CORRE\u00c7\u00c3O (BUG 5): Tratamento correto de expediente que vira a noite
                if (abre <= fecha) {
                    dentrDoExpediente = horaAtual >= abre && horaAtual < fecha;
                } else {
                    dentrDoExpediente = horaAtual >= abre || horaAtual < fecha;
                }
            }
        }

        if (dentrDoExpediente) return reply.send([]);

        const motoboys = await getMotoboysOnline();
        const disponiveis = motoboys
            .filter((m: any) => m.status === 'ONLINE' && m.lat && m.lng)
            .map((m: any) => ({
                telegram_id: m.telegram_id,
                nome: m.nome,
                veiculo: m.veiculo,
                lat: m.lat,
                lng: m.lng
            }));

        return reply.send(disponiveis);
    });

    app.get('/api/frota-compartilhada/buscar', async (_request, reply) => {
        const config = await getConfiguracoes();

        console.log('[BUSCAR] lat:', config?.lat, 'lng:', config?.lng);

        if ((!config?.lat || !config?.lng) && config?.google_maps_key && config?.endereco) {
            try {
                const geoRes = await fetch(
                    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(config.endereco)}&key=${config.google_maps_key}`
                );
                const geoData = await geoRes.json() as { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] };
                if (geoData.status === 'OK') {
                    const { lat, lng } = geoData.results[0].geometry.location;
                    await updateConfiguracoes({ lat, lng });
                    config.lat = lat;
                    config.lng = lng;
                    console.log('[GEOCODING] Coordenadas obtidas:', lat, lng);
                }
            } catch (e: any) {
                console.error('[GEOCODING] Erro:', e.message);
            }
        }

        try {
            const lojaLat = config?.lat;
            const lojaLng = config?.lng;
            console.log('[BUSCAR NUVEM] lat:', lojaLat, 'lng:', lojaLng);
            const { data: resultados } = await hubFetch(`/buscar?lat=${lojaLat || 0}&lng=${lojaLng || 0}`);
            return reply.send(resultados);
        } catch (e) {
            console.error('[FROTA COMPARTILHADA] Hub Central inacess\u00edvel:', e);
            return reply.code(502).send({ error: 'Hub Central inacess\u00edvel.' });
        }
    });

    app.post('/api/frota-compartilhada/convidar', async (request: any, reply) => {
        const { telegram_id, no_url, no_nome, pacoteId, pedidos, taxa_deslocamento_brl, distancia_km, nome } = request.body || {};
        if (!telegram_id || !no_url) return reply.code(400).send({ error: 'telegram_id e no_url s\u00e3o obrigat\u00f3rios.' });

        const motoboyLocal = await getMotoboyByTelegramId(telegram_id);
        if (motoboyLocal && (motoboyLocal.status === 'EM_ROTA' || motoboyLocal.pagamento_pendente === 1)) {
            return reply.code(409).send({ error: 'Motoboy indispon\u00edvel: em rota ou com pagamento pendente.' });
        }

        const config = await getConfiguracoes();
        const loja_nome = config?.nome || 'Loja Parceira';

        const taxa_entrega = (pedidos || []).reduce((acc: number, p: any) => acc + (p.taxa || 0), 0);
        const taxa_desl = taxa_deslocamento_brl || 0;
        const valor_total = taxa_desl + taxa_entrega;

        if (no_url === 'GLOBAL') {
            await upsertFleet({ telegram_id, nome: nome || telegram_id, vinculo: 'Nuvem', status: 'ONLINE', no_url: 'GLOBAL', no_nome: no_nome || nome || telegram_id, taxa_deslocamento: taxa_desl, distancia_km: distancia_km || 0 });
            await broadcastLog('FROTA', `Parceiro Global ${nome || telegram_id} adicionado provisoriamente \u00e0 frota.`);

            if (pacoteId) {
                const pacotesRaw = await getPacotes();
                const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
                const pacote = pacotes.find((p: any) => p.id === pacoteId);
                if (pacote) {
                    pacote.taxa_deslocamento = taxa_desl;
                    pacote.deslocamento_pago = false;
                    await savePacote(pacote);
                }
            }
        }

        try {
            await hubFetch('/rota/criar', {
                method: 'POST',
                body: JSON.stringify({
                    pacote_id: pacoteId,
                    telegram_id,
                    loja_nome,
                    pedidos: pedidos || [],
                    taxa_entrega,
                    taxa_deslocamento: taxa_desl,
                })
            });
            await broadcastLog('FROTA_COMPARTILHADA', `Convite enviado via Hub para motoboy ${telegram_id}`);
            return reply.send({ ok: true, pacote_id: pacoteId });
        } catch (e: any) {
            return reply.code(502).send({ error: e.message || 'Falha ao registrar rota no Hub.' });
        }
    });

    app.get('/api/frota-compartilhada/status-convite', async (request: any, reply) => {
        const { pacote_id } = request.query || {};
        if (!pacote_id) return reply.code(400).send({ error: 'pacote_id \u00e9 obrigat\u00f3rio.' });
        try {
            const { data } = await hubFetch(`/rota/status?pacote_id=${encodeURIComponent(pacote_id)}`);
            return reply.send(data);
        } catch (e: any) {
            return reply.code(502).send({ error: e.message || 'Falha ao consultar status no Hub.' });
        }
    });

    app.get('/api/frota-compartilhada/mensagens-pendentes', async (request: any, reply) => {
        const { pacote_id } = request.query || {};
        if (!pacote_id) return reply.code(400).send({ error: 'pacote_id \u00e9 obrigat\u00f3rio.' });

        let hubData: any;
        try {
            const { data } = await hubFetch(`/rota/mensagens-pendentes?pacote_id=${encodeURIComponent(pacote_id)}`);
            hubData = data;
        } catch (e: any) {
            return reply.code(502).send({ ok: false, error: e.message || 'Falha ao buscar mensagens no Hub.' });
        }

        const processadas = await processarMensagensNuvem(hubData?.mensagens || []);
        return reply.send({ ok: true, processadas });
    });

    app.register(async (instance) => {
        instance.get('/ws/logs', { websocket: true }, (connection) => {
            connection.send(JSON.stringify({ tipo: 'SYSTEM', mensagem: 'Conectado ao terminal de Logs.', data: new Date().toISOString() }));
        });
    });

    const checkInactiveDrivers = async () => {
        try {
            const derrubados = await limparRadarInativo();
            if (derrubados > 0) {
                await broadcastLog('FROTA', `Radar: ${derrubados} motoboy(s) ficaram OFFLINE por perda de sinal GPS.`);
            }
        } catch (e) {
            console.error('Erro ao verificar motoboys inativos:', e);
        } finally {
            setTimeout(checkInactiveDrivers, 60000);
        }
    };

    setTimeout(checkInactiveDrivers, 60000);

    setInterval(async () => {
        try {
            console.log('[HUB SYNC] Ciclo executando \u00e0s:', new Date().toLocaleTimeString('pt-BR'));
            const config = await getConfiguracoes();
            const agora = new Date();
            const diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
            const diaKey = diasSemana[agora.getDay()];
            const horaAtual = agora.getHours() * 60 + agora.getMinutes();

            let dentroDoExpediente = false;
            if (config?.horarios) {
                const dia = config.horarios[diaKey];
                if (dia?.ativo && dia.abre && dia.fecha) {
                    const [ah, am] = dia.abre.split(':').map(Number);
                    const [fh, fm] = dia.fecha.split(':').map(Number);
                    const abre = ah * 60 + am;
                    const fecha = fh * 60 + fm;
                    
                    // CORRE\u00c7\u00c3O (BUG 5): Tratamento correto de expediente que vira a noite
                    if (abre <= fecha) {
                        dentroDoExpediente = horaAtual >= abre && horaAtual < fecha;
                    } else {
                        dentroDoExpediente = horaAtual >= abre || horaAtual < fecha;
                    }
                }
            }

            const motoboys = await getMotoboysOnline();
            const online = motoboys.filter((m: any) =>
                m.status === 'ONLINE' && m.lat && m.lng &&
                (m.vinculo === 'Nuvem' || !dentroDoExpediente)
            );
            console.log('[HUB SYNC] dentroDoExpediente:', dentroDoExpediente,
                '| online no radar:', motoboys.length,
                '| passaram no filtro:', online.length,
                '|', online.map((m: any) => `${m.nome}(${m.vinculo})`).join(', ') || 'nenhum');
            const noUrl = config?.url_publica || LOJA_URL;
            console.log('[HUB SYNC] noUrl:', noUrl, '| HUB_URL:', HUB_URL);
            if (!noUrl || online.length === 0) return;

            for (const m of online) {
                hubFetch('/sync', {
                    method: 'POST',
                    body: JSON.stringify({ telegram_id: m.telegram_id, nome: m.nome, lat: m.lat, lng: m.lng, no_url: noUrl, no_nome: config?.nome || 'Loja Parceira' }),
                }).then(() => {
                    console.log(`[HUB SYNC] Sucesso! ${m.nome} atualizado na Nuvem.`);
                }).catch(e => console.error('[HUB SYNC] Falha de rede:', e.message));
            }
        } catch (e) {
            console.error('[HUB SYNC] Erro no intervalo de sincroniza\u00e7\u00e3o:', e);
        }
    }, 2 * 60 * 1000);

    app.get('/api/gerar-token-bot', async (_request, reply) => {
        const token = await gerarTokenCadastro();
        return reply.send({ token });
    });

    setInterval(async () => {
        try {
            await limparParceirosNuvemExpirados();
        } catch (e) {
            console.error('[LIMPEZA NUVEM] Erro na limpeza hor\u00e1ria:', e);
        }
    }, 60 * 60 * 1000);

    // Drenagem periódica da fila de mensagens da Frota Nuvem.
    // Substitui o polling que seria feito pelo frontend — sem mexer em HTML.
    setInterval(async () => {
        try {
            const pacotesRaw = await getPacotes();
            const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
            for (const pac of pacotes) {
                if (!pac?.id) continue;
                try {
                    const { data } = await hubFetch(`/rota/mensagens-pendentes?pacote_id=${encodeURIComponent(pac.id)}`);
                    const msgs: any[] = data?.mensagens || [];
                    if (msgs.length) await processarMensagensNuvem(msgs);
                } catch (_) { /* silencia erros pontuais por pacote */ }
            }
        } catch (e: any) {
            console.error('[NUVEM DRAIN] erro no ciclo:', e?.message || e);
        }
    }, 4000);

    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('\ud83d\ude80 SERVIDOR CEIA NO AR: Aceda a http://localhost:3000 no navegador');
    console.log('\u2705 Tudo pronto e operando!');

    iniciarTelegram();
}
