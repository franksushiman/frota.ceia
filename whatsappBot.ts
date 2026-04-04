import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadMediaMessage, fetchLatestBaileysVersion, proto, WASocket } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import OpenAI, { toFile } from 'openai';
import fs from 'fs';

import { getConfiguracoes, getMotoboysOnline, getPedidos, getPacotes } from './database';
import { getRotaPeloCliente } from './operacao';
import { broadcastLog } from './logger';

// =============================================================================
//                      CONTROLE DE CONTEXTO DE CHAT
// =============================================================================

interface ChatContext {
  telegramId: string;
  motoboyName: string;
  lastMotoboyMessage: string;
  timestamp: number;
}
const contextCache = new Map<string, ChatContext>();

interface CustomerSession {
  mode: 'BOT' | 'WAITING_CODE' | 'HUMAN';
  timeout: NodeJS.Timeout;
}
const customerSessionCache = new Map<string, CustomerSession>();

function manageCustomerSession(jid: string): CustomerSession {
    if (customerSessionCache.has(jid)) {
        const session = customerSessionCache.get(jid)!;
        clearTimeout(session.timeout);
        session.timeout = setTimeout(() => {
            customerSessionCache.delete(jid);
            broadcastLog('INFO', `Sessão de atendimento para ${jid} expirou.`);
        }, 15 * 60 * 1000); // 15 min TTL
        return session;
    }
    const newSession: CustomerSession = {
        mode: 'BOT',
        timeout: setTimeout(() => {
            customerSessionCache.delete(jid);
            broadcastLog('INFO', `Sessão de atendimento para ${jid} expirou.`);
        }, 15 * 60 * 1000)
    };
    customerSessionCache.set(jid, newSession);
    return newSession;
}

// =============================================================================
//                      CONTROLE DE SESSÃO E CONEXÃO (BAILEYS)
// =============================================================================

export let qrCodeBase64: string | null = null;
export let sessionStatus: string = 'DISCONNECTED';
let sock: WASocket | null = null;

function normalizePhone(input: string): string {
    if (!input) return '';
    return input.includes('@') ? input.split('@')[0] : input.replace(/\D/g, '');
}

// Retorna os últimos 8 dígitos numéricos de um JID/LID para fuzzy matching
function getCoreId(jid: string): string {
    if (!jid) return '';
    return jid.replace(/\D/g, '').slice(-8);
}

export async function iniciarWhatsApp() {
    sessionStatus = 'CONNECTING';
    qrCodeBase64 = null;
    broadcastLog('WHATSAPP', 'Iniciando conexão nativa com Baileys...');

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
        auth: state,
        version: version,
        logger: pino({ level: 'silent' }), // Silencia os logs vermelhos do Baileys
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            try {
                // Transforma o texto do Baileys em imagem Base64 para o seu index.html
                qrCodeBase64 = await QRCode.toDataURL(qr);
                broadcastLog('WHATSAPP', 'Novo QR Code gerado. Aguardando leitura na tela...');
            } catch (e) {
                console.error("Erro ao gerar imagem do QR Code:", e);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            broadcastLog('WHATSAPP', `Conexão fechada. Motivo: ${lastDisconnect?.error?.message}. Reconectando: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                iniciarWhatsApp();
            } else {
                sessionStatus = 'DISCONNECTED';
                qrCodeBase64 = null;
                // Apaga a pasta da sessão antiga se o usuário desconectar pelo celular
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                broadcastLog('WHATSAPP', 'Sessão encerrada/deslogada. Será necessário ler o QR Code novamente.');
            }
        } else if (connection === 'open') {
            sessionStatus = 'CONNECTED';
            qrCodeBase64 = null;
            broadcastLog('WHATSAPP', 'WhatsApp conectado e operante! 🟢');
        }
    });

    // =============================================================================
    //                           RECEBIMENTO DE MENSAGENS NATIVO
    // =============================================================================
    sock.ev.on('messages.upsert', async (m: any) => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        const numeroCliente = msg.key.remoteJid;

        // Filtro Anti-Grupo / Anti-Spam
        if (!msg.message || msg.key.fromMe || !numeroCliente || numeroCliente.endsWith('@g.us') || numeroCliente.endsWith('@broadcast')) {
            return;
        }

        const numeroNormalizado = normalizePhone(numeroCliente);
        await sock!.readMessages([msg.key]);

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
            } catch (err) { console.error("Erro na transcrição:", err); }
        }

        if (!mensagemTexto && !location) return;
        broadcastLog('WHATSAPP', `Recebido de [${numeroNormalizado}]: ${mensagemTexto || 'Localização'}`);

        // 1. Roteamento Primário via Banco de Dados (Rota Ativa)
        const rota = await getRotaPeloCliente(numeroNormalizado);
        if (rota && rota.telegram_id) {
            if (location) {
                const mapsLink = `https://www.google.com/maps?q=${location.degreesLatitude},${location.degreesLongitude}`;
                await sendTelegramMessage(rota.telegram_id, `📍 Localização enviada pelo cliente: ${mapsLink}`);
                return;
            }
            const resumo = await resumirClienteParaMotoboy(mensagemTexto);
            const prefixo = isAudio ? '🎙️ Áudio do Cliente (Resumo):\n' : '⚠️ Retorno do Cliente: ';
            await sendTelegramMessage(rota.telegram_id, prefixo + resumo);
            broadcastLog('TELEGRAM', `Resumo do cliente ${numeroNormalizado} enviado ao motoboy.`);
            return;
        }

        // 2. Roteamento Semântico via Cache de Contexto
        const jidBruto = msg.key.remoteJid!;
        if (contextCache.size > 0) {
            console.log(`[DEBUG] Tentando match semântico para a resposta: '${mensagemTexto}'`);

            const contextosAtivos = Array.from(contextCache.entries())
                .map(([key, value]) => ({ ...value, originalJid: key }));

            const telegramIdMatch = await analisarRespostaComContextoIA(mensagemTexto, contextosAtivos);

            if (telegramIdMatch && telegramIdMatch !== 'NAO') {
                const contextoEncontrado = contextosAtivos.find(c => c.telegramId === telegramIdMatch);
                if (contextoEncontrado) {
                    console.log(`[DEBUG] Match encontrado! Encaminhando para motoboy ${contextoEncontrado.motoboyName}`);
                    const resumoTecnico = await resumirRespostaClienteParaMotoboy(mensagemTexto);
                    await sendTelegramMessage(contextoEncontrado.telegramId, `⚠️ Retorno do Cliente: ${resumoTecnico}`);
                    
                    contextCache.delete(contextoEncontrado.originalJid);
                    broadcastLog('TELEGRAM', `Resposta de ${numeroNormalizado} roteada para ${contextoEncontrado.motoboyName} via Roteamento Semântico.`);
                    return;
                }
            }
        }

        // 3. Auto-Atendimento e Transbordo Humano
        const session = manageCustomerSession(jidBruto);

        if (session.mode === 'HUMAN') {
            broadcastLog('SAC_MSG', mensagemTexto, { jid: jidBruto, nome: msg.pushName || numeroNormalizado });
            return;
        }

        if (session.mode === 'WAITING_CODE') {
            if (mensagemTexto.match(/^\d{4}$/)) {
                const pedidosRaw = await getPedidos();
                const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));
                const pacotesRaw = await getPacotes();
                const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
                
                const pedidoEncontrado = pedidos.find((p: any) => p.codigo_entrega === mensagemTexto);
                if (pedidoEncontrado) {
                    const pacoteDoPedido = pacotes.find((pac: any) => pac.pedidosIds.includes(pedidoEncontrado.id));
                    let status = "Seu pedido está em preparação na loja.";
                    if (pacoteDoPedido) {
                        if (pacoteDoPedido.status === 'EM_ROTA') {
                            status = `Seu pedido já saiu para entrega com o motoboy ${pacoteDoPedido.motoboy?.nome || 'designado'}.`;
                        } else if (pacoteDoPedido.status === 'PENDENTE_ACEITE') {
                            status = `Estamos aguardando a confirmação do motoboy ${pacoteDoPedido.motoboy?.nome || 'designado'} para iniciar a sua entrega.`;
                        }
                    }
                    await enviarMensagemWhatsApp(numeroCliente, `✅ Localizei! ${status}`, 'SISTEMA', 'status_pedido', 'BOT');
                    session.mode = 'BOT';
                } else {
                    await enviarMensagemWhatsApp(numeroCliente, "❌ Código não encontrado. Por favor, verifique e tente novamente.", 'SISTEMA', 'codigo_invalido', 'BOT');
                }
                return;
            }
        }

        // Passo C: Se não caiu em nenhuma das opções acima, a mensagem vai para a IA de auto-atendimento.
        console.log('[DEBUG] Mensagem não atrelada a motoboy. Enviando para IA de Auto-Atendimento...');
        const config = await getConfiguracoes();
        if (config.auto_responder) {
            try {
                console.log('[DEBUG] 🧠 Chamando motor da OpenAI (processarMensagemIA)...');
                const respostaIA = await processarMensagemIA(mensagemTexto);
                console.log(`[DEBUG] 🤖 Resposta gerada pela IA: "${respostaIA}"`);

                if (respostaIA.includes('[ACTION_TRACKING]')) {
                    session.mode = 'WAITING_CODE';
                    await enviarMensagemWhatsApp(numeroCliente, "Para localizar sua entrega, por favor, digite o código de 4 dígitos do seu pedido.", 'SISTEMA', 'pede_codigo', 'BOT');
                    return;
                }

                if (respostaIA.includes('[ACTION_HUMAN]')) {
                    session.mode = 'HUMAN';
                    broadcastLog('SAC_REQUEST', `Cliente [${msg.pushName || numeroNormalizado}] pediu para falar com um atendente.`, { jid: jidBruto, nome: msg.pushName || numeroNormalizado });
                    await enviarMensagemWhatsApp(numeroCliente, "Um de nossos atendentes já vai falar com você. Aguarde um instante.", 'SISTEMA', 'transfere_humano', 'BOT');
                    return;
                }
                
                console.log('[DEBUG] 📤 Disparando mensagem de volta para o WhatsApp...');
                await enviarMensagemWhatsApp(numeroCliente, respostaIA, 'SISTEMA', 'SISTEMA_AUTO_ATENDIMENTO', 'BOT');
                console.log('[DEBUG] ✅ Mensagem enviada com sucesso ao cliente!');

            } catch (error) {
                console.error('[ERRO FATAL] Falha na execução do Auto-Atendimento:', error);
            }
        }
    });
}

// =============================================================================
//                      DISPARO ATIVO (MODO FANTASMA)
// =============================================================================

export async function enviarMensagemWhatsApp(numero: string, texto: string, telegramId: string = 'SISTEMA', motoboyMessage: string = 'envio_sistema', motoboyName: string = 'CEIA', retryCount = 0): Promise<string | null> {
    try {
        // Se estiver conectando, segura a mensagem e tenta de novo a cada 2s (máx 10s)
        if (sessionStatus === 'CONNECTING' && retryCount < 5) {
            console.log(`[WHATSAPP] Aguardando inicialização do aparelho para disparar... (${retryCount + 1}/5)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return enviarMensagemWhatsApp(numero, texto, telegramId, motoboyMessage, motoboyName, retryCount + 1);
        }

        if (sessionStatus !== 'CONNECTED' || !sock) {
            console.error('[WHATSAPP] Tentativa de envio falhou: Sessão desconectada.');
            return null;
        }

        let numeroLimpo = normalizePhone(numero);

        // Evita bug do 5555 caso o número já venha com 55 do banco de dados/telegram
        if (numeroLimpo.startsWith('5555')) {
            numeroLimpo = numeroLimpo.substring(2);
        } else if (numeroLimpo.length === 10 || numeroLimpo.length === 11) {
            numeroLimpo = '55' + numeroLimpo;
        }

        let idEnvio = numeroLimpo + '@s.whatsapp.net';

        // O Segredo: Pergunta para o servidor do WhatsApp qual é o ID exato (resolve o 9º dígito)
        try {
            const query = await sock.onWhatsApp(numeroLimpo);
            if (query && query.length > 0 && query[0].exists) {
                idEnvio = query[0].jid;
            }
        } catch (e) {}

        await sock.sendPresenceUpdate('composing', idEnvio);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sock.sendPresenceUpdate('paused', idEnvio);

        const sentMsg: proto.IWebMessageInfo = await sock.sendMessage(idEnvio, { text: texto });
        const realJid = sentMsg.key.remoteJid;
        
        if (realJid && telegramId !== 'SISTEMA') {
            console.log(`[CACHE] Armazenando contexto para JID: ${realJid}`);
            contextCache.set(realJid, {
                telegramId: telegramId,
                motoboyName: motoboyName,
                lastMotoboyMessage: motoboyMessage,
                timestamp: Date.now()
            });
            setTimeout(() => {
                contextCache.delete(realJid);
            }, 15 * 60 * 1000); // 15 minutes TTL
        }

        return realJid;
    } catch (error) {
        console.error('Erro ao disparar WhatsApp nativo:', error);
        return null;
    }
}

// =============================================================================
//                           FUNÇÕES DA IA E RADAR
// =============================================================================
// (Mantidas exatamente iguais para não quebrar a sua lógica)

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
}

async function obterStatusLogistico(): Promise<string> {
    try {
        const config = await getConfiguracoes();
        const motoboys = await getMotoboysOnline();
        if (!motoboys || motoboys.length === 0) return 'No momento, todos os nossos motoboys estão em entrega ou offline.';
        const motoboyMaisRecente = motoboys.reduce((prev: any, current: any) => {
            return (new Date(prev.ultima_atualizacao) > new Date(current.ultima_atualizacao)) ? prev : current;
        });
        const distancia = calcularDistancia(config.lat, config.lng, motoboyMaisRecente.lat, motoboyMaisRecente.lng);
        return `Motoboy ${motoboyMaisRecente.nome} está a ${distancia}km de distância da sede.`;
    } catch (error) {
        return 'O sistema de rastreamento está sendo atualizado.';
    }
}

async function processarMensagemIA(mensagemCliente: string): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');

        const horariosFormatados = config.horarios ? Object.entries(config.horarios)
            .filter(([, val]: any) => val.on)
            .map(([dia, val]: any) => `${dia.charAt(0).toUpperCase() + dia.slice(1)}: ${val.abre} às ${val.fecha}`)
            .join(', ') : 'Não informado.';

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: `Você é o assistente virtual do estabelecimento ${config.nome || 'nosso restaurante'}. Nossas informações úteis: Endereço: ${config.endereco || 'Não informado'}. Horários: ${horariosFormatados}. Cardápio: ${config.link_cardapio || 'Não disponível online'}. REGRAS: Se o cliente quiser fazer um pedido, oriente a usar o link do cardápio. Se perguntar sobre entrega/pedido, retorne ESTRITAMENTE a tag: [ACTION_TRACKING]. Se exigir falar com um humano/atendente, retorne ESTRITAMENTE a tag: [ACTION_HUMAN]. Se perguntar algo fora de contexto (política, piadas), ignore ou diga que não pode ajudar.` },
                { role: 'user', content: mensagemCliente }
            ],
            temperature: 0.5,
        });
        return completion.choices[0].message?.content || 'Desculpe, tive um problema ao processar sua resposta.';
    } catch (error) {
        console.error('[ERRO OPENAI]', error);
        return 'Olá! Nosso sistema está passando por uma manutenção rápida.';
    }
}

export async function traduzirMotoboyParaCliente(mensagemMotoboy: string): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'Você é o filtro de comunicação da CEIA. Analise a mensagem do entregador. REGRAS: 1. Se a mensagem for apenas uma saudação (oi, olá, bom dia), uma confirmação vazia ou não contiver uma dúvida/problema real sobre a entrega, responda APENAS a palavra: IGNORAR. 2. Se a mensagem for uma dúvida ou aviso real (ex: portão fechado, endereço errado, campainha estragada), traduza para um aviso profissional ao cliente sem usar saudações ou assinaturas. 3. NUNCA invente que o entregador chegou se ele não disser explicitamente.' },
                { role: 'user', content: mensagemMotoboy }
            ],
            temperature: 0.7,
        });
        return completion.choices[0].message?.content || 'Estamos processando uma atualização sobre sua entrega. Um momento, por favor.';
    } catch (error) {
        return 'O sistema identificou uma breve lentidão na sua entrega. O parceiro já está ciente.';
    }
}

async function analisarRespostaComContextoIA(respostaCliente: string, contextos: (ChatContext & { originalJid: string })[]): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');

        const listaDeContextos = contextos
            .map(c => `telegramId: ${c.telegramId} | Motoboy: ${c.motoboyName} | Pergunta: "${c.lastMotoboyMessage}"`)
            .join('\n');

        const prompt = `Um cliente acaba de enviar a seguinte resposta: '${respostaCliente}'.\nTemos os seguintes motoboys aguardando retorno:\n${listaDeContextos}\n\nEssa resposta faz sentido para qual dessas perguntas? Responda ESTRITAMENTE com o 'telegramId' correspondente, ou retorne a palavra 'NAO' se a resposta não fizer sentido para nenhum dos contextos.`;

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: "Você é um roteador lógico. Analise a resposta do cliente e os contextos pendentes. Sua resposta deve ser apenas o 'telegramId' do motoboy correspondente ou a palavra 'NAO'." },
                { role: 'user', content: prompt }
            ],
            temperature: 0.0,
        });

        return completion.choices[0].message?.content || 'NAO';
    } catch (error) {
        console.error("Erro na análise de contexto da IA:", error);
        return 'NAO';
    }
}

async function resumirClienteParaMotoboy(mensagemCliente: string): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: "Você é o assistente de trânsito do entregador. Sua missão é ler o que o cliente escreveu e entregar apenas a instrução de ação em 5 ou 6 palavras no máximo. REGRAS CRÍTICAS: 1. NUNCA deixe o entregador sem resposta. 2. Se o cliente apenas agradeceu, disse 'ok' ou algo irrelevante, responda apenas: 'Ciente.'. 3. Foco total em: endereço, portão, quem vai receber ou tempo de espera." },
                { role: 'user', content: mensagemCliente }
            ],
            temperature: 0.5,
        });
        return completion.choices[0].message?.content || 'Cliente respondeu, verifique o histórico.';
    } catch (error) {
        return 'O cliente enviou uma mensagem. Verifique o chat se necessário.';
    }
}

async function resumirRespostaClienteParaMotoboy(respostaCliente: string): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: "Você é o rádio comunicador da frota. Traduza a mensagem do cliente em uma mensagem curta e técnica para o motoboy (máximo 6 palavras). NUNCA fale com o cliente. Saída esperada ex: 'Cliente confirmou, está ciente'." },
                { role: 'user', content: `O cliente disse: '${respostaCliente}'` }
            ],
            temperature: 0.2,
        });
        return completion.choices[0].message?.content || 'Cliente respondeu, verifique o histórico.';
    } catch (error) {
        return 'O cliente enviou uma mensagem. Verifique o chat se necessário.';
    }
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
    try {
        const config = await getConfiguracoes();
        const token = config.telegram_token || config.telegram_bot_token;
        if (!token) {
            broadcastLog('ERROR', 'Token do Telegram não configurado.');
            return;
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    } catch (error) {
        broadcastLog('ERROR', `Erro inesperado ao encaminhar mensagem para o Telegram: ${error}`);
    }
}
