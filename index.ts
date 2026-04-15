import { startServer } from './server';
import { initDatabase } from './database';
import { iniciarWhatsApp } from './whatsapp/index';

async function bootstrap() {
    try {
        console.log('--- INICIANDO SISTEMA CEIA ---');
        
        // 1. PRIMEIRO o banco
        await initDatabase();
        iniciarWhatsApp();
        
        // 2. DEPOIS o servidor
        await startServer();
        
        console.log('✅ Tudo pronto e operando!');
    } catch (error) {
        console.error('FALHA CRÍTICA NO BOOTSTRAP:', error);
        process.exit(1);
    }
}

bootstrap();
