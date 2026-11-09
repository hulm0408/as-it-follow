import http from 'node:http';
import './network-shield.js';
import { installBulletproofTelegramTransport } from './network-shield.js';
import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { setupToingBot } from './toing-bot.js';

// Mount lightweight HTTP health check server if PORT is provided (Render Web Service compatibility)
const port = process.env.PORT;
if (port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[HEALTH SERVER] Listening on port ${port}`);
  });
}

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('[FATAL] BOT_TOKEN missing in environment or .env!');
  process.exit(1);
}

const bot = new Telegraf(token);

// Install bulletproof network shield for Indian ISP & cloud connectivity
installBulletproofTelegramTransport(bot);

// Mount TOING Bot Engine
setupToingBot(bot);

// Error catcher
bot.catch((err, ctx) => {
  console.error(`[TELEGRAF ERROR] Chat ID: ${ctx?.chat?.id || 'unknown'}`, err.message || err);
});

async function launchBot() {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
    bot.launch();
    console.log(`[TOING BOT LIVE] Running locally with token ${token.slice(0, 10)}...`);
  } catch (err) {
    console.error('[LAUNCH ERROR]', err.message || err);
    setTimeout(launchBot, 3000);
  }
}

launchBot();

// Graceful stop
process.once('SIGINT', () => {
  try { bot.stop('SIGINT'); } catch (_) {}
});
process.once('SIGTERM', () => {
  try { bot.stop('SIGTERM'); } catch (_) {}
});
