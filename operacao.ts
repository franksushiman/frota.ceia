import { registrarEntrega, registrarLog } from './database';
import { broadcastMessage } from './logger';

export const rotasAtivas: any[] = [];

export function getRotasMotoboy(telegram_id: string) {
    return rotasAtivas.filter(r => r.telegram_id === telegram_id);
}

export function getRotaPeloCliente(telefoneCliente: string) {
    // Normaliza o número para conter apenas dígitos
    const numeroLimpo = telefoneCliente.replace(/\D/g, '');
    return rotasAtivas.find(r => r.pedido?.telefone_cliente?.replace(/\D/g, '') === numeroLimpo);
}

export async function processarBaixaPeloTelegram(telegram_id: string, codigo: string): Promise<boolean> {
    const idx = rotasAtivas.findIndex(r => r.telegram_id === telegram_id && r.pedido.codigo_entrega === codigo);
    if (idx > -1) {
        const rota = rotasAtivas[idx];
        await registrarEntrega(telegram_id, rota.pedido.taxa);
        rotasAtivas.splice(idx, 1);

        const payload = JSON.stringify({ tipo: 'BAIXA_PEDIDO', mensagem: 'Baixa pelo App', pedidoId: rota.pedido.id, data: new Date().toISOString() });
        broadcastMessage(payload);

        await registrarLog('FINANCEIRO', `Motoboy confirmou entrega via Telegram (Cod: ${codigo}).`);
        return true;
    }
    return false;
}
