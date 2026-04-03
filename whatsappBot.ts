import OpenAI from 'openai';
import { getConfiguracoes, getMotoboysOnline } from './database'; 
import { getRotaPeloCliente } from './operacao';
import { broadcastLog } from './logger';

// =============================================================================
//                      CONTROLE DE SESSÃO E CONEXÃO (EVOLUTION)
// =============================================================================

export let qrCodeBase64: string | null = null;
export let sessionStatus: string = 'DISCONNECTED';

// Configurações exatas do seu Docker v1.8.2
const EVOLUTION_API_URL = 'http://127.0.0.1:8081'; 
const INSTANCE_NAME = 'CeiaBot';
const GLOBAL_API_KEY = 'CEIA_CHAVE_MESTRA_2026'; 

/**
 * Cria a instância na Evolution API e solicita o QR Code com tratamento de erros
 */
export async function conectarEvolutionAPI() {
    try {
        qrCodeBase64 = null;
        sessionStatus = 'CONNECTING';
        broadcastLog('WHATSAPP', 'Verificando instância na Evolution API...');

        // 1. Tenta criar a instância (sem quebrar se ela já existir)
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
        
        // Se a API mandou o QR Code na criação, morre aqui
        if (createData && createData.qrcode && createData.qrcode.base64) {
            qrCodeBase64 = createData.qrcode.base64;
            broadcastLog('WHATSAPP', 'QR Code gerado com sucesso. Aguardando leitura...');
            return;
        }

        // 2. Se a instância já existia, puxamos na força via GET
        broadcastLog('WHATSAPP', 'Solicitando pareamento e gerando QR Code...');
        const connectRes = await fetch(`${EVOLUTION_API_URL}/instance/connect/${INSTANCE_NAME}`, {
            method: 'GET',
            headers: { 'apikey': GLOBAL_API_KEY }
        });

        const connectText = await connectRes.text();
        let connectData: any = {};
        try { connectData = JSON.parse(connectText); } catch (e) {}
        
        if (connectData.base64) {
            qrCodeBase64 = connectData.base64;
            broadcastLog('WHATSAPP', 'QR Code puxado com sucesso. Aguardando leitura...');
        } else if (connectData.instance && connectData.instance.state === 'open') {
            sessionStatus = 'CONNECTED';
            broadcastLog('WHATSAPP', 'O WhatsApp já está conectado!');
        } else {
            broadcastLog('ERROR', 'A API respondeu, mas não enviou o QR Code.');
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
            return "No momento, todos os nossos motoboys estão em entrega ou offline.";
        }

        const motoboyMaisRecente = motoboys.reduce((prev: any, current: any) => {
            return (new Date(prev.ultima_atualizacao) > new Date(current.ultima_atualizacao)) ? prev : current;
        });

        const distancia = calcularDistancia(config.lat, config.lng, motoboyMaisRecente.lat, motoboyMaisRecente.lng);
        return `Motoboy ${motoboyMaisRecente.nome} está a ${distancia}km de distância da sede.`;
    } catch (error) {
        return "O sistema de rastreamento está sendo atualizado.";
    }
}

// =============================================================================
//                         PROCESSAMENTO DE IA
// =============================================================================

async function processarMensagemIA(mensagemCliente: string): Promise<string> {
    try {
        const config = await getConfiguracoes();
        const radarStatus = await obterStatusLogistico();

        if (!config.openai_key) throw new Error("OpenAI Key não configurada.");

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { 
                    role: "system", 
                    content: `Você é a IA de logística CEIA. Seja prestativo, rápido e use este dado real do radar para informar o cliente: [${radarStatus}]. Se o cliente perguntar sobre o pedido, use a informação do radar de forma natural.`
                },
                { role: "user", content: mensagemCliente }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message?.content || "Desculpe, tive um problema ao processar sua resposta.";
    } catch (error) {
        return "Olá! Nosso sistema está passando por uma manutenção rápida.";
    }
}

/**
 * Envia uma mensagem para um chat específico no Telegram.
 */
async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
    try {
        const config = await getConfiguracoes();
        // Assumindo que a chave do token está em 'telegram_token' ou 'telegram_bot_token'
        const token = config.telegram_token || config.telegram_bot_token;
        
        if (!token) {
            broadcastLog('ERROR', 'Token do Telegram não configurado. Não é possível encaminhar mensagem do cliente.');
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

// =============================================================================
//                           WEBHOOK HANDLER
// =============================================================================

export async function handleWhatsAppWebhook(payload: any) {
    try {
        const numeroCliente = payload.data?.key?.remoteJid;
        if (!numeroCliente) return;

        const mensagemTexto = payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text;
        if (!mensagemTexto || payload.data?.key?.fromMe) return;

        broadcastLog('WHATSAPP', `Recebido de [${numeroCliente.split('@')[0]}]: ${mensagemTexto}`);

        // Tenta encontrar uma rota ativa para este cliente e encaminhar a mensagem para o motoboy
        const rota = getRotaPeloCliente(numeroCliente.split('@')[0]);
        if (rota && rota.telegram_id) {
            const mensagemParaMotoboy = `💬 Cliente do pedido #${rota.pedido.id} diz:\n\n"${mensagemTexto}"`;
            await sendTelegramMessage(rota.telegram_id, mensagemParaMotoboy);
            broadcastLog('TELEGRAM', `Mensagem do cliente ${numeroCliente.split('@')[0]} encaminhada para o motoboy.`);
            return; // Impede a IA de responder quando a mensagem é para o motoboy
        }

        const respostaIA = await processarMensagemIA(mensagemTexto);

        broadcastLog('WHATSAPP', `Enviando resposta IA para ${numeroCliente.split('@')[0]}...`);
        
        // CORREÇÃO: Payload atualizado para o formato Evolution 1.8.2
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': GLOBAL_API_KEY
            },
            body: JSON.stringify({
                number: numeroCliente,
                options: { delay: 1200, presence: "composing" }, // Dá aquele toque de "digitando..."
                textMessage: { text: respostaIA }
            })
        });

        broadcastLog('SUCCESS', `Mensagem enviada com sucesso para ${numeroCliente.split('@')[0]}`);

    } catch (error) {
        console.error("Erro no Webhook Handler:", error);
        broadcastLog('ERROR', 'Falha ao processar e enviar mensagem pelo Webhook.');
    }
}

// =============================================================================
//                      DISPARO ATIVO (MODO FANTASMA)
// =============================================================================

export async function enviarMensagemWhatsApp(numero: string, texto: string): Promise<boolean> {
    try {
        // CORREÇÃO: Payload atualizado para o formato Evolution 1.8.2
        const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': GLOBAL_API_KEY
            },
            body: JSON.stringify({
                number: numero, 
                options: { delay: 1200, presence: "composing" }, // Fica "digitando..." por 1 segundinho pra ficar natural
                textMessage: { text: texto }
            })
        });

        if (!res.ok) {
            const erroDetalhado = await res.text();
            console.error("A API da Evolution recusou o envio:", erroDetalhado);
            throw new Error('Falha na resposta da API Evolution');
        }
        
        return true;
    } catch (error) {
        console.error("Erro ao disparar WhatsApp:", error);
        return false;
    }
}
