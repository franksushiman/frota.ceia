import OpenAI, { toFile } from 'openai';
import { getConfiguracoes, getMotoboysOnline } from './database'; 
import { getRotaPeloCliente } from './operacao';
import { broadcastLog } from './logger';

// =============================================================================
//                      CONTROLE DE SESSÃO E CONEXÃO (EVOLUTION)
// =============================================================================

export let qrCodeBase64: string | null = null;
export let sessionStatus: string = 'DISCONNECTED';

// Configurações exatas do seu Docker v1.8.2
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8081'; 
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

        const appUrl = process.env.APP_URL || "http://localhost:3000";
        const webhookConfig = {
            webhook: {
                url: `${appUrl}/api/whatsapp/webhook`, 
                byEvents: false,
                base64: false,
                events: ["MESSAGES_UPSERT"]
            }
        };

        await fetch(`${EVOLUTION_API_URL}/webhook/set/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': GLOBAL_API_KEY },
            body: JSON.stringify(webhookConfig)
        });
        broadcastLog('WHATSAPP', 'Webhook de recepção configurado na Evolution API.');

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
                    content: `Você é a interface automática da CEIA. Seja prestativo, rápido e use os dados do radar: [${radarStatus}]. NUNCA use saudações formais, não assine a mensagem e não peça para o cliente entrar em contato com o restaurante.`
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

export async function traduzirMotoboyParaCliente(mensagemMotoboy: string): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error("OpenAI Key não configurada.");

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { 
                    role: "system", 
                    content: "Você é o filtro de comunicação da CEIA. Analise a mensagem do entregador. REGRAS: 1. Se a mensagem for apenas uma saudação (oi, olá, bom dia), uma confirmação vazia ou não contiver uma dúvida/problema real sobre a entrega, responda APENAS a palavra: IGNORAR. 2. Se a mensagem for uma dúvida ou aviso real (ex: portão fechado, endereço errado, campainha estragada), traduza para um aviso profissional ao cliente sem usar saudações ou assinaturas. 3. NUNCA invente que o entregador chegou se ele não disser explicitamente."
                },
                { role: "user", content: mensagemMotoboy }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message?.content || "Estamos processando uma atualização sobre sua entrega. Um momento, por favor.";
    } catch (error) {
        return "O sistema identificou uma breve lentidão na sua entrega. O parceiro já está ciente.";
    }
}

async function resumirClienteParaMotoboy(mensagemCliente: string): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error("OpenAI Key não configurada.");

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { 
                    role: "system", 
                    content: "Você é o assistente de trânsito do entregador. Sua missão é ler o que o cliente escreveu e entregar apenas a instrução de ação em 5 ou 6 palavras no máximo. REGRAS CRÍTICAS: 1. NUNCA deixe o entregador sem resposta. 2. Se o cliente apenas agradeceu, disse 'ok' ou algo irrelevante, responda apenas: 'Ciente.'. 3. Foco total em: endereço, portão, quem vai receber ou tempo de espera."
                },
                { role: "user", content: mensagemCliente }
            ],
            temperature: 0.5,
        });

        return completion.choices[0].message?.content || "Cliente respondeu, verifique o histórico.";
    } catch (error) {
        return "O cliente enviou uma mensagem. Verifique o chat se necessário.";
    }
}

async function transcreverAudioWhatsApp(messageData: any): Promise<string> {
    try {
        const config = await getConfiguracoes();
        if (!config.openai_key) throw new Error("OpenAI Key não configurada para transcrição.");

        const res = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': GLOBAL_API_KEY },
            body: JSON.stringify({ message: messageData })
        });

        if (!res.ok) throw new Error("Falha ao buscar base64 da mídia na Evolution API.");

        const mediaData = await res.json();
        const base64Data = mediaData.base64;
        if (!base64Data) throw new Error("Base64 não encontrado na resposta da API.");

        const buffer = Buffer.from(base64Data, 'base64');
        const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' });
        
        const openai = new OpenAI({ apiKey: config.openai_key });
        const transcription = await openai.audio.transcriptions.create({
            file,
            model: 'whisper-1',
        });

        return transcription.text || "";

    } catch (error) {
        console.error("Erro ao transcrever áudio:", error);
        broadcastLog('ERROR', 'Falha no processo de transcrição de áudio.');
        return ""; // Retorna string vazia em caso de falha para não quebrar o fluxo
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
        const numeroCliente = payload.data?.key?.remoteJid || payload.data?.message?.key?.remoteJid;
        if (!numeroCliente) return;

        // Marca a mensagem como lida na Evolution API para não ficar pendente
        if (payload.data?.key?.id && !payload.data?.key?.fromMe) {
            await fetch(`${EVOLUTION_API_URL}/chat/read/${INSTANCE_NAME}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': GLOBAL_API_KEY },
                body: JSON.stringify({ number: numeroCliente.split('@')[0] })
            });
        }

        // Se o cliente enviar uma localização, repassa o link do Maps direto para o motoboy
        const location = payload.data?.message?.locationMessage;
        if (location) {
            const rota = await getRotaPeloCliente(numeroCliente.split('@')[0]);
            if (rota && rota.telegram_id) {
                const mapsLink = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
                await sendTelegramMessage(rota.telegram_id, `📍 Localização enviada pelo cliente: ${mapsLink}`);
                return;
            }
        }

        let mensagemTexto = payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text;
        const isAudio = !!payload.data?.message?.audioMessage || !!payload.data?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;
        
        // Se for áudio, transcreve e o resultado se torna a mensagem principal a ser processada
        if (isAudio) {
            broadcastLog('WHATSAPP', 'Áudio recebido, iniciando transcrição...');
            mensagemTexto = await transcreverAudioWhatsApp(payload.data);
        }

        // Se após tudo não houver texto (nem original, nem transcrito) ou a msg for nossa, encerra.
        if (!mensagemTexto || payload.data?.key?.fromMe) return;

        broadcastLog('WHATSAPP', `Recebido de [${numeroCliente.split('@')[0]}]: ${mensagemTexto}`);

        // Tenta encontrar uma rota ativa. Se encontrar, resume a mensagem para o motoboy.
        const rota = await getRotaPeloCliente(numeroCliente.split('@')[0]);
        if (rota && rota.telegram_id) {
            const resumo = await resumirClienteParaMotoboy(mensagemTexto);
            if (isAudio) {
                await sendTelegramMessage(rota.telegram_id, "🎙️ Áudio do Cliente (Resumo):\n" + resumo);
            } else {
                await sendTelegramMessage(rota.telegram_id, `⚠️ Retorno do Cliente: ${resumo}`);
            }
            broadcastLog('TELEGRAM', `Resumo do cliente ${numeroCliente.split('@')[0]} enviado ao motoboy.`);
            return;
        }

        // Se não houver rota, entra no fluxo de atendimento padrão
        const config = await getConfiguracoes();

        // Gatilho do Cardápio: Sempre ativo
        if (mensagemTexto.toLowerCase().includes('cardapio') || mensagemTexto.toLowerCase().includes('menu')) {
            if (config.link_cardapio) {
                await enviarMensagemWhatsApp(numeroCliente, config.link_cardapio);
                broadcastLog('WHATSAPP', `Link do cardápio enviado para ${numeroCliente.split('@')[0]}.`);
            }
            return; // Encerra aqui após enviar o cardápio
        }

        // IA Institucional: Apenas se o auto-responder estiver ligado
        if (config.auto_responder) {
            const respostaIA = await processarMensagemIA(mensagemTexto);
            broadcastLog('WHATSAPP', `Enviando resposta IA para ${numeroCliente.split('@')[0]}...`);
            await enviarMensagemWhatsApp(numeroCliente, respostaIA);
            broadcastLog('SUCCESS', `Mensagem enviada com sucesso para ${numeroCliente.split('@')[0]}`);
        }

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
                options: { delay: 1200, presence: "composing" }, 
                textMessage: { text: texto } 
            })
        });

        if (!res.ok) {
            const erroDetalhado = await res.text();
            console.error("Erro Evolution:", erroDetalhado);
            throw new Error('Falha na resposta da API Evolution');
        }
        
        return true;
    } catch (error) {
        console.error("Erro ao disparar WhatsApp:", error);
        return false;
    }
}
