import { Telegraf, Markup } from 'telegraf';
import { upsertFleet, getConfiguracoes, getMotoboyByTelegramId, getPacotes, getPedidos, savePacote, deletarMotoboy, atualizarCamposMotoboy, validarEUsarToken } from './database';
import { broadcastLog } from './logger';
import { processarBaixaPeloTelegram, getRotasMotoboy } from './operacao';
import { enviarMensagemWhatsApp, traduzirMotoboyParaCliente, clienteEmSAC } from './whatsapp/index';

type Step = 'NOME' | 'WHATSAPP' | 'VINCULO' | 'PIX' | 'VEICULO' | 'CHAT_CLIENTE' | 'AGUARDANDO_GPS_NUVEM';

interface UserSession {
    step: Step | 'SOS_CHAT';
    data: {
        nome?: string; whatsapp?: string; vinculo?: string; pix?: string; veiculo?: string;
        telefone_cliente?: string; nome_cliente?: string;
        pacote_id_nuvem?: string;
    };
}

const userSessions: Record<number, UserSession> = {};
export let bot: Telegraf | null = null;
let botLaunchPromise: Promise<void> | null = null;

export async function iniciarChatOperador(telegram_id: string, nome: string): Promise<void> {
    const chatId = Number(telegram_id);
    userSessions[chatId] = { step: 'SOS_CHAT', data: {} };
    try {
        await bot?.telegram.sendMessage(chatId, '📞 O operador da loja quer falar com você. Responda aqui normalmente.');
    } catch (e) {
        console.error('[TELEGRAM] Erro ao iniciar chat com motoboy:', e);
    }
}

export async function encerrarChatClientePeloPainel(telegram_id: string): Promise<void> {
    const chatId = Number(telegram_id);
    if (userSessions[chatId]?.step === 'CHAT_CLIENTE') {
        delete userSessions[chatId];
    }
    // Avisa sempre — se contextCache apontava para este motoboy, a linha direta existia
    await enviarMensagemTelegram(telegram_id,
        '⚠️ *Aviso:* A base (operador) assumiu o atendimento deste cliente no painel. Sua linha direta foi encerrada. Se precisar, clique em \'Falar com Cliente\' novamente.'
    );
}

export async function enviarMensagemTelegram(telegram_id: string, texto: string) {
    if (bot === null) { console.error("[DEBUG TELEGRAM] ERRO FATAL: O bot esta null na hora de enviar"); return false; }
    try {
        await bot.telegram.sendMessage(telegram_id, texto);
        console.log("[DEBUG TELEGRAM] Telegram confirmou o envio com sucesso");
        return true;
    } catch (e) { console.error("[DEBUG TELEGRAM] Falha cr\u00edtica ao enviar:", e); return false; }
}

interface DadosConviteNuvem {
    loja_destino_nome: string;
    link_bot_destino: string;
    taxa_estimada: number;
    distancia_km?: number;
    taxa_deslocamento_brl?: number;
    taxa_entrega?: number;
    valor_total?: number;
    pacote_id?: string;
}

export async function repassarConviteNuvem(telegram_id: string, dados_loja: DadosConviteNuvem): Promise<boolean> {
    if (!bot) return false;

    const dist = dados_loja.distancia_km ?? 0;
    const taxaDesl = dados_loja.taxa_deslocamento_brl || dados_loja.taxa_estimada || 0;
    const taxaEnt = dados_loja.taxa_entrega ?? 0;
    const total = dados_loja.valor_total ?? (taxaDesl + taxaEnt);
    const pacoteId = dados_loja.pacote_id ?? '';

    const texto =
        `\u2601\ufe0f *CHAMADO NUVEM* \u2601\ufe0f\\
\\
` +
        `A loja *${dados_loja.loja_destino_nome}* precisa de um motoboy para uma entrega.\\
\\
` +
        `\ud83d\udccd Dist\u00e2ncia: ${dist.toFixed(2)} km\\
` +
        `\ud83d\udcb0 Taxa de Deslocamento: R$ ${taxaDesl.toFixed(2)}\\
` +
        `\ud83d\udce6 Taxa da Entrega: R$ ${taxaEnt.toFixed(2)}\\
` +
        `\ud83d\udcb5 *Total: R$ ${total.toFixed(2)}*`;

    try {
        const botoes = pacoteId
            ? [Markup.button.callback('\u2705 Aceitar', `aceitar_nuvem_${pacoteId}`), Markup.button.callback('\u274c Recusar', 'recusar_nuvem')]
            : [Markup.button.url('\u2705 Aceitar Rota', dados_loja.link_bot_destino || 'https://t.me/'), Markup.button.callback('\u274c Recusar', 'recusar_nuvem')];

        await bot.telegram.sendMessage(telegram_id, texto, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([botoes])
        });
        return true;
    } catch (e) {
        console.error("Falha ao repassar convite nuvem:", e);
        return false;
    }
}

export async function enviarConfirmacaoPagamento(telegram_id: string, motoboyId: string, valorTotal: number): Promise<boolean> {
    if (!bot) return false;
    try {
        await bot.telegram.sendMessage(
            telegram_id,
            `\ud83d\udcb8 Pagamento de R$ ${valorTotal.toFixed(2)} registrado. Voc\u00ea confirma que recebeu?`,
            {
                ...Markup.inlineKeyboard([
                    Markup.button.callback('\u2705 Sim, recebi', `confirmar_pgto_${motoboyId}`),
                    Markup.button.callback('\u274c Ainda n\u00e3o', `pgto_pendente_${motoboyId}`)
                ])
            }
        );
        return true;
    } catch (e) {
        console.error('[TELEGRAM] Falha ao enviar confirma\u00e7\u00e3o de pagamento:', e);
        return false;
    }
}

export async function enviarConviteRotaTelegram(telegram_id: string, texto: string, pacoteId: string) {
    if (!bot) return false;
    try {
        await bot.telegram.sendMessage(telegram_id, texto, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
                Markup.button.callback('\u2705 Aceitar Rota', `aceitar_${pacoteId}`),
                Markup.button.callback('\u274c Recusar', `recusar_${pacoteId}`)
            ])
        });
        return true;
    } catch (e) { return false; }
}

export async function iniciarTelegram() {
    try {
        if (bot) {
            bot.stop('RELOAD');
            bot = null;
            if (botLaunchPromise) {
                await botLaunchPromise.catch(() => {});
                botLaunchPromise = null;
            }
        }
        const config = await getConfiguracoes();
        const token = config.telegram_bot_token;

        if (!token) {
            broadcastLog('TELEGRAM', 'Token n\u00e3o configurado. Adicione no painel QG Log\u00edstico.');
            return;
        }

        bot = new Telegraf(token);

        bot.catch((err, ctx) => {
            console.error(`[TELEGRAM ERROR] Falha ao processar requisi\u00e7\u00e3o para ${ctx.updateType}:`, err);
        });

        const updateProgress = async (chatId: number, field: keyof UserSession['data'], value: string, nextStep?: Step) => {
            try {
                const dadosAcumulados = userSessions[chatId]?.data || {};
                
                const dadosParaBanco: any = {
                    telegram_id: chatId.toString(), 
                    ...dadosAcumulados,
                    [field]: value,
                    status: 'CADASTRANDO' 
                };

                if (dadosParaBanco.whatsapp !== undefined) {
                    dadosParaBanco.cpf = dadosParaBanco.whatsapp;
                    delete dadosParaBanco.whatsapp;
                }

                await upsertFleet(dadosParaBanco);

                if (userSessions[chatId]) {
                    userSessions[chatId].data[field] = value;
                    if (nextStep) userSessions[chatId].step = nextStep;
                }
            } catch (error) {
                console.error(`[ERRO BANCO DE DADOS] Falha ao salvar o campo ${field}:`, error);
                throw error;
            }
        };

        const defaultKeyboard = Markup.keyboard([
            ['\ud83c\udd98 Pedir Ajuda (SOS)']
        ]).resize();

        const checarCadastro = async (telegramId: string, ctx: any): Promise<boolean> => {
            const motoboy = await getMotoboyByTelegramId(telegramId);
            if (!motoboy) {
                try {
                    await ctx.reply('\u26a0\ufe0f Acesso negado. Seu cadastro foi removido ou n\u00e3o encontrado na base deste estabelecimento.');
                } catch (e) {}
                return false;
            }
            return true;
        };

        bot.start(async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const startPayload = (ctx as any).startPayload;

                if (startPayload && startPayload.startsWith('nuvem_')) {
                    const pacoteId = startPayload.replace('nuvem_', '');
                    const motoboyExistente = await getMotoboyByTelegramId(chatId.toString());
                    const nomeNuvem = motoboyExistente?.nome || ctx.from.first_name || 'Motoboy';
                    
                    await upsertFleet({ telegram_id: chatId.toString(), nome: nomeNuvem, vinculo: 'Nuvem', status: 'CADASTRANDO' });
                    userSessions[chatId] = { step: 'AGUARDANDO_GPS_NUVEM', data: { pacote_id_nuvem: pacoteId } };
                    broadcastLog('NUVEM', `Motoboy ${nomeNuvem} aceitou um convite da rede e est\u00e1 se registrando.`);
                    await ctx.reply(`Bem-vindo \u00e0 loja! Voc\u00ea aceitou a rota Nuvem. \u2601\ufe0f\ud83d\udef5\\
\\
\ud83d\udccd **\u00daLTIMO PASSO:** Como voc\u00ea mudou para o bot da loja, precisamos do seu GPS para rastrear sua chegada. Toque no \u00edcone de clipe (\ud83d\udcce), escolha "Localiza\u00e7\u00e3o" e envie sua **Localiza\u00e7\u00e3o em Tempo Real** aqui no chat para liberar os detalhes da entrega.`, Markup.removeKeyboard());
                    return;
                }

                const tokenValido = startPayload ? await validarEUsarToken(startPayload) : false;
                if (!tokenValido) {
                    const config = await getConfiguracoes();
                    await ctx.reply(`\u26a0\ufe0f Voc\u00ea n\u00e3o faz parte da frota deste restaurante. Para participar, leia o QR Code na tela do computador no restaurante ${config?.nome || 'local'}.`);
                    return;
                }

                const existente = await getMotoboyByTelegramId(chatId.toString());
                if (existente && existente.vinculo === 'Nuvem') {
                    await atualizarCamposMotoboy(chatId.toString(), { vinculo: null, status: 'CADASTRANDO' });
                }

                userSessions[chatId] = { step: 'NOME', data: {} };
                const config = await getConfiguracoes();
                await ctx.reply(`Ol\u00e1! Bem-vindo \u00e0 frota do ${config?.nome || 'Restaurante'}! \ud83d\udef5\ud83d\udca8\\
Vamos iniciar seu cadastro. Por favor, digite seu **Nome Completo**:`, Markup.removeKeyboard());
            } catch (e) {}
        });

        bot.hears('\ud83c\udd98 Pedir Ajuda (SOS)', async (ctx) => {
            if (!await checarCadastro(ctx.chat.id.toString(), ctx)) return;
            const motoboyAtual = await getMotoboyByTelegramId(ctx.chat.id.toString());
            if (motoboyAtual?.status === 'OFFLINE' || motoboyAtual?.status === 'CADASTRANDO') {
                await ctx.reply('\u26a0\ufe0f Voc\u00ea precisa estar em expediente (ONLINE) para acionar o socorro. Compartilhe sua localiza\u00e7\u00e3o em tempo real para bater o ponto.');
                return;
            }
            const nome = motoboyAtual?.nome?.split(' ')[0] || 'Um motoboy';
            userSessions[ctx.chat.id] = { step: 'SOS_CHAT', data: {} };
            broadcastLog('SOS', `O motoboy ${nome} acionou o ALARME DE EMERG\u00caNCIA!`, { telegram_id: ctx.chat.id.toString() });
            await ctx.reply('\ud83d\udea8 Seu sinal de emerg\u00eancia foi enviado para a base. Aguarde, a loja vai entrar em contato com voc\u00ea imediatamente.', Markup.inlineKeyboard([
                Markup.button.callback('\u2716\ufe0f Encerrar Emerg\u00eancia', 'cancelar_chat')
            ]));
        });

        bot.action(/^chat_(.+)$/, async (ctx) => {
            if (!await checarCadastro(ctx.chat.id.toString(), ctx)) { await ctx.answerCbQuery(); return; }
            const pedidoId = ctx.match[1];
            const chatId = ctx.chat.id;
            const rotas = await getRotasMotoboy(chatId.toString());
            const rota = rotas.find(r => r.pedido.id === pedidoId);
            
            if (!rota) return ctx.answerCbQuery('Pedido n\u00e3o encontrado ou j\u00e1 finalizado.');

            const telefoneCliente = rota.pedido.telefone || rota.pedido.telefoneCliente || rota.pedido.whatsapp || rota.pedido.telefone_cliente;
            if (clienteEmSAC(telefoneCliente)) {
                await ctx.answerCbQuery();
                await ctx.reply('\ud83d\udd12 O atendimento deste cliente est\u00e1 com o operador da base no momento. Aguarde o operador encerrar para falar direto com o cliente.');
                return;
            }

            userSessions[chatId] = { step: "CHAT_CLIENTE", data: { telefone_cliente: telefoneCliente, nome_cliente: rota.pedido.nomeCliente } };
            
            await ctx.editMessageText(`Aberta linha direta com *${rota.pedido.nomeCliente.split(' ')[0]}*.\\
\\
Digite a mensagem abaixo e eu enviarei para o WhatsApp do cliente de forma oculta.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    Markup.button.callback('\u2716\ufe0f Encerrar Conversa', 'cancelar_chat')
                ])
            });
            await ctx.answerCbQuery();
        });

        bot.action(/^aceitar_nuvem_(.+)$/, async (ctx) => {
            const pacoteId = ctx.match[1];
            await ctx.answerCbQuery('Convite aceito!');
            const chatId = ctx.chat.id;

            const motoboyExistente = await getMotoboyByTelegramId(chatId.toString());
            const nomeNuvem = motoboyExistente?.nome || ctx.from.first_name || 'Motoboy';
            
            await upsertFleet({ telegram_id: chatId.toString(), nome: nomeNuvem, vinculo: 'Nuvem', status: 'CADASTRANDO' });
            userSessions[chatId] = { step: 'AGUARDANDO_GPS_NUVEM', data: { pacote_id_nuvem: pacoteId } };

            broadcastLog('NUVEM', `Motoboy aceitou chamado Nuvem para pacote ${pacoteId}.`, { pacoteId });

            try {
                await ctx.editMessageText((ctx.callbackQuery.message?.text ?? '') + '\n\n\u2705 *ACEITO!*', { parse_mode: 'Markdown' });
                await ctx.reply(`Voc\u00ea aceitou a rota Nuvem. \u2601\ufe0f\ud83d\udef5\\
\\
\ud83d\udccd **\u00daLTIMO PASSO:** Precisamos do seu GPS para rastrear sua chegada. Toque no \u00edcone de clipe (\ud83d\udcce), escolha "Localiza\u00e7\u00e3o" e envie sua **Localiza\u00e7\u00e3o em Tempo Real** aqui no chat para avisar o cliente e liberar os detalhes da entrega.`, Markup.removeKeyboard());
            } catch (_e) {}
        });

        bot.action(/^confirmar_pgto_(.+)$/, async (ctx) => {
            const motoboyId = ctx.match[1];
            await ctx.answerCbQuery('Confirma\u00e7\u00e3o registrada!');
            const motoboy = await getMotoboyByTelegramId(motoboyId);
            const nome = motoboy?.nome || motoboyId;

            if (!motoboy || motoboy.vinculo === 'Nuvem') {
                await deletarMotoboy(motoboyId);
                try { await ctx.editMessageText('\u2705 Pagamento confirmado! Obrigado por rodar com a gente. At\u00e9 a pr\u00f3xima!'); } catch (_e) {}
                broadcastLog('FINANCEIRO', `Motoboy ${nome} confirmou recebimento e foi removido.`);
            } else {
                await atualizarCamposMotoboy(motoboyId, { pagamento_pendente: 0, pendente_desde: null, status: 'ONLINE' });
                try { await ctx.editMessageText('\u2705 Pagamento confirmado! Bom trabalho. Voc\u00ea est\u00e1 de volta ao ONLINE.'); } catch (_e) {}
                broadcastLog('FINANCEIRO', `Motoboy fixo ${nome} confirmou recebimento e voltou para ONLINE.`);
            }
        });

        bot.action(/^pgto_pendente_(.+)$/, async (ctx) => {
            const motoboyId = ctx.match[1];
            await ctx.answerCbQuery('Sinalizado!');
            try { await ctx.editMessageText('\u26a0\ufe0f Entendido. O lojista ser\u00e1 notificado. Por favor, entre em contato.'); } catch (_e) {}
            const motoboy = await getMotoboyByTelegramId(motoboyId);
            const nome = motoboy?.nome || motoboyId;
            await atualizarCamposMotoboy(motoboyId, {
                pagamento_pendente: 1,
                pendente_desde: new Date().toISOString(),
                status: 'OFFLINE'
            });
            broadcastLog('ALERTA', `Motoboy ${nome} sinalizou n\u00e3o recebimento.`);
        });

        bot.action(/^aceitar_(.+)$/, async (ctx) => {
            if (!await checarCadastro(ctx.chat.id.toString(), ctx)) { await ctx.answerCbQuery(); return; }
            const pacoteId = ctx.match[1];
            const motoboyDb = await getMotoboyByTelegramId(ctx.from.id.toString());
            const nomeMotoboyAceite = motoboyDb?.nome?.split(' ')[0] || 'Um parceiro';
            broadcastLog('ACEITE_ROTA', `${nomeMotoboyAceite} confirmou a rota!`, { pacoteId });
            await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n\u2705 *ROTA ACEITA!* Pode iniciar o deslocamento.', { parse_mode: 'Markdown', disable_web_page_preview: true });
            await ctx.answerCbQuery('Rota Aceita!');

            const pacotesRaw = await getPacotes();
            const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
            const pacote = pacotes.find((p: any) => p.id === pacoteId);
            const pedidosRaw = await getPedidos();
            const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));

            if (pacote) {
                pacote.motoboy = { telegram_id: ctx.from.id.toString(), nome: motoboyDb?.nome || 'Parceiro' };
                pacote.status = 'EM_ROTA';
                const pedidosDoPacote = (pacote.pedidosIds || []).map((id: string) => pedidos.find((p: any) => p.id === id)).filter(Boolean);
                if (pedidosDoPacote.length > 0) pacote.pedidos_snapshot = pedidosDoPacote;
                await savePacote(pacote);
                await atualizarCamposMotoboy(ctx.from.id.toString(), { status: 'EM_ENTREGA' });

                for (const pId of pacote.pedidosIds || []) {
                    const p = pedidos.find((ped: any) => ped.id === pId);
                    const telefoneCliente = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
                    if (p && telefoneCliente) {
                        const num = telefoneCliente.replace(/\D/g, '');
                        if (num.length >= 10) {
                            const nomeSplit = p.nomeCliente ? p.nomeCliente.split(' ')[0] : 'cliente';
                            const msgCliente = `Ol\u00e1, ${nomeSplit}! O seu pedido acabou de sair para entrega com o parceiro *${pacote.motoboy.nome}*. \ud83d\udef5\ud83d\udca8\\
\\
\u26a0\ufe0f *Aten\u00e7\u00e3o:* Para a seguran\u00e7a da sua entrega, informe o c\u00f3digo *${p?.codigo_entrega || '4 d\u00edgitos'}* ao motoboy quando ele chegar.`;
                            enviarMensagemWhatsApp('55' + num, msgCliente).catch(e => console.error(e));
                        }
                    }
                }

                let detalheMsg = '\ud83d\udcdd *DETALHES DA ROTA:*\n\n';
                let index = 0;
                for (const pId of pacote.pedidosIds || []) {
                    const p = pedidos.find((ped: any) => ped.id === pId);
                    if (p) {
                        const wazeLink = `https://waze.com/ul?q=${encodeURIComponent(p.endereco)}`;
                        const mapsLink = `https://maps.google.com/?q=${encodeURIComponent(p.endereco)}`;
                        detalheMsg += `*Cliente ${++index}: ${p.cliente_nome || p.nomeCliente || 'Cliente'}*\\
`;
                        detalheMsg += `\ud83d\udccd ${p.endereco}\\
`;
                        if (p.numero) detalheMsg += `  \u2022 N\u00famero: ${p.numero}\\
`;
                        if (p.apartamento) detalheMsg += `  \u2022 Apartamento: ${p.apartamento}\\
`;
                        if (p.complemento) detalheMsg += `  \u2022 Complemento: ${p.complemento}\\
`;
                        if (p.observacoes) detalheMsg += `  \ud83d\udcac Obs: ${p.observacoes}\\
`;
                        detalheMsg += `[\ud83d\uddfa\ufe0f Waze](${wazeLink}) | [\ud83d\udccd Maps](${mapsLink})\\
\\
`;
                    }
                }
                detalheMsg += `\ud83d\udca1 Ao chegar, pe\u00e7a o *c\u00f3digo de 4 d\u00edgitos* ao cliente e digite aqui para dar baixa.`;
                await ctx.reply(detalheMsg, { parse_mode: 'Markdown', disable_web_page_preview: true, ...defaultKeyboard });

                let pedidoIdx = 0;
                for (const pId of pacote.pedidosIds || []) {
                    const p = pedidos.find((ped: any) => ped.id === pId);
                    if (p) {
                        const primeiroNome = (p.cliente_nome || p.nomeCliente || 'Cliente').split(' ')[0];
                        await ctx.reply(`Pedido ${++pedidoIdx} \u2014 ${primeiroNome}`, Markup.inlineKeyboard([
                            Markup.button.callback(`\ud83d\udcac Falar com ${primeiroNome}`, `chat_${p.id}`)
                        ]));
                    }
                }
            }
        });

        bot.action(/^recusar_(.+)$/, async (ctx) => {
            if (!await checarCadastro(ctx.chat.id.toString(), ctx)) { await ctx.answerCbQuery(); return; }
            const pacoteId = ctx.match[1];

            const pacotesRaw = await getPacotes();
            const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
            const pacote = pacotes.find((p: any) => p.id === pacoteId);
     
            if (pacote) {
                pacote.motoboy = null;
                pacote.status = 'AGUARDANDO';
                await savePacote(pacote);
            }
            
            const motoboyRecusou = await getMotoboyByTelegramId(ctx.from.id.toString());
            const nomeMotoboyRecusa = motoboyRecusou?.nome?.split(' ')[0] || 'Um parceiro';
            broadcastLog('RECUSA_ROTA', `O motoboy ${nomeMotoboyRecusa} RECUSOU o Pacote #${pacoteId.split('_')[1].substring(6)}.`, { pacoteId });
            await ctx.editMessageText('\u274c *ROTA RECUSADA*. Foi devolvida para a base.', { parse_mode: 'Markdown' });
            await ctx.answerCbQuery('Rota Recusada');
        });

        bot.action('recusar_nuvem', async (ctx) => {
            await ctx.editMessageText('\u2601\ufe0f Convite da rede nuvem recusado.');
            await ctx.answerCbQuery();
        });

        bot.action('cancelar_chat', async (ctx) => {
            const eraSOS = userSessions[ctx.chat.id]?.step === 'SOS_CHAT';
            delete userSessions[ctx.chat.id];
            if (eraSOS) {
                broadcastLog('SOS_ENCERRADO', '', { telegram_id: ctx.chat.id.toString() });
            }
            await ctx.editMessageText('\u2705 Conversa encerrada.');
            await ctx.reply('Voc\u00ea voltou ao menu principal.', defaultKeyboard);
            await ctx.answerCbQuery();
        });

        bot.hears(/^\d{4}$/, async (ctx) => {
            if (!await checarCadastro(ctx.chat.id.toString(), ctx)) return;
            const chatId = ctx.chat.id.toString();
            const codigo = ctx.message.text;
            const sucesso = await processarBaixaPeloTelegram(chatId, codigo);
            if (sucesso) {
                if (userSessions[ctx.chat.id]?.step === 'CHAT_CLIENTE') delete userSessions[ctx.chat.id];
                await ctx.reply(`\u2705 C\u00f3digo aceito! A entrega foi confirmada e o valor lan\u00e7ado no seu extrato.`);
            } else {
                await ctx.reply(`\u274c C\u00f3digo inv\u00e1lido ou essa entrega j\u00e1 est\u00e1 finalizada.`);
            }
        });

        bot.on('location', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                if (!await checarCadastro(chatId.toString(), ctx)) return;
                const { latitude, longitude } = ctx.message.location;
                const motoboy = await getMotoboyByTelegramId(chatId.toString());
                const session = userSessions[chatId];

                const midInterview = session != null && session.step !== 'AGUARDANDO_GPS_NUVEM';
                if (!motoboy || (motoboy.status === 'CADASTRANDO' && midInterview)) {
                    await ctx.reply('\u26a0\ufe0f Voc\u00ea precisa concluir o cadastro (/start) antes de compartilhar a localiza\u00e7\u00e3o.');
                    return;
                }

                if (motoboy && motoboy.vinculo === 'Nuvem' && session?.step === 'AGUARDANDO_GPS_NUVEM' && ctx.message.location.live_period) {
                    await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: 'EM_ENTREGA' });
                    broadcastLog('NUVEM', `Motoboy Nuvem [${motoboy.nome}] est\u00e1 ONLINE e pronto para a rota.`);
                    await ctx.reply('\u2705 Localiza\u00e7\u00e3o recebida! Sua rota est\u00e1 sendo preparada...');
                    const pacoteId = session.data.pacote_id_nuvem;
                    if (pacoteId) {
                        const pacotesRaw = await getPacotes();
                        const pacotes = pacotesRaw.map((p: any) => JSON.parse(p.dados_json));
                        const pacote = pacotes.find((p: any) => p.id === pacoteId);
                        const pedidosRaw = await getPedidos();
                        const pedidos = pedidosRaw.map((p: any) => JSON.parse(p.dados_json));

                        if (pacote) {
                            pacote.motoboy = { telegram_id: chatId.toString(), nome: motoboy.nome };
                            pacote.status = 'EM_ROTA';
                            if (pacote.deslocamento_pago === undefined) pacote.deslocamento_pago = false;
                            await savePacote(pacote);

                            for (const pId of pacote.pedidosIds || []) {
                                const p = pedidos.find((ped: any) => ped.id === pId);
                                const telefoneCliente = p?.telefone || p?.telefoneCliente || p?.whatsapp || p?.telefone_cliente;
                                if (p && telefoneCliente) {
                                    const num = telefoneCliente.replace(/\D/g, '');
                                    if (num.length >= 10) {
                                        const nomeSplit = p.nomeCliente ? p.nomeCliente.split(' ')[0] : 'cliente';
                                        const msgCliente = `Ol\u00e1, ${nomeSplit}! O seu pedido acabou de sair para entrega com o parceiro *${pacote.motoboy.nome}*. \ud83d\udef5\ud83d\udca8\\
\\
\u26a0\ufe0f *Aten\u00e7\u00e3o:* Para a seguran\u00e7a da sua entrega, informe o c\u00f3digo *${p?.codigo_entrega || '4 d\u00edgitos'}* ao motoboy quando ele chegar.`;
                                        enviarMensagemWhatsApp('55' + num, msgCliente).catch(e => console.error(e));
                                    }
                                }
                            }

                            let detalheMsg = '\ud83d\udcdd *DETALHES DA ROTA:*\n\n';
                            let index = 0;
                            for (const pId of pacote.pedidosIds || []) {
                                const p = pedidos.find((ped: any) => ped.id === pId);
                                if (p) {
                                    const wazeLink = `https://waze.com/ul?q=${encodeURIComponent(p.endereco)}`;
                                    const mapsLink = `https://maps.google.com/?q=${encodeURIComponent(p.endereco)}`;
                                    detalheMsg += `*Cliente ${++index}: ${p.cliente_nome || p.nomeCliente || 'Cliente'}*\\
`;
                                    detalheMsg += `\ud83d\udccd ${p.endereco}\\
`;
                                    if (p.numero) detalheMsg += `  \u2022 N\u00famero: ${p.numero}\\
`;
                                    if (p.apartamento) detalheMsg += `  \u2022 Apartamento: ${p.apartamento}\\
`;
                                    if (p.complemento) detalheMsg += `  \u2022 Complemento: ${p.complemento}\\
`;
                                    if (p.observacoes) detalheMsg += `  \ud83d\udcac Obs: ${p.observacoes}\\
`;
                                    detalheMsg += `[\ud83d\uddfa\ufe0f Waze](${wazeLink}) | [\ud83d\udccd Maps](${mapsLink})\\
\\
`;
                                }
                            }
                            detalheMsg += `\ud83d\udca1 Ao chegar, pe\u00e7a o *c\u00f3digo de 4 d\u00edgitos* ao cliente e digite aqui para dar baixa.`;
                            detalheMsg += `\\
\\
\ud83d\udcb0 *Taxa de Deslocamento Acordada:* R$ ${(pacote.taxa_deslocamento || 0).toFixed(2)} (Adicionada ao extrato na primeira entrega)`;
                            await ctx.reply(detalheMsg, { parse_mode: 'Markdown', disable_web_page_preview: true, ...defaultKeyboard });
                            delete userSessions[chatId];
                            let pedidoIdx = 0;
                            for (const pId of pacote.pedidosIds || []) {
                                const p = pedidos.find((ped: any) => ped.id === pId);
                                if (p) {
                                    const primeiroNome = (p.cliente_nome || p.nomeCliente || 'Cliente').split(' ')[0];
                                    await ctx.reply(`Pedido ${++pedidoIdx} \u2014 ${primeiroNome}`, Markup.inlineKeyboard([
                                        Markup.button.callback(`\ud83d\udcac Falar com ${primeiroNome}`, `chat_${p.id}`)
                                    ]));
                                }
                            }
                        } else {
                            await ctx.reply('\u26a0\ufe0f N\u00e3o foi poss\u00edvel encontrar os detalhes da sua rota. Entre em contato com a loja.');
                        }
                    }
                    return;
                }

                if (ctx.message.location.live_period) {
                    await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: 'ONLINE' });
                    broadcastLog('FROTA', `Motoboy [${motoboy?.nome?.split(' ')[0] || 'Parceiro'}] bateu o ponto e est\u00e1 ONLINE \ud83d\udfe2`);
                    await ctx.reply('\ud83d\udfe2 Ponto registrado! Voc\u00ea est\u00e1 ONLINE no radar da loja.\n\nFique atento \u00e0s novas rotas. (Para sair, pare de compartilhar a localiza\u00e7\u00e3o ou digite /offline)', defaultKeyboard);

                    if (motoboy?.vinculo === 'Freelancer') {
                        const config2 = await getConfiguracoes();
                        const agora2 = new Date();
                        const diasSemana2 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
                        const diaKey2 = diasSemana2[agora2.getDay()];
                        const horaAtual2 = agora2.getHours() * 60 + agora2.getMinutes();
                        let dentroDoExpediente2 = false;
                        if (config2?.horarios) {
                            const dia2 = config2.horarios[diaKey2];
                            if (dia2?.ativo && dia2.abre && dia2.fecha) {
                                const [ah2, am2] = dia2.abre.split(':').map(Number);
                                const [fh2, fm2] = dia2.fecha.split(':').map(Number);
                                const abre2 = ah2 * 60 + am2;
                                const fecha2 = fh2 * 60 + fm2;
                                if (abre2 <= fecha2) {
                                    dentroDoExpediente2 = horaAtual2 >= abre2 && horaAtual2 < fecha2;
                                } else {
                                    dentroDoExpediente2 = horaAtual2 >= abre2 || horaAtual2 < fecha2;
                                }
                            }
                        }
                        if (!dentroDoExpediente2) {
                            const botGlobal = process.env.BOT_GLOBAL_USERNAME || 'Mula_Logistica_Bot';
                            const linkGlobal = `https://t.me/${botGlobal}?start=${chatId}`;
                            await ctx.reply(
                                `\ud83c\udf19 A loja est\u00e1 fora do expediente agora, mas voc\u00ea pode continuar ativo na Frota Global e receber corridas de outras lojas da rede CEIA.\n\nClique aqui para ativar: ${linkGlobal}\n\nUse o mesmo app do Telegram \u2014 \u00e9 s\u00f3 confirmar e compartilhar sua localiza\u00e7\u00e3o l\u00e1 tamb\u00e9m.`,
                                { disable_web_page_preview: true }
                            );
                        }
                    }
                } else {
                    await ctx.reply('\u26a0\ufe0f Aten\u00e7\u00e3o: voc\u00ea enviou uma localiza\u00e7\u00e3o fixa. Voc\u00ea precisa compartilhar a **Localiza\u00e7\u00e3o em Tempo Real**.');
                }
            } catch (e) {}
        });

        bot.on('edited_message', async (ctx) => {
            try {
                if ('location' in ctx.editedMessage) {
                    const chatId = ctx.editedMessage.chat.id;
                    const motoboy = await getMotoboyByTelegramId(chatId.toString());
                    if (!motoboy) return;
                    const { latitude, longitude } = ctx.editedMessage.location;
                    await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: 'ONLINE' });
                }
            } catch (e) {}
        });

        bot.command('offline', async (ctx) => {
            const chatId = ctx.chat.id;
            await upsertFleet({ telegram_id: chatId.toString(), status: 'OFFLINE' });
            const motoboyOffline = await getMotoboyByTelegramId(chatId.toString());
            broadcastLog('FROTA', `Motoboy [${motoboyOffline?.nome?.split(' ')[0] || 'Parceiro'}] encerrou o expediente via comando \ud83d\udd34`);
            await ctx.reply('\ud83d\udd34 Expediente encerrado.', Markup.removeKeyboard());
        });

        bot.command('cancelar', async (ctx) => {
            delete userSessions[ctx.chat.id];
            await ctx.reply('\u2705 Conversa encerrada. Voc\u00ea voltou ao menu principal.', defaultKeyboard);
        });

        bot.command('reset', async (ctx) => {
            const chatId = ctx.chat.id;
            delete userSessions[chatId];
            await ctx.reply('\ud83d\udd04 Seu estado foi resetado. Digite /start para iniciar o cadastro novamente.', Markup.removeKeyboard());
        });

        bot.command('limpar', async (ctx) => {
            const chatId = ctx.chat.id;
            delete userSessions[chatId];
            await ctx.reply('\ud83d\udd04 Seu estado foi resetado. Digite /start para iniciar o cadastro novamente.', Markup.removeKeyboard());
        });

        bot.command('sair', async (ctx) => {
            const chatId = ctx.chat.id;
            const motoboy = await getMotoboyByTelegramId(chatId.toString());
            if (!motoboy) {
                await ctx.reply('\u26a0\ufe0f Voc\u00ea n\u00e3o est\u00e1 cadastrado nesta loja.');
                return;
            }
            if ((motoboy.pagamento_pendente ?? 0) > 0) {
                await ctx.reply('\u274c Voc\u00ea possui acertos pendentes com esta loja. Aguarde o pagamento antes de se desvincular.');
                return;
            }
            await deletarMotoboy(chatId.toString());
            delete userSessions[chatId];
            await ctx.reply('\u2705 Voc\u00ea foi desvinculado desta loja com sucesso. Voc\u00ea est\u00e1 livre para operar como Global ou em outra loja.', Markup.removeKeyboard());
        });

        bot.command('desvincular', async (ctx) => {
            const chatId = ctx.chat.id;
            const motoboy = await getMotoboyByTelegramId(chatId.toString());
            if (!motoboy) {
                await ctx.reply('\u26a0\ufe0f Voc\u00ea n\u00e3o est\u00e1 cadastrado nesta loja.');
                return;
            }
            if ((motoboy.pagamento_pendente ?? 0) > 0) {
                await ctx.reply('\u274c Voc\u00ea possui acertos pendentes com esta loja. Aguarde o pagamento antes de se desvincular.');
                return;
            }
            await deletarMotoboy(chatId.toString());
            delete userSessions[chatId];
            await ctx.reply('\u2705 Voc\u00ea foi desvinculado desta loja com sucesso. Voc\u00ea est\u00e1 livre para operar como Global ou em outra loja.', Markup.removeKeyboard());
        });

        bot.on('text', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const session = userSessions[chatId];
                const text = ctx.message.text;

                if (text.startsWith('/')) return;
                
                if (session?.step === 'SOS_CHAT') {
                    if (!await checarCadastro(chatId.toString(), ctx)) return;
                    broadcastLog("SOS_MSG", text, { telegram_id: chatId.toString() });
                    return;
                }

                if (session?.step === 'CHAT_CLIENTE') {
                    const num = session.data.telefone_cliente?.replace(/\D/g, '');
                    const motoboyChat = await getMotoboyByTelegramId(chatId.toString());
                    const nomeMotoboySender = motoboyChat?.nome?.split(' ')[0] || 'Parceiro';
                    if (num) {
                        try {
                            const textoPronto = await traduzirMotoboyParaCliente(text);
                            if (textoPronto.trim().toUpperCase().replace(/[^A-Z]/g, '') === 'IGNORAR') {
                                await ctx.reply('ℹ️ Sua mensagem não trazia info útil pro cliente. Seja objetivo (endereço, troco, problema, prazo).');
                                return;
                            }
                            const jidCliente = await enviarMensagemWhatsApp('55' + num, textoPronto, ctx.chat.id.toString(), text, nomeMotoboySender);
                            if (jidCliente) {
                                await ctx.reply('✅ Mensagem enviada ao cliente!');
                            } else {
                                await ctx.reply('❌ Falha ao enviar. Verifique a conexão do WhatsApp.');
                            }
                        } catch (e) {
                            console.error('[WHATSAPP] Erro ao enviar para cliente:', e);
                            await ctx.reply('❌ Falha ao enviar a mensagem. Verifique a conexão.');
                        }
                    } else {
                        await ctx.reply('❌ Erro: Cliente sem número de telefone para esta rota.');
                    }
                    return;
                }

                if (!session) {
                    const motoboyEmCadastro = await getMotoboyByTelegramId(chatId.toString());
                    if (motoboyEmCadastro && motoboyEmCadastro.status === 'CADASTRANDO') {
                        let restoredStep: Step = 'NOME';
                        if (!motoboyEmCadastro.nome) restoredStep = 'NOME';
                        else if (!motoboyEmCadastro.whatsapp && !motoboyEmCadastro.cpf) restoredStep = 'WHATSAPP';
                        else if (!motoboyEmCadastro.vinculo) restoredStep = 'VINCULO';
                        else if (!motoboyEmCadastro.pix) restoredStep = 'PIX';
                        else restoredStep = 'VEICULO';
                        userSessions[chatId] = {
                            step: restoredStep,
                            data: {
                                nome: motoboyEmCadastro.nome || undefined,
                                whatsapp: motoboyEmCadastro.whatsapp || motoboyEmCadastro.cpf || undefined,
                                vinculo: motoboyEmCadastro.vinculo || undefined,
                                pix: motoboyEmCadastro.pix || undefined,
                            }
                        };
                        if (restoredStep === 'VINCULO' && text !== 'Fixo' && text !== 'Freelancer') {
                            await ctx.reply('Qual o seu **V\u00ednculo** com a loja? (Como "Freelancer", voc\u00ea tamb\u00e9m poder\u00e1 receber chamados de outras lojas da rede no futuro).', Markup.keyboard([['Fixo', 'Freelancer']]).oneTime().resize());
                            return;
                        }
                    } else {
                        return;
                    }
                }

                const activeSession = userSessions[chatId];
                if (!activeSession) return;

                switch (activeSession.step) {
                    case 'NOME':
                        try {
                            await updateProgress(chatId, 'nome', text, 'WHATSAPP');
                            await ctx.reply('Perfeito! Agora, qual \u00e9 o seu **WhatsApp**? (somente n\u00fameros com DDD)');
                        } catch (e) { await ctx.reply('\u274c Falha ao salvar no banco. Tente digitar novamente.'); }
                        break;
                    case 'WHATSAPP': {
                        const numeroWpp = text.replace(/\D/g, '');
                        if (numeroWpp.length < 10) {
                            await ctx.reply('\u274c N\u00famero inv\u00e1lido. Digite apenas os n\u00fameros com DDD (ex: 31999998888):');
                            break;
                        }
                        try {
                            await updateProgress(chatId, 'whatsapp', numeroWpp, 'VINCULO');
                            await ctx.reply('Qual o seu **V\u00ednculo** com a loja? (Como "Freelancer", voc\u00ea tamb\u00e9m poder\u00e1 receber chamados de outras lojas da rede no futuro).', Markup.keyboard([['Fixo', 'Freelancer']]).oneTime().resize());
                        } catch (e) { await ctx.reply('\u274c Falha ao salvar no banco. Tente digitar novamente.'); }
                        break;
                    }
                    case 'VINCULO':
                        if (text !== 'Fixo' && text !== 'Freelancer') {
                            return ctx.reply('Por favor, selecione "Fixo" ou "Freelancer".', Markup.keyboard([['Fixo', 'Freelancer']]).oneTime().resize());
                        }
                        try {
                            await updateProgress(chatId, 'vinculo', text, 'PIX');
                            await ctx.reply('Qual a sua **Chave PIX** para recebimentos?', Markup.removeKeyboard());
                        } catch (e) { await ctx.reply('\u274c Falha ao salvar no banco. Tente digitar novamente.'); }
                        break;
                    case 'PIX':
                        try {
                            await updateProgress(chatId, 'pix', text, 'VEICULO');
                            await ctx.reply('Qual \u00e9 o seu **Ve\u00edculo**? (Ex: Scooter, Carro)');
                        } catch (e) { await ctx.reply('\u274c Falha ao salvar no banco. Tente digitar novamente.'); }
                        break;
                    case 'VEICULO': {
                        const nomeParaBanco = activeSession.data.nome || ctx.from?.first_name || 'Parceiro';
                        const dadosCadastro = {
                            telegram_id: chatId.toString(),
                            veiculo: text,
                            nome: nomeParaBanco,
                            cpf: activeSession.data.whatsapp || null, 
                            vinculo: activeSession.data.vinculo || null,
                            pix: activeSession.data.pix || null,
                            status: 'CADASTRANDO'
                        };
                        
                        try {
                            await upsertFleet(dadosCadastro as any);
                        } catch (e) {
                            console.error('[ERRO BANCO - VEICULO]:', e);
                            await ctx.reply('\u274c Erro tempor\u00e1rio no banco da loja. Digite o ve\u00edculo novamente para tentar de novo.');
                            return; 
                        }

                        broadcastLog('FROTA', `Novo cadastro finalizado: ${nomeParaBanco} (${text})`);

                        const isFreelancer = activeSession.data.vinculo === 'Freelancer';
                        
                        const msgFinal = isFreelancer 
                            ? '\u2705 Cadastro conclu\u00eddo e sincronizado com a rede!\n\nCompartilhe sua **Localiza\u00e7\u00e3o em Tempo Real** aqui neste chat para entrar no radar e come\u00e7ar a receber rotas.'
                            : '\u2705 Cadastro conclu\u00eddo com sucesso!\n\nCompartilhe sua **Localiza\u00e7\u00e3o em Tempo Real** aqui no chat para entrar no radar da loja e come\u00e7ar a receber rotas.';

                        const payloadNuvem = isFreelancer ? {
                            telegram_id: chatId.toString(),
                            nome: nomeParaBanco,
                            whatsapp: activeSession.data.whatsapp || null,
                            pix: activeSession.data.pix || null,
                            veiculo: text
                        } : null;

                        // Limpa a sess\u00e3o imediatamente e responde pro usu\u00e1rio (Zero espera)
                        delete userSessions[chatId];
                        await ctx.reply(msgFinal, defaultKeyboard);

                        // Dispara pra Nuvem em background (Fire and Forget)
                        if (isFreelancer && payloadNuvem) {
                            fetch('https://frota.ceia.ia.br/wp-json/frota/v1/cadastrar_freelancer', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payloadNuvem),
                                signal: AbortSignal.timeout(8000)
                            }).then(async (res) => {
                                if (!res.ok) {
                                    const erroTxt = await res.text();
                                    console.error(`[API NUVEM ERRO] HTTP ${res.status}:`, erroTxt);
                                }
                            }).catch((_e) => {
                                console.error('[CATCH NUVEM ERRO]: Falha de rede ao tentar sincronizar com a Nuvem:', _e);
                            });
                        }
                        break;
                    }
                }
            } catch (e) {
                console.error('[ERRO FATAL NO TELEGRAM BOT ON TEXT]:', e);
            }
        });

        botLaunchPromise = bot.launch().catch((err: any) => {
            broadcastLog('ERROR', `Falha ao iniciar o bot Telegram: ${err?.message || err}`);
            bot = null;
        });
        broadcastLog('TELEGRAM', 'Conectado aos servidores. R\u00e1dio da frota operante!');

        process.once('SIGINT', () => bot?.stop('SIGINT'));
        process.once('SIGTERM', () => bot?.stop('SIGTERM'));

    } catch (error) { broadcastLog('ERROR', 'Falha ao iniciar o r\u00e1dio da frota.'); }
}
