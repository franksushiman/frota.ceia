import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import OpenAI, { toFile } from 'openai';
import fs from 'fs';

import { getConfiguracoes, getMotoboysOnline } from './database';
import { getRotaPeloCliente } from './operacao';
import { broadcastLog } from './logger';

// =============================================================================
//                      CONTROLE DE SESSÃO E CONEXÃO (BAILEYS)
// =============================================================================

export let qrCodeBase64: string | null = null;
export let sessionStatus: string = 'DISCONNECTED';
let sock: any = null;

function normalizePhone(input: string): string {
    if (!input) return '';
    return input.includes('@') ? input.split('@')[0] : input.replace(/\D/g, '');
}

export async function iniciarWhatsApp() {
    sessionStatus = 'CONNECTING';
    qrCodeBase64 = null;
    broadcastLog('WHATSAPP', 'Iniciando conexão nativa com Baileys...');

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Continua mostrando no console por segurança
        browser: Browsers.macOS('Desktop'), // Simula o WhatsApp Web do Mac para evitar banimentos
        syncFullHistory: false // Deixa mais rápido, não puxa mensagens antigas
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
        if (m.type !== 'notify') return; // Filtra apenas mensagens novas reais

        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Ignora os seus próprios envios

        const numeroCliente = msg.key.remoteJid;
        if (!numeroCliente || numeroCliente === 'status@broadcast') return;

        const numeroNormalizado = normalizePhone(numeroCliente);

        // Marca a mensagem como lida (Tira o "1" da tela do celular)
        await sock.readMessages([msg.key]);

        const isAudio = !!(msg.message.audioMessage || msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage);
        const location = msg.message.locationMessage;
        let mensagemTexto = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';

        // Tratamento de Localização
        if (location) {
            const rota = await getRotaPeloCliente(numeroNormalizado);
            if (rota && rota.telegram_id) {
                const mapsLink = `https://www.google.com/maps?q=$${location.degreesLatitude},${location.degreesLongitude}`;
                await sendTelegramMessage(rota.telegram_id, `📍 Localização enviada pelo cliente: ${mapsLink}`);
                return;
            }
        }

        // Tratamento e Transcrição de Áudio (Agora mais rápido com Baileys)
        if (isAudio) {
            broadcastLog('WHATSAPP', 'Áudio recebido, iniciando transcrição...');
            try {
                const config = await getConfiguracoes();
                if (!config.openai_key) throw new Error('OpenAI Key não configurada para transcrição.');
                
                // Baixa o áudio diretamente na memória sem precisar da Evolution
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: undefined });
                const file = await toFile(buffer as Buffer, 'audio.ogg', { type: 'audio/ogg' });
        
                const openai = new OpenAI({ apiKey: config.openai_key });
                const transcription = await openai.audio.transcriptions.create({
                    file,
                    model: 'whisper-1',
                });
                mensagemTexto = transcription.text || '';
            } catch (err) {
                console.error("Erro na transcrição:", err);
                broadcastLog('ERROR', 'Falha no processo de transcrição de áudio.');
                return;
            }
        }

        if (!mensagemTexto) return;

        broadcastLog('WHATSAPP', `Recebido de [${numeroNormalizado}]: ${mensagemTexto}`);

        // Redirecionamento da mensagem (Para o Motoboy ou para a IA)
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
    });
}

// =============================================================================
//                      DISPARO ATIVO (MODO FANTASMA)
// =============================================================================

export async function enviarMensagemWhatsApp(numero: string, texto: string): Promise<boolean> {
    try {
        if (sessionStatus !== 'CONNECTED' || !sock) {
            console.error('[WHATSAPP] Tentativa de envio falhou: Sessão não está conectada.');
            return false;
        }

        let idEnvio = numero;
        // O Baileys exige o sufixo @s.whatsapp.net para envios
        if (!idEnvio.includes('@s.whatsapp.net')) {
            idEnvio = normalizePhone(numero) + '@s.whatsapp.net';
        }

        // Simulando que o robô está digitando para ficar natural
        await sock.sendPresenceUpdate('composing', idEnvio);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Aguarda 1.5s
        await sock.sendPresenceUpdate('paused', idEnvio);

        await sock.sendMessage(idEnvio, { text: texto });
        return true;
    } catch (error) {
        console.error('Erro ao disparar WhatsApp nativo:', error);
        return false;
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
        const radarStatus = await obterStatusLogistico();
        if (!config.openai_key) throw new Error('OpenAI Key não configurada.');

        const openai = new OpenAI({ apiKey: config.openai_key });
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: `Você é a interface automática da CEIA. Seja prestativo, rápido e use os dados do radar: [${radarStatus}]. NUNCA use saudações formais, não assine a mensagem e não peça para o cliente entrar em contato com o restaurante.` },
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
