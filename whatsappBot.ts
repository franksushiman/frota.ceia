import OpenAI, { toFile } from 'openai';
import { getConfiguracoes, getMotoboysOnline } from './database';
import { getRotaPeloCliente } from './operacao';
import { broadcastLog } from './logger';

// =============================================================================
//                      CONTROLE DE SESSÃO E CONEXÃO (EVOLUTION)
// =============================================================================

export let qrCodeBase64: string | null = null;
export let sessionStatus: string = 'DISCONNECTED';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8081';
const INSTANCE_NAME = 'CeiaBot';
const GLOBAL_API_KEY = 'CEIA_CHAVE_MESTRA_2026';

function getPublicAppUrl(): string | null {
    const publicAppUrl = process.env.PUBLIC_APP_URL?.trim();

    if (!publicAppUrl) {
        return null;
    }

    return publicAppUrl.replace(/\/+$/, '');
}

function extractPublicUrlFromEvolutionResponse(data: any): string | null {
    const possibleValues = [
        data?.serverUrl,
        data?.url,
        data?.webhook,
        data?.webhookUrl,
        data?.instance?.serverUrl,
        data?.instance?.url,
        data?.instance?.webhook,
        data?.instance?.webhookUrl
    ];

    for (const value of possibleValues) {
        if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
            return value.trim().replace(/\/+$/, '');
        }
    }

    return null;
}

function tryParseJson(value: any): any {
    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function getWebhookData(payload: any): any {
    const parsedPayload = tryParseJson(payload);

    if (!parsedPayload) return null;

    return (
        parsedPayload?.data?.data ||
        parsedPayload?.data ||
        parsedPayload?.payload ||
        parsedPayload
    );
}

function getWebhookKey(data: any): any {
    return (
        data?.key ||
        data?.message?.key ||
        data?.messages?.[0]?.key ||
        data?.data?.key ||
        data?.messages?.[0]?.message?.key ||
        null
    );
}

function getRemoteJid(data: any, key: any): string | null {
    return (
        key?.remoteJid ||
        data?.remoteJid ||
        data?.message?.key?.remoteJid ||
        data?.messages?.[0]?.key?.remoteJid ||
        data?.messages?.[0]?.message?.key?.remoteJid ||
        data?.sender ||
        data?.jid ||
        data?.participant ||
        null
    );
}

function getMessageContent(data: any): any {
    return (
        data?.message ||
        data?.messages?.[0]?.message ||
        data?.data?.message ||
        data?.msg ||
        data?.text?.message ||
        null
    );
}

function getMessageText(message: any, data?: any): string {
    return (
        message?.conversation ||
        message?.extendedTextMessage?.text ||
        message?.imageMessage?.caption ||
        message?.videoMessage?.caption ||
        message?.documentMessage?.caption ||
        message?.buttonsResponseMessage?.selectedButtonId ||
        message?.buttonsResponseMessage?.selectedDisplayText ||
        message?.listResponseMessage?.title ||
        message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        message?.templateButtonReplyMessage?.selectedId ||
        message?.templateButtonReplyMessage?.selectedDisplayText ||
        message?.text ||
        data?.text?.message ||
        data?.text ||
        data?.body ||
        data?.messageType === 'conversation' ? data?.message?.conversation || '' : ''
    );
}

function isAudioMessage(message: any, data?: any): boolean {
    return !!message?.audioMessage || !!message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage || !!data?.audioMessage;
}

function getLocationMessage(message: any, data?: any): any {
    return message?.locationMessage || data?.locationMessage || null;
}

function normalizePhone(input: string): string {
    if (!input) return '';
    return input.includes('@') ? input.split('@')[0] : input.replace(/\D/g, '');
}

/**
 * Cria a instância na Evolution API e solicita o QR Code com tratamento de erros
 */
export async function conectarEvolutionAPI() {
    try {
        qrCodeBase64 = null;
        sessionStatus = 'CONNECTING';
        broadcastLog('WHATSAPP', 'Verificando instância na Evolution API...');

        let evolutionPublicUrl: string | null = null;

        const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': GLOBAL_API_KEY },
            body: JSON.stringify({
                instanceName: INSTANCE_NAME,
                qrcode: true
            })
        });

        const createText = await createRes.text();
        let createData: any = {};
        try { createData = JSON.parse(createText); } catch (e) {}

        evolutionPublicUrl = extractPublicUrlFromEvolutionResponse(createData);

        if (createData && createData.qrcode && createData.qrcode.base64) {
            qrCodeBase64 = createData.qrcode.base64;
            broadcastLog('WHATSAPP', 'QR Code gerado com sucesso. Aguardando leitura...');
        } else {
            broadcastLog('WHATSAPP', 'Solicitando pareamento e gerando QR Code...');
            const connectRes = await fetch(`${EVOLUTION_API_URL}/instance/connect/${INSTANCE_NAME}`, {
                method: 'GET',
                headers: { 'apikey': GLOBAL_API_KEY }
            });

            const connectText = await connectRes.text();
            let connectData: any = {};
            try { connectData = JSON.parse(connectText); } catch (e) {}

            evolutionPublicUrl = evolutionPublicUrl || extractPublicUrlFromEvolutionResponse(connectData);

            if (connectData.base64) {
                qrCodeBase64 = connectData.base64;
                broadcastLog('WHATSAPP', 'QR Code puxado com sucesso. Aguardando leitura...');
            } else if (connectData.instance && connectData.instance.state === 'open') {
                sessionStatus = 'CONNECTED';
                broadcastLog('WHATSAPP', 'O WhatsApp já está conectado!');
            } else {
                broadcastLog('ERROR', 'A API respondeu, mas não enviou o QR Code.');
            }
        }

        const publicAppUrl = getPublicAppUrl() || evolutionPublicUrl;

        if (!publicAppUrl) {
            broadcastLog('ERROR', 'PUBLIC_APP_URL não configurada e nenhuma URL pública foi identificada automaticamente. O webhook do WhatsApp não pode ser registrado sem uma URL pública acessível.');
            return;
        }

        const webhookUrl = `${publicAppUrl}/api/whatsapp/webhook`;
        const webhookConfig = {
            webhook: {
                url: webhookUrl,
                byEvents: false,
                base64: true,
                readMessage: true,
                events: ['MESSAGES_UPSERT']
            }
        };

        broadcastLog('WHATSAPP', `Configurando webhook na Evolution API: ${webhookUrl}`);

        const webhookRes = await fetch(`${EVOLUTION_API_URL}/webhook/set/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': GLOBAL_API_KEY },
            body: JSON.stringify(webhookConfig)
        });

        const webhookText = await webhookRes.text();

        if (!webhookRes.ok) {
            broadcastLog('ERROR', `Falha ao configurar webhook na Evolution API. Status: ${webhookRes.status}. Resposta: ${webhookText}`);
            return;
        }

        broadcastLog('WHATSAPP', `Webhook de recepção configurado com sucesso: ${webhookUrl}`);
        if (webhookText) {
            broadcastLog('WHATSAPP', `Resposta da Evolution API ao configurar webhook: ${webhookText}`);
        }

    } catch (error) {
        broadcastLog('ERROR', 'Falha fatal ao comunicar com a Evolution API.');
        sessionStatus = 'DISCONNECTED';
    }
}

// =============================================================================
//                             RADAR LOGÍSTICO
// =============================================================================

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
}

async function obterStatusLogistico(): Promise<string> {
    try {
        const config = await getConfiguracoes();
        const motoboys = await getMotoboysOnline();

        if (!motoboys || motoboys.length === 0) {
            return 'No momento, todos os nossos motoboys estão em entrega ou offline.';
        }

        const motoboyMaisRecente = motoboys.reduce((prev: any, current: any) => {
            return (new Date(prev.ultima_atualizacao) > new Date(current.ultima_atualizacao)) ? prev : current;
        });

        const distancia = calcularDistancia(config.lat, config.lng, motoboyMaisRecente.lat, motoboyMaisRecente.lng);
        return `Motoboy ${motoboyMaisRecente.nome} está a ${distancia}km de distância da sede.`;
    } catch (error) {
        return 'O sistema de rastreamento está sendo atualizado.';
    }
}

// =============================================================================
//                         PROCESSAMENTO DE IA
// =============================================================================

async function processarMensagemIA(mensagemCliente: string): Promise<string> {
    try {
        const config = await getConfiguracoes();
        const radarStatus = await obterStatusLogistico();

        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: `Você é a interface automática da CEIA. Seja prestativo, rápido e use os dados do radar: [${radarStatus}]. NUNCA use saudações formais, não assine a mensagem e não peça para o cliente entrar em contato com o restaurante.`
                },
                { role: 'user', content: mensagemCliente }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message?.content || 'Desculpe, tive um problema ao processar sua resposta.';
    } catch (error) {
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
                {
                    role: 'system',
                    content: 'Você é o filtro de comunicação da CEIA. Analise a mensagem do entregador. REGRAS: 1. Se a mensagem for apenas uma saudação (oi, olá, bom dia), uma confirmação vazia ou não contiver uma dúvida/problema real sobre a entrega, responda APENAS a palavra: IGNORAR. 2. Se a mensagem for uma dúvida ou aviso real (ex: portão fechado, endereço errado, campainha estragada), traduza para um aviso profissional ao cliente sem usar saudações ou assinaturas. 3. NUNCA invente que o entregador chegou se ele não disser explicitamente.'
                },
                { role: 'user', content: mensagemMotoboy }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message?.content || 'Estamos processando uma atualização sobre sua entrega. Um momento, por favor.';
    } catch (error) {
        return 'O sistema identificou uma breve lentidão na sua entrega. O parceiro já está ciente.';
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
                {
                    role: 'system',
                    content: "Você é o assistente de trânsito do entregador. Sua missão é ler o que o cliente escreveu e entregar apenas a instrução de ação em 5 ou 6 palavras no máximo. REGRAS CRÍTICAS: 1. NUNCA deixe o entregador sem resposta. 2. Se o cliente apenas agradeceu, disse 'ok' ou algo irrelevante, responda apenas: 'Ciente.'. 3. Foco total em: endereço, portão, quem vai receber ou tempo de espera."
                },
                { role: 'user', content: mensagemCliente }
            ],
            temperature: 0.5,
        });

        return completion.choices[0].message?.content || 'Cliente respondeu, verifique o histórico.';
    } catch (error) {
        return 'O cliente enviou uma mensagem. Verifique o chat se necessário.';
    }
}

async function transcreverAudioWhatsApp(messageData: any): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error('OpenAI Key não configurada para transcrição.');

        const res = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': GLOBAL_API_KEY },
            body: JSON.stringify({ message: messageData })
        });

        if (!res.ok) throw new Error('Falha ao buscar base64 da mídia na Evolution API.');

        const mediaData = await res.json();
        const base64Data = mediaData.base64;
        if (!base64Data) throw new Error('Base64 não encontrado na resposta da API.');

        const buffer = Buffer.from(base64Data, 'base64');
        const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' });

        const openai = new OpenAI({ apiKey: config.openai_key });
        const transcription = await openai.audio.transcriptions.create({
            file,
            model: 'whisper-1',
        });

        return transcription.text || '';

    } catch (error) {
        console.error('Erro ao transcrever áudio:', error);
        broadcastLog('ERROR', 'Falha no processo de transcrição de áudio.');
        return '';
    }
}

/**
 * Envia uma mensagem para um chat específico no Telegram.
 */
async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
    try {
        const config = await getConfiguracoes();
        const token = config.telegram_token || config.telegram_bot_token;

        if (!token) {
            broadcastLog('ERROR', 'Token do Telegram não configurado. Não é possível encaminhar mensagem do cliente.');
            return;
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });

        if (!res.ok) {
            const errorBody = await res.json();
            broadcastLog('ERROR', `API do Telegram retornou erro ao tentar encaminhar msg: ${JSON.stringify(errorBody)}`);
        }

    } catch (error) {
        broadcastLog('ERROR', `Erro inesperado ao encaminhar mensagem para o Telegram: ${error}`);
    }
}

// =============================================================================
//                           WEBHOOK HANDLER
// =============================================================================

export async function handleWhatsAppWebhook(payload: any) {
    try {
        console.log('🔔 [WEBHOOK] Bateu no webhook! Recebendo dados...');

        const data = getWebhookData(payload);
        const key = getWebhookKey(data);
        const numeroCliente = getRemoteJid(data, key);
        const message = getMessageContent(data);

        if (!data) {
            broadcastLog('ERROR', 'Webhook recebido sem payload utilizável.');
            return;
        }

        if (!numeroCliente) {
            broadcastLog('WHATSAPP', 'Webhook recebido sem remoteJid. Evento ignorado.');
            return;
        }

        if (key?.id && !key?.fromMe) {
            await fetch(`${EVOLUTION_API_URL}/chat/read/${INSTANCE_NAME}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': GLOBAL_API_KEY },
                body: JSON.stringify({ number: normalizePhone(numeroCliente) })
            });
        }

        const location = getLocationMessage(message, data);
        if (location) {
            const rota = await getRotaPeloCliente(normalizePhone(numeroCliente));
            if (rota && rota.telegram_id) {
                const mapsLink = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
                await sendTelegramMessage(rota.telegram_id, `📍 Localização enviada pelo cliente: ${mapsLink}`);
                return;
            }
        }

        let mensagemTexto = getMessageText(message, data);
        const isAudio = isAudioMessage(message, data);

        if (isAudio) {
            broadcastLog('WHATSAPP', 'Áudio recebido, iniciando transcrição...');
            mensagemTexto = await transcreverAudioWhatsApp(data);
        }

        if (!mensagemTexto || key?.fromMe) {
            if (!mensagemTexto) {
                broadcastLog('WHATSAPP', `Webhook de ${normalizePhone(numeroCliente)} sem texto aproveitável. Evento ignorado.`);
            }
            return;
        }

        const numeroNormalizado = normalizePhone(numeroCliente);

        broadcastLog('WHATSAPP', `Recebido de [${numeroNormalizado}]: ${mensagemTexto}`);

        const rota = await getRotaPeloCliente(numeroNormalizado);
        if (rota && rota.telegram_id) {
            const resumo = await resumirClienteParaMotoboy(mensagemTexto);
            if (isAudio) {
                await sendTelegramMessage(rota.telegram_id, '🎙️ Áudio do Cliente (Resumo):\n' + resumo);
            } else {
                await sendTelegramMessage(rota.telegram_id, `⚠️ Retorno do Cliente: ${resumo}`);
            }
            broadcastLog('TELEGRAM', `Resumo do cliente ${numeroNormalizado} enviado ao motoboy.`);
            return;
        }

        const config = await getConfiguracoes();

        if (mensagemTexto.toLowerCase().includes('cardapio') || mensagemTexto.toLowerCase().includes('menu')) {
            if (config.link_cardapio) {
                await enviarMensagemWhatsApp(numeroCliente, config.link_cardapio);
                broadcastLog('WHATSAPP', `Link do cardápio enviado para ${numeroNormalizado}.`);
            }
            return;
        }

        if (config.auto_responder) {
            const respostaIA = await processarMensagemIA(mensagemTexto);
            broadcastLog('WHATSAPP', `Enviando resposta IA para ${numeroNormalizado}...`);
            await enviarMensagemWhatsApp(numeroCliente, respostaIA);
            broadcastLog('SUCCESS', `Mensagem enviada com sucesso para ${numeroNormalizado}`);
        }

    } catch (error) {
        console.error('Erro no Webhook Handler:', error);
        broadcastLog('ERROR', 'Falha ao processar e enviar mensagem pelo Webhook.');
    }
}

// =============================================================================
//                      DISPARO ATIVO (MODO FANTASMA)
// =============================================================================

export async function enviarMensagemWhatsApp(numero: string, texto: string): Promise<boolean> {
    try {
        const numeroNormalizado = normalizePhone(numero);

        const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': GLOBAL_API_KEY
            },
            body: JSON.stringify({
                number: numeroNormalizado,
                options: { delay: 1200, presence: 'composing' },
                textMessage: { text: texto }
            })
        });

        if (!res.ok) {
            const erroDetalhado = await res.text();
            console.error('Erro Evolution:', erroDetalhado);
            throw new Error('Falha na resposta da API Evolution');
        }

        return true;
    } catch (error) {
        console.error('Erro ao disparar WhatsApp:', error);
        return false;
    }
}
