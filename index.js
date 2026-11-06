import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { setupToingBot } from './toing-bot.js';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('[FATAL] BOT_TOKEN missing in environment or .env!');
  process.exit(1);
}

const bot = new Telegraf(token);

// Mount TOING Bot Engine
setupToingBot(bot);

// Error catcher
bot.catch((err, ctx) => {
  console.error(`[TELEGRAF ERROR] Chat ID: ${ctx?.chat?.id || 'unknown'}`, err);
});

// Launch bot
bot.launch().then(() => {
  console.log('[TOING BOT LIVE] Ready on Telegram!');
}).catch((err) => {
  console.error('[LAUNCH ERROR]', err);
  process.exit(1);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
