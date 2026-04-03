import { FastifyInstance } from 'fastify';
import { registrarLog as dbRegistrarLog } from './database';

let app: FastifyInstance | null = null;

export function initLogger(fastifyApp: FastifyInstance) {
    app = fastifyApp;
}

export function broadcastMessage(payload: string) {
    if (app && app.websocketServer && app.websocketServer.clients) {
        app.websocketServer.clients.forEach(function (client: any) {
            if (client.readyState === 1) client.send(payload);
        });
    }
}

export const broadcastLog = async (tipo: string, mensagem: string, dadosExtras: any = {}) => {
    const payload = JSON.stringify({ tipo, mensagem, data: new Date().toISOString(), ...dadosExtras });
    await dbRegistrarLog(tipo, mensagem);
    broadcastMessage(payload);
    console.log(`[${tipo}] ${mensagem}`);
};
