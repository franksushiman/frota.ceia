process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection] Erro não tratado (processo mantido):', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException] Exceção não capturada (processo mantido):', err);
});

import { startServer } from './server';
import { iniciarWhatsApp } from './whatsapp/index';

async function bootstrap() {
    try {
        console.log('--- INICIANDO SISTEMA CEIA ---');
        await startServer();         // sobe o servidor (inclui initDatabase internamente)
        iniciarWhatsApp();           // WhatsApp só após o servidor estar no ar
        console.log('✅ Tudo pronto e operando!');
    } catch (error) {
        console.error('FALHA CRÍTICA NO BOOTSTRAP:', error);
        process.exit(1);
    }
}

bootstrap();
