import { BaileysProvider } from './baileys';
import { ProviderState } from './types';
import { getConfiguracoes } from '../database';
import OpenAI from 'openai';

export let qrCodeBase64: string | null = null;
export let sessionStatus: string = 'DISCONNECTED';

const providerState: ProviderState = {
    setStatus(s: string) { sessionStatus = s; },
    setQr(qr: string | null) { qrCodeBase64 = qr; }
};

const provider = new BaileysProvider();

export async function iniciarWhatsApp(): Promise<void> {
    try {
        await provider.connect(providerState);
    } catch (err) {
        console.error('[WhatsApp] Falha ao iniciar Baileys (servidor continua rodando):', err);
        providerState.setStatus('ERROR');
    }
}

export async function trocarNumeroWhatsApp(): Promise<void> {
    await provider.disconnect();
    const authPath = process.env.AUTH_PATH || 'auth_info_baileys';
    try {
        const fs = await import('fs');
        fs.rmSync(authPath, { recursive: true, force: true });
    } catch (_) {}
}

export function setClienteSAC(jid: string, ativo: boolean): void {
    provider.setClienteSAC(jid, ativo);
}

export async function enviarMensagemWhatsApp(
    numero: string,
    texto: string,
    telegramId: string = 'SISTEMA',
    motoboyMessage: string = 'envio_sistema',
    motoboyName: string = 'CEIA'
): Promise<string | null> {
    return provider.sendMessage(numero, texto, telegramId, motoboyMessage, motoboyName);
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
