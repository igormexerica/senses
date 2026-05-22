import axios, { type AxiosInstance } from 'axios';
import { loadEnv } from './env.js';
import { withRetry } from './retry.js';

export class TelegramNotifier {
  private readonly http: AxiosInstance;
  private readonly gestorChatId: string;

  constructor(opts: { botToken?: string; gestorChatId?: string } = {}) {
    const env = loadEnv();
    const token = opts.botToken ?? env.TELEGRAM_BOT_TOKEN;
    const chatId = opts.gestorChatId ?? env.TELEGRAM_CHAT_ID_GESTOR_CS;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN ausente — configure no .env ou passe via opts.botToken');
    if (!chatId)
      throw new Error('TELEGRAM_CHAT_ID_GESTOR_CS ausente — configure no .env ou passe via opts.gestorChatId');
    this.gestorChatId = chatId;
    this.http = axios.create({
      baseURL: `https://api.telegram.org/bot${token}`,
      timeout: 10_000,
    });
  }

  async send(chatId: string, text: string, opts: { parseMode?: 'Markdown' | 'HTML' } = {}): Promise<void> {
    await withRetry(() =>
      this.http.post('/sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: opts.parseMode ?? 'Markdown',
        disable_web_page_preview: true,
      }),
    );
  }

  /** Shortcut for the CS manager chat. */
  async notifyGestor(text: string, opts: { parseMode?: 'Markdown' | 'HTML' } = {}): Promise<void> {
    await this.send(this.gestorChatId, text, opts);
  }
}
