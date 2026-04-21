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
import { enviarMensagemTelegram, encerrarChatClientePeloPainel } from '../telegramBot';

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

interface StatusPedidoTool {
    status: 'AGUARDANDO' | 'PENDENTE_ACEITE' | 'EM_ROTA' | 'NAO_ENCONTRADO';
    entregador?: string;
    localizacao?: string;
    eta?: string;
}

interface ResultadoIA {
    resposta: string;
    transferir: boolean;
}

interface ConversationEntry {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    timeout: NodeJS.Timeout;
}

export class BaileysProvider implements WhatsAppProvider {
    private sock: WASocket | null = null;
    private status: string = 'DISCONNECTED';
    private state: ProviderState | null = null;
    private destroyed = false;
    private contextCache = new Map<string, ChatContext>();
    private lidToPhone = new Map<string, string>();
    private customerSessionCache = new Map<string, CustomerSession>();
    private sacAtivos = new Set<string>();
    private sacNomes = new Map<string, string>();
    private conversationHistories = new Map<string, ConversationEntry>();

    public setClienteSAC(jid: string, ativo: boolean, nome?: string): void {
        const raw = jid.includes('@') ? jid : jid + '@s.whatsapp.net';
        const normalizado = jidNormalizedUser(raw);
        if (ativo) {
            this.sacAtivos.add(normalizado);
            if (nome) this.sacNomes.set(normalizado, nome);
            // Garante que session.mode === 'HUMAN' para bloquear ROTEAMENTO 1 (rota ativa no BD)
            const sessaoExistente = this.customerSessionCache.get(normalizado);
            if (sessaoExistente) {
                clearTimeout(sessaoExistente.timeout);
                sessaoExistente.mode = 'HUMAN';
                sessaoExistente.timeout = setTimeout(() => this.customerSessionCache.delete(normalizado), 15 * 60 * 1000);
            } else {
                this.customerSessionCache.set(normalizado, {
                    mode: 'HUMAN',
                    timeout: setTimeout(() => this.customerSessionCache.delete(normalizado), 15 * 60 * 1000)
                });
            }
            // Derruba a linha direta do motoboy e notifica-o, se existir
            const contexto = this.findContextBySuffix(normalizado);
            if (contexto) {
                encerrarChatClientePeloPainel(contexto.telegramId);
                for (const [key, ctx] of this.contextCache.entries()) {
                    if (ctx === contexto) { this.contextCache.delete(key); break; }
                }
            }
        } else {
            this.sacAtivos.delete(normalizado);
            this.sacNomes.delete(normalizado);
            const session = this.customerSessionCache.get(normalizado);
            if (session) { clearTimeout(session.timeout); this.customerSessionCache.delete(normalizado); }
            const history = this.conversationHistories.get(normalizado);
            if (history) { clearTimeout(history.timeout); this.conversationHistories.delete(normalizado); }
        }
    }

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

            let numeroNormalizado = this.normalizePhone(numeroCliente);
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
            let jidParaBusca = candidatoJid ?? numeroCliente;

            // Resolve @lid → JID real para iPhone / Multi-device.
            // Só sobrescreve jidParaBusca via lidToPhone se candidatoJid NÃO forneceu
            // um telefone real — evita conflito entre formato 8-dígitos do pedido vs
            // 9-dígitos registrado no WhatsApp / lidToPhone.
            const rawNorm = jidNormalizedUser(msg.key.remoteJid!);
            if (rawNorm.endsWith('@lid') && !candidatoJid) {
                const lidKey = rawNorm.split('@')[0];
                const realPhone = this.lidToPhone.get(lidKey);
                if (realPhone) {
                    jidParaBusca = realPhone.replace(/\D/g, '') + '@s.whatsapp.net';
                }
            }

            // Derivar numeroNormalizado de jidParaBusca (fonte única de verdade após
            // resolução @lid) — evita que o valor lid vaze para R1/R2.
            numeroNormalizado = this.normalizePhone(jidParaBusca);

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

            // JID resolvido usado por todos os roteamentos abaixo
            const jidNormalized = jidNormalizedUser(jidParaBusca);

            // ROTEAMENTO 0: OPERADOR EM ATENDIMENTO SAC (prioridade máxima)
            // Verifica sacAtivos (via API/dashboard) OU session.mode=HUMAN (via IA)
            // DEVE ficar antes de ROTEAMENTO 1 para bloquear rota ativa no BD
            const session = this.manageCustomerSession(jidNormalized);
            const emAtendimentoSAC = this.matchClienteBySuffix(jidNormalized, this.sacAtivos) || session.mode === 'HUMAN';
            if (emAtendimentoSAC) {
                this.sacAtivos.add(jidNormalized);
                this.contextCache.delete(jidNormalized);
                const nomeExibicao = this.findValueBySuffix(jidNormalized, this.sacNomes) || msg.pushName || numeroNormalizado;
                broadcastLog('SAC_MSG', mensagemTexto || '[Localização]', { jid: jidNormalized, nome: nomeExibicao });
                return;
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

            if (this.contextCache.has(jidNormalized)) {
                const contextoEncontrado = this.contextCache.get(jidNormalized)!;
                const prefixo = isAudio ? '🎙️ Áudio do Cliente:\n' : '🗣️ Cliente: ';
                await enviarMensagemTelegram(contextoEncontrado.telegramId, prefixo + mensagemTexto);
                broadcastLog('TELEGRAM', `Resposta de ${numeroNormalizado} roteada via cache para ${contextoEncontrado.motoboyName}.`);
                return;
            }

            const config = await getConfiguracoes();
            const nomeCliente = msg.pushName?.split(' ')[0]?.trim() || null;

            try {
                const resultado = await this.processarMensagemIA(jidNormalized, jidParaBusca, mensagemTexto, config, nomeCliente);

                if (resultado.transferir) {
                    session.mode = 'HUMAN';
                    this.sacAtivos.add(jidNormalized);
                    broadcastLog('SAC_REQUEST', `Cliente [${msg.pushName || numeroNormalizado}] pediu para falar com um atendente.`, { jid: jidNormalized, nome: msg.pushName || numeroNormalizado });
                    await this.sendMessage(numeroCliente, 'Um de nossos atendentes já vai falar com você. Aguarde um instante.', 'SISTEMA', 'transfere_humano', 'BOT');
                    return;
                }

                await this.sendMessage(numeroCliente, resultado.resposta, 'SISTEMA', 'SISTEMA_AUTO_ATENDIMENTO', 'BOT');
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

    private matchClienteBySuffix(jidBusca: string, jidsSet: Set<string>): boolean {
        if (jidsSet.has(jidBusca)) return true;
        const numBusca = jidBusca.split('@')[0].replace(/\D/g, '');
        if (numBusca.length < 6) return false;
        const ultimos6Busca = numBusca.slice(-6);
        for (const jidCandidato of jidsSet) {
            const numCandidato = jidCandidato.split('@')[0].replace(/\D/g, '');
            if (numCandidato.length >= 6 && numCandidato.slice(-6) === ultimos6Busca) return true;
        }
        return false;
    }

    private findValueBySuffix<T>(jidBusca: string, map: Map<string, T>): T | undefined {
        const direto = map.get(jidBusca);
        if (direto !== undefined) return direto;
        const numBusca = jidBusca.split('@')[0].replace(/\D/g, '');
        if (numBusca.length < 6) return undefined;
        const ultimos6Busca = numBusca.slice(-6);
        for (const [jidKey, valor] of map.entries()) {
            const numKey = jidKey.split('@')[0].replace(/\D/g, '');
            if (numKey.length >= 6 && numKey.slice(-6) === ultimos6Busca) return valor;
        }
        return undefined;
    }

    private findContextBySuffix(jidBusca: string): ChatContext | undefined {
        if (this.contextCache.has(jidBusca)) return this.contextCache.get(jidBusca);
        const numBusca = jidBusca.split('@')[0].replace(/\D/g, '');
        if (numBusca.length < 6) return undefined;
        const ultimos6Busca = numBusca.slice(-6);
        for (const [jidKey, contexto] of this.contextCache.entries()) {
            const numKey = jidKey.split('@')[0].replace(/\D/g, '');
            if (numKey.length >= 6 && numKey.slice(-6) === ultimos6Busca) return contexto;
        }
        return undefined;
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

    private addToHistory(jid: string, role: 'user' | 'assistant', content: string): void {
        const existing = this.conversationHistories.get(jid);
        if (existing) clearTimeout(existing.timeout);
        const entry: ConversationEntry = existing || { messages: [], timeout: null as any };
        entry.messages.push({ role, content });
        if (entry.messages.length > 20) entry.messages = entry.messages.slice(-20);
        entry.timeout = setTimeout(() => this.conversationHistories.delete(jid), 15 * 60 * 1000);
        this.conversationHistories.set(jid, entry);
    }

    private async processarMensagemIA(
        jid: string,
        jidParaBusca: string,
        mensagemCliente: string,
        config: any,
        nomeCliente: string | null = null
    ): Promise<ResultadoIA> {
        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');

        const horariosFormatados = config.horarios ? Object.entries(config.horarios)
            .filter(([, val]: any) => val.ativo)
            .map(([dia, val]: any) => `${dia.charAt(0).toUpperCase() + dia.slice(1)}: ${val.abre} às ${val.fecha}`)
            .join(', ') : 'Não informado.';

        const instrucaoNome = nomeCliente
            ? `Você está conversando com ${nomeCliente}. Trate-o pelo primeiro nome de forma natural.`
            : 'Você não conhece o nome do cliente. Seja cordial sem usar nomes próprios.';

        const systemPrompt = `Você é o atendimento automático do ${config.nome || 'estabelecimento'}. ${instrucaoNome}
Dados da loja — use SOMENTE estes: Endereço: ${config.endereco || 'Não informado'}. Horários: ${horariosFormatados}. Cardápio: ${config.link_cardapio || 'Não disponível online'}.

## O QUE VOCÊ RESOLVE SOZINHO (sem transferir)

- Saudação / conversa inicial → responda cordialmente e pergunte no que pode ajudar.
- Cardápio, preços, opções → envie o link do cardápio acima.
- Endereço / onde fica → responda com o endereço acima.
- Horário / se está aberto → responda com os horários acima.
- Qualquer dúvida sobre pedido, entrega, entregador, localização, ETA, "cadê meu pedido", "quanto tempo" → chame SEMPRE consultar_status_pedido e responda APENAS com o que ela retornar. Tom calmo, mesmo se o cliente parecer ansioso — ansiedade de entrega é normal e a tool resolve.
- Conversa casual curta ("tudo bem?", "você é robô?") → uma linha curta e volte ao foco. Não transferir.

## QUANDO TRANSFERIR (lista fechada — só esses casos)

Chame transferir_para_atendente_humano APENAS se:

A. Cliente pedir explicitamente: "quero falar com atendente", "me passa pra uma pessoa", "humano", "gerente", "alguém de verdade".

B. Cliente mencionar: pagamento / troco / estorno / pix não caiu / forma de pagamento — item errado, faltando, frio, estragado, embalagem violada, alergia — cancelamento — troca / devolução / reembolso — reserva / pedido por telefone / fora do cardápio — promoção / cupom / desconto específico — entrega fora da área / endereço especial — ingrediente específico / nutricional / alergênico.

C. O dado necessário não existe: cliente pede cardápio mas link_cardapio é "Não disponível online"; pede endereço mas endereco é "Não informado"; pede horário mas horariosFormatados é "Não informado." → transferir.

D. consultar_status_pedido retornou uma resposta E o cliente insiste pela segunda vez que está errado ("isso não é verdade", "não é isso") → transferir.

## O QUE NUNCA FAZER

- NUNCA inventar: preço, item, ingrediente, ETA, localização, entregador, taxa, promoção, horário de feriado, forma de pagamento. Se não tem o dado, transfere.
- NUNCA usar menu numerado: "Digite 1", "Opção 2", emojis numéricos. Conversa fluida sempre.
- NUNCA transferir só porque o cliente está ansioso, impaciente, usa mensagem curta ou faz pergunta estranha — tente resolver dentro do escopo antes.

## TOM E FORMATO

- Frases curtas (1–3 por mensagem). Cordial e objetivo.
- Emoji: no máximo 1 por mensagem, só quando encaixa natural. Nunca em mensagens de problema ou transferência.
- Ao transferir, diga apenas: "Vou te conectar com um atendente agora, um momento." — nada mais.`;

        const tools: any[] = [
            {
                type: 'function',
                function: {
                    name: 'consultar_status_pedido',
                    description: 'Consulta o status atual do pedido do cliente, incluindo nome do entregador, localização em tempo real e tempo estimado de chegada (ETA).',
                    parameters: { type: 'object', properties: {}, required: [] }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'transferir_para_atendente_humano',
                    description: 'Transfere o atendimento para um operador humano quando o cliente solicitar explicitamente falar com um atendente ou humano.',
                    parameters: { type: 'object', properties: {}, required: [] }
                }
            }
        ];

        const historyEntry = this.conversationHistories.get(jid);
        const mensagensHistorico = historyEntry?.messages || [];

        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            ...mensagensHistorico,
            { role: 'user', content: mensagemCliente }
        ];

        const openai = new OpenAI({ apiKey: config.openai_key });

        for (let iteracoes = 0; iteracoes < 5; iteracoes++) {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages,
                tools,
                tool_choice: 'auto',
                temperature: 0.3
            });

            const choice = response.choices[0];
            const msg = choice.message;

            if (choice.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
                messages.push(msg);

                for (const toolCall of msg.tool_calls) {
                    if (toolCall.function.name === 'transferir_para_atendente_humano') {
                        this.addToHistory(jid, 'user', mensagemCliente);
                        return { resposta: '', transferir: true };
                    }

                    if (toolCall.function.name === 'consultar_status_pedido') {
                        const statusData = await this.buscarStatusPedidoCliente(jidParaBusca, config);
                        broadcastLog('WHATSAPP', `[RASTREIO] status para ${jid.split('@')[0]}: ${statusData.status}`);
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(statusData)
                        });
                    }
                }
            } else {
                const resposta = msg.content || 'Desculpe, tive um problema ao processar sua resposta.';
                this.addToHistory(jid, 'user', mensagemCliente);
                this.addToHistory(jid, 'assistant', resposta);
                return { resposta, transferir: false };
            }
        }

        return { resposta: 'Desculpe, não consegui processar sua mensagem. Tente novamente.', transferir: false };
    }

    private async buscarStatusPedidoCliente(jidOriginal: string, config: any): Promise<StatusPedidoTool> {
        try {
            let jidNumber: string;

            if (jidOriginal.endsWith('@lid')) {
                const lidKey = jidOriginal.split('@')[0];
                const resolvedPhone = this.lidToPhone.get(lidKey);
                if (!resolvedPhone) return { status: 'NAO_ENCONTRADO' };
                jidNumber = resolvedPhone.replace(/\D/g, '');
            } else {
                const jidLimpo = jidNormalizedUser(jidOriginal);
                jidNumber = jidLimpo.split('@')[0].replace(/\D/g, '');
            }

            if (!jidNumber) return { status: 'NAO_ENCONTRADO' };

            const pedidosRaw = await getPedidos();
            if (!pedidosRaw?.length) return { status: 'NAO_ENCONTRADO' };
            const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));

            const ultimos6 = jidNumber.slice(-6);
            const pedidosDoCliente = pedidos.filter((p: any) => {
                const realNumber = (p.telefone || '').replace(/\D/g, '');
                return realNumber.length >= 6 && ultimos6 === realNumber.slice(-6);
            });

            if (!pedidosDoCliente.length) return { status: 'NAO_ENCONTRADO' };

            const pedidoDoCliente = pedidosDoCliente.sort((a: any, b: any) =>
                String(b.id ?? '').localeCompare(String(a.id ?? ''))
            )[0];

            const pacotesRaw = await getPacotes();
            const pacotes = pacotesRaw?.length ? pacotesRaw.map((p: any) => JSON.parse(p.dados_json)) : [];

            const statusAtivos = ['AGUARDANDO', 'PENDENTE_ACEITE', 'EM_ROTA'];
            const pacote = pacotes.find((pac: any) =>
                pac.pedidosIds?.includes(pedidoDoCliente.id) && statusAtivos.includes(pac.status)
            );

            if (!pacote) return { status: 'NAO_ENCONTRADO' };

            if (pacote.status === 'AGUARDANDO') return { status: 'AGUARDANDO' };
            if (pacote.status === 'PENDENTE_ACEITE') return { status: 'PENDENTE_ACEITE' };

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

                return {
                    status: 'EM_ROTA',
                    entregador: primeiroNome,
                    localizacao: localizacaoTexto || undefined,
                    eta: fraseTempoEntrega || undefined
                };
            }

            return { status: 'NAO_ENCONTRADO' };
        } catch (e) {
            console.error('[DEBUG BUSCAR_STATUS_PEDIDO] Erro:', e);
            return { status: 'NAO_ENCONTRADO' };
        }
    }
}
