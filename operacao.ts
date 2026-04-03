import { registrarEntrega, registrarLog, getPacotes, getPedidos, savePacote, deletePacote, deletePedido } from './database';
import { broadcastMessage } from './logger';

async function getRotasAtivas() {
    const pacotesRaw = await getPacotes();
    const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
    const pedidosRaw = await getPedidos();
    const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));

    const ativas: any[] = [];
    const pacotesAtivos = pacotes.filter((p: any) => p.status === 'PENDENTE_ACEITE' || p.status === 'EM_ROTA');
    
    for (const pacote of pacotesAtivos) {
        if (pacote.motoboy) {
            for (const pedidoId of pacote.pedidosIds) {
                const pedido = pedidos.find((p: any) => p.id === pedidoId);
                if (pedido) {
                    ativas.push({
                        pacoteId: pacote.id,
                        telegram_id: pacote.motoboy.telegram_id,
                        pedido: pedido
                    });
                }
            }
        }
    }
    return ativas;
}

export async function getRotasMotoboy(telegram_id: string) {
    const rotas = await getRotasAtivas();
    return rotas.filter(r => r.telegram_id === telegram_id);
}

export async function getRotaPeloCliente(telefoneCliente: string) {
    const numeroLimpo = telefoneCliente.replace(/\D/g, '');
    const rotas = await getRotasAtivas();
    return rotas.find(r => {
        const telBanco = (r.pedido?.telefone || r.pedido?.telefone_cliente || r.pedido?.whatsapp || '').replace(/\D/g, '');
        if (!telBanco) return false;
        // O endsWith garante que 5531999999999 dê match com 31999999999
        return numeroLimpo.endsWith(telBanco) || telBanco.endsWith(numeroLimpo);
    });
}

export async function processarBaixaPeloTelegram(telegram_id: string, codigo: string): Promise<boolean> {
    const rotas = await getRotasAtivas();
    const rota = rotas.find(r => r.telegram_id === telegram_id && r.pedido.codigo_entrega === codigo);

    if (rota) {
        await registrarEntrega(telegram_id, rota.pedido.taxa);
        
        const pacotesRaw = await getPacotes();
        const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
        const pacote = pacotes.find((p: any) => p.id === rota.pacoteId);

        if (pacote) {
            pacote.pedidosIds = pacote.pedidosIds.filter((id: string) => id !== rota.pedido.id);
            if (pacote.pedidosIds.length === 0) {
                await deletePacote(pacote.id);
            } else {
                await savePacote(pacote);
            }
        }
        await deletePedido(rota.pedido.id);

        const payload = JSON.stringify({ tipo: 'BAIXA_PEDIDO', mensagem: 'Baixa pelo App', pedidoId: rota.pedido.id, data: new Date().toISOString() });
        broadcastMessage(payload);

        await registrarLog('FINANCEIRO', `Motoboy confirmou entrega via Telegram (Cod: ${codigo}).`);
        return true;
    }
    return false;
}
