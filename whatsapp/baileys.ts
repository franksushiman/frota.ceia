import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadMediaMessage, fetchLatestBaileysVersion, proto, WASocket, jidNormalizedUser } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import OpenAI, { toFile } from 'openai';
import fs from 'fs';

import { getConfiguracoes, getMotoboysOnline, getPedidos, getPacotes, getFleet, getMotoboyByTelegramId, atualizarCamposMotoboy } from '../database';
import { getRotaPeloCliente } from '../operacao';
import { broadcastLog } from '../logger';
import { WhatsAppProvider, ProviderState } from './types';
import { enviarMensagemTelegram } from '../telegramBot';

// Rastreia o último motoboy Nuvem que atendeu cada cliente (jid → telegram_id)
const ultimoNuvemPorCliente = new Map<string, string>();

interface ChatContext {
    telegramId: string;
    motoboyName: string;
    lastMotoboyMessage: string;
    timestamp: number;
}

interface CustomerSession {
    mode: 'BOT' | 'HUMAN';
    timeout: NodeJS.Timeout;
}

interface ContextoPedido {
    texto: string;
    nomeMotoboy: string;
    localizacao: string;
    fraseETA: string;
    status: 'AGUARDANDO' | 'PENDENTE_ACEITE' | 'EM_ROTA';
    respostaDireta?: string;
}

export class BaileysProvider implements WhatsAppProvider {
    private sock: WASocket | null = null;
    private status: string = 'DISCONNECTED';
    private state: ProviderState | null = null;
    private destroyed = false;
    private contextCache = new Map<string, ChatContext>();
    private lidToPhone = new Map<string, string>();
    private customerSessionCache = new Map<string, CustomerSession>();

    isConnected(): boolean {
        return this.status === 'CONNECTED';
    }

    async disconnect(): Promise<void> {
        this.destroyed = true;
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
                this.sock.end(undefined);
            } catch (_) {}
            this.sock = null;
        }
        this.status = 'DISCONNECTED';
        this.state?.setStatus('DISCONNECTED');
        this.state?.setQr(null);
    }

    async connect(state: ProviderState): Promise<void> {
        if (this.destroyed) return;

        this.state = state;
        this.status = 'CONNECTING';
        state.setStatus('CONNECTING');
        state.setQr(null);
        broadcastLog('WHATSAPP', 'Iniciando conexão nativa com Baileys...');

        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
                this.sock.end(undefined);
            } catch (_) {}
            this.sock = null;
        }

        const { state: authState, saveCreds } = await useMultiFileAuthState(process.env.AUTH_PATH || 'auth_info_baileys');
        const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1017531287];
        const { version } = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise<{ version: [number, number, number] }>(resolve =>
                setTimeout(() => resolve({ version: FALLBACK_VERSION }), 5000)
            )
        ]);

        this.sock = makeWASocket({
            auth: authState,
            version,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            getMessage: async () => undefined
        });

        this.sock.ev.on('creds.update', saveCreds);

        const mapearContato = (contact: any) => {
            if (contact.lid && contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                const lid = contact.lid.split('@')[0];
                const phone = contact.id.split('@')[0].replace(/\D/g, '');
                if (lid && phone) this.lidToPhone.set(lid, phone);
            }
        };
        this.sock.ev.on('contacts.upsert', (contacts: any[]) => contacts.forEach(mapearContato));
        this.sock.ev.on('contacts.update', (updates: any[]) => updates.forEach(mapearContato));

        this.sock.ev.on('connection.update', async (update) => {
            if (this.destroyed) return;
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    const qrBase64 = await QRCode.toDataURL(qr);
                    state.setQr(qrBase64);
                    broadcastLog('WHATSAPP', 'Novo QR Code gerado. Aguardando leitura na tela...');
                } catch (e) {
                    console.error('Erro ao gerar imagem do QR Code:', e);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                broadcastLog('WHATSAPP', `Conexão fechada. Motivo: ${lastDisconnect?.error?.message}. Reconectando: ${shouldReconnect}`);
                if (shouldReconnect && !this.destroyed) {
                    setTimeout(() => { if (!this.destroyed) this.connect(state); }, 3000);
                } else if (!shouldReconnect) {
                    this.status = 'DISCONNECTED';
                    state.setStatus('DISCONNECTED');
                    state.setQr(null);
                    fs.rmSync(process.env.AUTH_PATH || 'auth_info_baileys', { recursive: true, force: true });
                    broadcastLog('WHATSAPP', 'Sessão encerrada. Será necessário ler o QR Code novamente.');
                }
            } else if (connection === 'open') {
                this.status = 'CONNECTED';
                state.setStatus('CONNECTED');
                state.setQr(null);
                broadcastLog('WHATSAPP', 'WhatsApp conectado e operante! 🟢');
            }
        });

        this.sock.ev.on('messages.upsert', async (m: any) => {
            if (m.type !== 'notify') return;
            const msg = m.messages[0];
            const numeroCliente = msg.key.remoteJid;

            if (!msg.message || msg.key.fromMe || !numeroCliente || numeroCliente.endsWith('@g.us') || numeroCliente.endsWith('@broadcast') || numeroCliente.endsWith('@newsletter')) return;

            const configKS = await getConfiguracoes();
            if (configKS.whatsapp_ativo === false || configKS.whatsapp_ativo === 0) return;

            const numeroNormalizado = this.normalizePhone(numeroCliente);
            await this.sock!.readMessages([msg.key]);

            const isAudio = !!(msg.message.audioMessage || msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage);
            const location = msg.message.locationMessage;
            let mensagemTexto = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';

            if (isAudio && !mensagemTexto) {
                try {
                    const config = await getConfiguracoes();
                    if (!config.openai_key) throw new Error('OpenAI Key não configurada para transcrição.');
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: undefined });
                    const file = await toFile(buffer as Buffer, 'audio.ogg', { type: 'audio/ogg' });
                    const openai = new OpenAI({ apiKey: config.openai_key });
                    const transcription = await openai.audio.transcriptions.create({ file, model: 'whisper-1' });
                    mensagemTexto = transcription.text || '';
                } catch (err) { console.error('Erro na transcrição:', err); }
            }

            if (!mensagemTexto && !location) return;

            const jidAlt = (msg.key as any).remoteJidAlt;
            const participant = (msg as any).participant;
            const candidatoJid = (jidAlt && !jidAlt.includes('@lid')) ? jidAlt
                               : (participant && !participant.includes('@lid')) ? participant
                               : null;
            const jidParaBusca = candidatoJid ?? numeroCliente;
            const numeroExibicao = jidParaBusca.split('@')[0];

            broadcastLog('WHATSAPP', `Recebido de [${numeroExibicao}]: ${mensagemTexto || 'Localização'}`);

            if (mensagemTexto) {
                const notaStr = mensagemTexto.trim();
                const nota = parseInt(notaStr, 10);
                if (!isNaN(nota) && nota >= 1 && nota <= 10 && notaStr === String(nota)) {
                    const motoboyNuvemId = ultimoNuvemPorCliente.get(jidParaBusca);
                    if (motoboyNuvemId) {
                        const motoboyAvaliado = await getMotoboyByTelegramId(motoboyNuvemId);
                        if (motoboyAvaliado?.vinculo === 'Nuvem') {
                            try { await atualizarCamposMotoboy(motoboyNuvemId, { ultima_nota: nota }); } catch (_e) {}
                            if (process.env.HUB_URL) {
                                fetch(`${process.env.HUB_URL}/reputacao`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ telegram_id: motoboyNuvemId, nota }),
                                    signal: AbortSignal.timeout(5000)
                                }).catch(e => console.error('[HUB REPUTACAO] Falha:', e));
                            }
                            await this.sendMessage(numeroCliente, '⭐ Obrigado pela sua avaliação!', 'SISTEMA', 'avaliacao', 'BOT');
                            return;
                        }
                    }
                }
            }

            // ROTEAMENTO 1: CLIENTE TEM UMA ROTA ATIVA (Bypass da IA)
            const rota = await getRotaPeloCliente(numeroNormalizado);
            if (rota && rota.telegram_id) {
                const motoboyRota = await getMotoboyByTelegramId(rota.telegram_id);
                if (motoboyRota?.vinculo === 'Nuvem') {
                    ultimoNuvemPorCliente.set(jidParaBusca, rota.telegram_id);
                }

                if (location) {
                    const mapsLink = `https://www.google.com/maps?q=${location.degreesLatitude},${location.degreesLongitude}`;
                    await enviarMensagemTelegram(rota.telegram_id, `📍 Localização enviada pelo cliente: ${mapsLink}`);
                    return;
                }

                const prefixo = isAudio ? '🎙️ Áudio do Cliente:\n' : '🗣️ Cliente: ';
                await enviarMensagemTelegram(rota.telegram_id, prefixo + mensagemTexto);
                broadcastLog('TELEGRAM', `Mensagem do cliente ${numeroNormalizado} enviada diretamente ao motoboy.`);
                return;
            }

            // ROTEAMENTO 2: CHAT BLINDADO (Cache da Linha Direta)
            const jidNormalized = jidNormalizedUser(msg.key.remoteJid!);

            if (this.contextCache.has(jidNormalized)) {
                const contextoEncontrado = this.contextCache.get(jidNormalized)!;
                const prefixo = isAudio ? '🎙️ Áudio do Cliente:\n' : '🗣️ Cliente: ';
                await enviarMensagemTelegram(contextoEncontrado.telegramId, prefixo + mensagemTexto);
                broadcastLog('TELEGRAM', `Resposta de ${numeroNormalizado} roteada via cache para ${contextoEncontrado.motoboyName}.`);
                return;
            }

            const session = this.manageCustomerSession(jidNormalized);

            if (session.mode === 'HUMAN') {
                broadcastLog('SAC_MSG', mensagemTexto, { jid: jidNormalized, nome: msg.pushName || numeroNormalizado });
                return;
            }

            const config = await getConfiguracoes();
            const nomeCliente = msg.pushName?.split(' ')[0]?.trim() || null;

            try {
                const respostaIA = await this.processarMensagemIA(mensagemTexto, config, nomeCliente);

                if (respostaIA.includes('[ACTION_HUMAN]')) {
                    session.mode = 'HUMAN';
                    broadcastLog('SAC_REQUEST', `Cliente [${msg.pushName || numeroNormalizado}] pediu para falar com um atendente.`, { jid: jidNormalized, nome: msg.pushName || numeroNormalizado });
                    await this.sendMessage(numeroCliente, 'Um de nossos atendentes já vai falar com você. Aguarde um instante.', 'SISTEMA', 'transfere_humano', 'BOT');
                    return;
                }

                const contextoPedido = await this.buscarContextoPedidoCliente(jidParaBusca, config, mensagemTexto);
                if (contextoPedido) broadcastLog('WHATSAPP', `[RASTREIO] Pedido identificado para ${numeroExibicao}: ${contextoPedido.texto}`);

                if (contextoPedido?.respostaDireta) {
                    await this.sendMessage(numeroCliente, contextoPedido.respostaDireta, 'SISTEMA', 'SISTEMA_RASTREIO', 'BOT');
                    return;
                }

                if (!contextoPedido) {
                    const msgLower = mensagemTexto.toLowerCase();
                    const intentRastreio = /pedido|entrega|entregador|motoboy|rastreio|onde.*pedido|demora.*entrega|chegou|chegando|status/.test(msgLower);
                    if (intentRastreio) {
                        await this.sendMessage(numeroCliente, 'Não encontrei pedidos ativos associados ao seu número. Se precisar de ajuda, fale com um de nossos atendentes.', 'SISTEMA', 'sem_pedido', 'BOT');
                        return;
                    }
                }

                await this.sendMessage(numeroCliente, respostaIA, 'SISTEMA', 'SISTEMA_AUTO_ATENDIMENTO', 'BOT');
            } catch (error) {
                console.error('[ERRO FATAL] Falha na execução do Auto-Atendimento:', error);
            }
        });
    }

    async sendMessage(
        numero: string,
        texto: string,
        telegramId: string = 'SISTEMA',
        motoboyMessage: string = 'envio_sistema',
        motoboyName: string = 'CEIA',
        retryCount = 0
    ): Promise<string | null> {
        try {
            if (this.status === 'CONNECTING' && retryCount < 5) {
                console.log(`[WHATSAPP] Aguardando inicialização... (${retryCount + 1}/5)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.sendMessage(numero, texto, telegramId, motoboyMessage, motoboyName, retryCount + 1);
            }

            if (this.status !== 'CONNECTED' || !this.sock) {
                console.error('[WHATSAPP] Tentativa de envio falhou: Sessão desconectada.');
                return null;
            }

            let idEnvio = numero;

            if (!numero.includes('@')) {
                let numeroLimpo = this.normalizePhone(numero);
                if (numeroLimpo.startsWith('5555')) {
                    numeroLimpo = numeroLimpo.substring(2);
                } else if (numeroLimpo.length === 10 || numeroLimpo.length === 11) {
                    numeroLimpo = '55' + numeroLimpo;
                }
                idEnvio = numeroLimpo + '@s.whatsapp.net';
                try {
                    const query = await this.sock.onWhatsApp(numeroLimpo);
                    if (query && query.length > 0 && query[0].exists) idEnvio = query[0].jid;
                } catch (_) {}
            }

            await this.sock.sendPresenceUpdate('composing', idEnvio);
            const delay = 1500 + Math.floor(Math.random() * 1500);
            await new Promise(resolve => setTimeout(resolve, delay));
            await this.sock.sendPresenceUpdate('paused', idEnvio);

            const sentMsg: proto.IWebMessageInfo = await this.sock.sendMessage(idEnvio, { text: texto });

            const realJid = jidNormalizedUser(idEnvio);

            if (telegramId !== 'SISTEMA') {
                this.contextCache.set(realJid, { telegramId, motoboyName, lastMotoboyMessage: motoboyMessage, timestamp: Date.now() });

                setTimeout(() => {
                    const cache = this.contextCache.get(realJid);
                    if (cache && Date.now() - cache.timestamp >= 14 * 60 * 1000) {
                        this.contextCache.delete(realJid);
                    }
                }, 15 * 60 * 1000);
            }

            return realJid ?? null;
        } catch (error) {
            console.error('Erro ao disparar WhatsApp nativo:', error);
            return null;
        }
    }

    private normalizePhone(input: string): string {
        if (!input) return '';
        return input.includes('@') ? input.split('@')[0] : input.replace(/\D/g, '');
    }

    private manageCustomerSession(jid: string): CustomerSession {
        if (this.customerSessionCache.has(jid)) {
            const session = this.customerSessionCache.get(jid)!;
            clearTimeout(session.timeout);
            session.timeout = setTimeout(() => this.customerSessionCache.delete(jid), 15 * 60 * 1000);
            return session;
        }
        const newSession: CustomerSession = {
            mode: 'BOT',
            timeout: setTimeout(() => this.customerSessionCache.delete(jid), 15 * 60 * 1000)
        };
        this.customerSessionCache.set(jid, newSession);
        return newSession;
    }

    private parsearMinutos(textoTempo: string): number {
        let total = 0;
        const h = textoTempo.match(/(\d+)\s*hora/);
        const m = textoTempo.match(/(\d+)\s*min/);
        if (h) total += parseInt(h[1]) * 60;
        if (m) total += parseInt(m[1]);
        return total || 999;
    }

    private fraseETA(tempoEstimado: string): string {
        const minutos = this.parsearMinutos(tempoEstimado);
        return minutos <= 15
            ? `rapidinho, chega em ${tempoEstimado}`
            : `seu pedido vai chegar até você em ${tempoEstimado}`;
    }

    private async processarMensagemIA(
        mensagemCliente: string,
        config: any,
        nomeCliente: string | null = null
    ): Promise<string> {
        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');
        const horariosFormatados = config.horarios ? Object.entries(config.horarios)
            .filter(([, val]: any) => val.on)
            .map(([dia, val]: any) => `${dia.charAt(0).toUpperCase() + dia.slice(1)}: ${val.abre} às ${val.fecha}`)
            .join(', ') : 'Não informado.';

        const instrucaoNome = nomeCliente
            ? `Você está conversando com o cliente chamado ${nomeCliente}. Trate-o pelo primeiro nome de forma natural.`
            : 'Você não conhece o nome do cliente. Seja cordial sem usar nomes próprios.';

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: `Você é o assistente virtual do estabelecimento ${config.nome || 'nosso restaurante'}. ${instrucaoNome} Informações do estabelecimento: Endereço: ${config.endereco || 'Não informado'}. Horários: ${horariosFormatados}. Cardápio: ${config.link_cardapio || 'Não disponível online'}.\n\nREGRAS: Se o cliente quiser fazer um pedido, oriente a usar o link do cardápio. Se exigir falar com um humano/atendente, retorne ESTRITAMENTE a tag: [ACTION_HUMAN]. Se perguntar algo fora de contexto, diga educadamente que não pode ajudar. NUNCA invente nomes, endereços ou horários que não estejam nestas instruções.` },
                { role: 'user', content: mensagemCliente }
            ],
            temperature: 0.5,
        });
        return completion.choices[0].message?.content || 'Desculpe, tive um problema ao processar sua resposta.';
    }

    private async buscarContextoPedidoCliente(jidOriginal: string, config: any, mensagemCliente: string): Promise<ContextoPedido | null> {
        try {
            let jidNumber: string;

            if (jidOriginal.endsWith('@lid')) {
                const lidKey = jidOriginal.split('@')[0];
                const resolvedPhone = this.lidToPhone.get(lidKey);
                if (!resolvedPhone) return null;
                jidNumber = resolvedPhone.replace(/\D/g, '');
            } else {
                const jidLimpo = jidNormalizedUser(jidOriginal);
                jidNumber = jidLimpo.split('@')[0].replace(/\D/g, '');
            }

            if (!jidNumber) return null;

            const pedidosRaw = await getPedidos();
            if (!pedidosRaw?.length) return null;
            const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));

            const ultimos6 = jidNumber.slice(-6);

            const pedidosDoCliente = pedidos.filter((p: any) => {
                const realNumber = (p.telefone || '').replace(/\D/g, '');
                return realNumber.length >= 6 && ultimos6 === realNumber.slice(-6);
            });

            if (!pedidosDoCliente.length) return null;

            const pedidoDoCliente = pedidosDoCliente.sort((a: any, b: any) =>
                String(b.id ?? '').localeCompare(String(a.id ?? ''))
            )[0];

            const pacotesRaw = await getPacotes();
            const pacotes = pacotesRaw?.length ? pacotesRaw.map((p: any) => JSON.parse(p.dados_json)) : [];

            const statusAtivos = ['AGUARDANDO', 'PENDENTE_ACEITE', 'EM_ROTA'];
            const pacote = pacotes.find((pac: any) =>
                pac.pedidosIds?.includes(pedidoDoCliente.id) && statusAtivos.includes(pac.status)
            );

            if (!pacote) return null;

            if (pacote.status === 'AGUARDANDO') {
                return { texto: 'Pedido em preparo.', nomeMotoboy: '', localizacao: '', fraseETA: '', status: 'AGUARDANDO',
                    respostaDireta: 'Seu pedido está sendo preparado na cozinha! 👨‍🍳' };
            }

            if (pacote.status === 'PENDENTE_ACEITE') {
                return { texto: 'Pedido pronto, aguardando entregador.', nomeMotoboy: '', localizacao: '', fraseETA: '', status: 'PENDENTE_ACEITE',
                    respostaDireta: 'Seu pedido está pronto e aguardando o entregador confirmar a rota! 🛵' };
            }

            if (pacote.status === 'EM_ROTA') {
                const telegramId = pacote.motoboy?.telegram_id;
                const frota = await getFleet();
                const motoboyDb = frota?.find((m: any) => m.telegram_id === telegramId);
                const primeiroNome = motoboyDb?.nome?.split(' ')[0]
                    || pacote.motoboy?.nome?.split(' ')[0]
                    || 'o entregador';

                let localizacaoTexto = '';
                let fraseTempoEntrega = '';

                if (motoboyDb?.lat && motoboyDb?.lng && config.google_maps_key) {
                    try {
                        const { lat, lng } = motoboyDb;
                        const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.google_maps_key}&language=pt-BR&result_type=route|street_address`);
                        const geoData = await geoRes.json() as any;
                        if (geoData.status === 'OK' && geoData.results?.length > 0) {
                            const resultado = geoData.results[0];
                            const rua = resultado.address_components?.find((c: any) => c.types.includes('route'))?.long_name;
                            const bairro = resultado.address_components?.find((c: any) =>
                                c.types.includes('sublocality_level_1') || c.types.includes('sublocality') || c.types.includes('neighborhood')
                            )?.long_name;
                            if (rua && bairro) localizacaoTexto = `na ${rua}, bairro ${bairro}`;
                            else if (rua) localizacaoTexto = `na ${rua}`;
                            else if (resultado.formatted_address) localizacaoTexto = resultado.formatted_address.split(',').slice(0, 2).join(',').trim();
                        }
                    } catch (e) {}

                    if (pedidoDoCliente.endereco) {
                        try {
                            const origin = `${motoboyDb.lat},${motoboyDb.lng}`;
                            const destination = encodeURIComponent(pedidoDoCliente.endereco);
                            const dmRes = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&key=${config.google_maps_key}&language=pt-BR`);
                            const dmData = await dmRes.json() as any;
                            if (dmData.status === 'OK' && dmData.rows[0].elements[0].status === 'OK') {
                                fraseTempoEntrega = this.fraseETA(dmData.rows[0].elements[0].duration.text);
                            }
                        } catch (e) {}
                    }
                }

                if (!localizacaoTexto && !fraseTempoEntrega) {
                    return {
                        texto: `EM ROTA — GPS offline`,
                        nomeMotoboy: primeiroNome,
                        localizacao: '',
                        fraseETA: '',
                        status: 'EM_ROTA',
                        respostaDireta: `Seu pedido já saiu para entrega e chega em breve! 🛵`
                    };
                }

                const msg = mensagemCliente.toLowerCase();
                const querLocal = /onde|rua|bairro|regi[aã]o|endere[cç]o/.test(msg);
                const querTempo = /demora|tempo|quanto falta|minutos|logo|j[aá] chega|chegando/.test(msg);

                let respostaDireta: string;
                if (querLocal) {
                    respostaDireta = localizacaoTexto
                        ? `${primeiroNome} está ${localizacaoTexto}.`
                        : `${primeiroNome} está a caminho.`;
                } else if (querTempo) {
                    respostaDireta = fraseTempoEntrega
                        ? `${fraseTempoEntrega.charAt(0).toUpperCase() + fraseTempoEntrega.slice(1)}.`
                        : `${primeiroNome} está a caminho e chega em breve.`;
                } else {
                    respostaDireta = `Seu pedido está em rota de entrega com ${primeiroNome}.`;
                }

                const locLog = localizacaoTexto ? `${primeiroNome} está ${localizacaoTexto}` : `${primeiroNome} está a caminho`;
                const etaLog = fraseTempoEntrega ? ` | ETA: ${fraseTempoEntrega}` : '';
                return {
                    texto: `EM ROTA — ${locLog}${etaLog}`,
                    nomeMotoboy: primeiroNome,
                    localizacao: localizacaoTexto,
                    fraseETA: fraseTempoEntrega,
                    status: 'EM_ROTA',
                    respostaDireta
                };
            }

            return null;
        } catch (e) {
            console.error('[DEBUG CONTEXTO_PEDIDO] Erro ao buscar contexto do pedido:', e);
            return null;
        }
    }
}
