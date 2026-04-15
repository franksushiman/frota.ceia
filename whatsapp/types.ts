export interface ProviderState {
    setStatus(status: string): void;
    setQr(qr: string | null): void;
}

export interface WhatsAppProvider {
    isConnected(): boolean;
    connect(state: ProviderState): Promise<void>;
    disconnect(): Promise<void>;
    sendMessage(
        numero: string,
        texto: string,
        telegramId?: string,
        motoboyMessage?: string,
        motoboyName?: string
    ): Promise<string | null>;
}
