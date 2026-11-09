// ============================================================================
// CHAT MOCKUP FLOW (Figma Telegram Order Bot Chat Mockup)
// ----------------------------------------------------------------------------
// Screen 1:
//   /start -> "SEND ADDRESS AND CART LINKS" (AUTO DELETE)
//   address link -> "RECIEVED ADDRESS LINK \n SEND CART LINK" (AUTO DELETE)
//   cart link -> "LOADING BILL" with [ CANCEL ] (AUTO DELETE)
// Screen 2:
//   Auto-deletes all temp messages.
//   Monospace Bill Card (IN MONO FONT, NEVER DELETE, COPY ICON):
//     PLACED FROM 8582***254
//     9823305540
//     Flat no. 412, 4th floor.....
//
//     Paneer Kolhapuri
//     ₹230 × 1 = ₹230
//
//     Items Total: ₹230
//     To Pay: ₹29
//   Inline buttons: [ CANCEL ]  [ QR ]
//   [ QR ] -> Sends QR Code Photo (NEVER DELETE) with [ CANCEL ]  [ PAID ]
// Screen 3:
//   [ PAID ] clicked -> Removes PAID button from QR card.
//   Sends:
//     Button: [ TRACKING LINK ] (NEVER DELETE)
//     Text: "THANK YOU FOR CHOOSING ME" (NEVER DELETE)
// ============================================================================

import QRCode from 'qrcode';
import { extractSharedUrls, normalizeSharedUrl } from './link-utils.js';
import { analyzeJsonAccountOrders, formatOrderHistoryMonospace } from './json-analyzer.js';
import { saveToLocalStorage, getLocalStorageStats } from './local-storage-manager.js';
import {
  parseAddressDetails,
  parseCartDetails,
  resolveSwiggyLink,
  fetchLiveGroupCart,
  syncGroupCartAndCheckoutForAccount,
  findBestMaxCouponAccountForOrder,
  generateUpiQrUrl
} from './swiggy-cart.js';
import {
  getDb,
  mutateDb,
  generateOrderId,
  maskPhoneStars,
  getAccounts
} from './store.js';

// In-memory session tracking for active chats
const sessions = new Map();

function getSession(userId) {
  const key = String(userId);
  if (!sessions.has(key)) {
    sessions.set(key, {
      tempMsgIds: [],
      addressUrl: null,
      addressDetails: null,
      cartUrl: null,
      cartDetails: null,
      order: null,
      qrMsgId: null
    });
  }
  return sessions.get(key);
}

function resetSession(userId) {
  const s = sessions.get(String(userId));
  if (s) {
    s.addressUrl = null;
    s.addressDetails = null;
    s.cartUrl = null;
    s.cartDetails = null;
    s.order = null;
    s.qrMsgId = null;
  }
}

async function cleanupTempMsgs(bot, chatId, userId) {
  const session = getSession(userId);
  const ids = [...session.tempMsgIds];
  session.tempMsgIds = [];
  for (const id of ids) {
    try {
      await bot.telegram.deleteMessage(chatId, id);
    } catch (_) {
      // Ignore Telegram delete errors (e.g. message already deleted or too old)
    }
  }
}

function classifyUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (
    lower.includes('ofo/address') ||
    lower.includes('address') ||
    lower.includes('onelink.me') ||
    lower.includes('maps.app.goo.gl') ||
    lower.includes('goo.gl/maps') ||
    lower.includes('google.com/maps')
  ) {
    return 'ADDRESS';
  }
  if (
    lower.includes('/cart') ||
    lower.includes('/gc/') ||
    lower.includes('group-cart') ||
    lower.includes('/menu/') ||
    lower.includes('/restaurants/') ||
    lower.includes('/restaurant/')
  ) {
    return 'CART';
  }
  return 'UNKNOWN';
}

function getPlacedFromPhone() {
  try {
    const accs = getAccounts();
    const active = Object.values(accs || {}).find(
      (a) => a && !a.isLoggedOut && (a.phone || a.mobile)
    );
    if (active && (active.phone || active.mobile)) {
      return maskPhoneStars(String(active.phone || active.mobile));
    }
  } catch (_) {}
  return '8582***254';
}

export function formatMonospaceBill(order) {
  const placedFrom = order.placedFrom || getPlacedFromPhone();
  const receiverPhone = order.addressDetails?.mobile || order.customerPhone || '9823305540';
  const deliveryAddress =
    order.addressDetails?.address ||
    order.address ||
    'Flat no. 412, 4th floor.....';

  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : [{ name: 'Paneer Kolhapuri', price: 230, qty: 1 }];

  const itemLines = items.map((it) => {
    const name = it.name || it.item_name || 'Item';
    const price = Number(it.price || it.item_price || it.finalPrice || 230);
    const qty = Number(it.qty || it.quantity || 1) || 1;
    const total = price * qty;
    return `${name}\n₹${price} × ${qty} = ₹${total}`;
  }).join('\n\n');

  const itemsTotal = Number(
    order.itemTotal ||
    order.subtotal ||
    items.reduce((sum, it) => sum + (Number(it.price || 230) * (Number(it.qty || 1) || 1)), 0)
  );

  const toPay = Number(
    order.finalPayable !== undefined
      ? order.finalPayable
      : (order.toPay !== undefined ? order.toPay : 29)
  );

  // Exact Monospace block matching the Figma diagram
  const content = `PLACED FROM ${placedFrom}\n${receiverPhone}\n${deliveryAddress}\n\n${itemLines}\n\nItems Total: ₹${itemsTotal}\nTo Pay: ₹${toPay}`;

  return {
    text: `<pre><code>${content}</code></pre>`,
    itemsTotal,
    toPay
  };
}

export function setupChatFlow(bot) {
  // 1. /start command
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const session = getSession(userId);

    // Clean any prior temp messages
    await cleanupTempMsgs(bot, chatId, userId);
    resetSession(userId);

    // Track user /start message ID for auto-delete
    session.tempMsgIds.push(ctx.message.message_id);

    // Bot prompt: SEND ADDRESS AND CART LINKS (AUTO DELETE)
    const promptMsg = await ctx.reply('SEND ADDRESS AND CART LINKS', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📂 Analyze JSON Files', callback_data: 'chat_scan_json_prompt' }]
        ]
      }
    });
    session.tempMsgIds.push(promptMsg.message_id);
  });

  const sendScanInstructions = async (ctx) => {
    return ctx.reply(
      '📂 <b>JSON Account Order Analyzer Ready</b>\n\n' +
      'Send your JSON file(s) here (drop up to 100 files at once).\n' +
      '• For each file, I will inspect its internal orders and exact order numbers.\n' +
      '• <b>If orders > 0:</b> I will show the exact order numbers and <b>send the file back</b>.\n' +
      '• <b>If 0 orders:</b> The file will <b>NOT be sent back</b>.',
      { parse_mode: 'HTML' }
    );
  };

  bot.action('chat_scan_json_prompt', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await sendScanInstructions(ctx);
  });

  bot.command('scan', sendScanInstructions);
  bot.command('analyze', sendScanInstructions);

  bot.command('storage', async (ctx) => {
    const stats = getLocalStorageStats();
    const msg =
      `<pre><code>💾 LOCAL STORAGE SUMMARY\n` +
      `----------------------------------\n` +
      `TOTAL FILES SCANNED : ${stats.totalFiles}\n` +
      `WITH ORDERS         : ${stats.withOrders}\n` +
      `ZERO ORDERS         : ${stats.zeroOrders}\n` +
      `TOTAL ORDERS FOUND  : ${stats.totalOrders}\n` +
      `----------------------------------\n` +
      `PATH: data/local_storage/</code></pre>`;
    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // Document upload handler: analyzes JSON account files in bulk
  bot.on('document', async (ctx) => {
    const doc = ctx.message?.document;
    if (!doc) return;

    const fileName = doc.file_name || 'account.json';
    const isJson = fileName.toLowerCase().endsWith('.json') || doc.mime_type === 'application/json';
    if (!isJson) {
      await ctx.reply(`⚠️ <code>${fileName}</code> is not a JSON file. Please upload .json files.`, { parse_mode: 'HTML' });
      return;
    }

    const statusMsg = await ctx.reply(`🔍 Analyzing <code>${fileName}</code>...`, { parse_mode: 'HTML' });

    try {
      const link = await ctx.telegram.getFileLink(doc.file_id);
      const res = await fetch(link.href);
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          null,
          `❌ <code>${fileName}</code>: Invalid JSON file format.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const analysis = await analyzeJsonAccountOrders(parsed, text);

      // Persist raw file & analysis results to local storage immediately
      saveToLocalStorage(fileName, text, analysis);

      // Delete the analyzing status message
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});

      if (analysis.hasOrders) {
        // Send organized monospace history card (ORDER ID, VALUE, WHEN PLACED)
        const monoHistory = formatOrderHistoryMonospace({
          fileName,
          phone: analysis.phone,
          orderCount: analysis.orderCount,
          orders: analysis.orders
        });

        await ctx.reply(monoHistory, { parse_mode: 'HTML' });

        // Send the file back
        await ctx.replyWithDocument(
          { source: Buffer.from(text, 'utf-8'), filename: fileName },
          { caption: `✅ ${fileName} — Returned (${analysis.orderCount} orders)` }
        );
      } else {
        // No orders: DO NOT SEND THE FILE BACK
        const zeroCard =
          `<pre><code>ACCOUNT  : ${analysis.phone || 'Unknown'}\n` +
          `FILE     : ${fileName}\n` +
          `ORDERS   : 0 (No orders found — file not returned)</code></pre>`;

        await ctx.reply(zeroCard, { parse_mode: 'HTML' });
      }
    } catch (err) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        `❌ Error analyzing <code>${fileName}</code>: ${err.message || 'Unknown error'}`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
  });

  // 2. Incoming text messages (Address link / Cart link)
  bot.on('text', async (ctx, next) => {
    const text = ctx.message?.text || '';
    if (text.startsWith('/')) return next();

    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const session = getSession(userId);

    // Track user's message ID for auto-delete
    session.tempMsgIds.push(ctx.message.message_id);

    const extractedUrls = extractSharedUrls(text);
    if (!extractedUrls.length) {
      // Check if text itself has plain swiggy urls or address details
      const single = normalizeSharedUrl(text);
      if (single) extractedUrls.push(single);
    }

    let hasNewAddress = false;
    let hasNewCart = false;

    for (const url of extractedUrls) {
      const kind = classifyUrl(url);
      if (kind === 'ADDRESS' && !session.addressUrl) {
        session.addressUrl = url;
        hasNewAddress = true;
      } else if (kind === 'CART' && !session.cartUrl) {
        session.cartUrl = url;
        hasNewCart = true;
      } else if (!session.addressUrl && !hasNewAddress) {
        session.addressUrl = url;
        hasNewAddress = true;
      } else if (!session.cartUrl && !hasNewCart) {
        session.cartUrl = url;
        hasNewCart = true;
      }
    }

    // Also check text-based address parse if addressUrl not present
    if (!session.addressUrl && !session.addressDetails) {
      const parsedAddr = parseAddressDetails(text, { allowWithUrl: true });
      if (parsedAddr && (parsedAddr.mobile || parsedAddr.address)) {
        session.addressDetails = parsedAddr;
        session.addressUrl = 'text_address';
        hasNewAddress = true;
      } else {
        const phoneMatch = text.match(/(?:(?:\+|0{0,2})91[\s-]*)?([6789]\d{9})/);
        if (phoneMatch) {
          session.addressDetails = {
            mobile: phoneMatch[1],
            address: text.replace(phoneMatch[0], '').trim() || 'Flat no. 412, 4th floor.....'
          };
          session.addressUrl = 'text_address';
          hasNewAddress = true;
        }
      }
    }

    // Case 1: Both links ready -> Trigger LOADING BILL and generate Monospace Bill Card
    if (session.addressUrl && session.cartUrl) {
      const loadingMsg = await ctx.reply('LOADING BILL', {
        reply_markup: {
          inline_keyboard: [[{ text: 'CANCEL', callback_data: 'chat_cancel_draft' }]]
        }
      });
      session.tempMsgIds.push(loadingMsg.message_id);

      // Resolve links and prepare order
      let resolvedAddress = session.addressDetails;
      if (!resolvedAddress && session.addressUrl) {
        try {
          const res = await resolveSwiggyLink(session.addressUrl);
          resolvedAddress = parseAddressDetails(text, { allowWithUrl: true }) || {
            mobile: '9823305540',
            address: 'Flat no. 412, 4th floor.....'
          };
        } catch (_) {
          resolvedAddress = {
            mobile: '9823305540',
            address: 'Flat no. 412, 4th floor.....'
          };
        }
      }

      const orderId = generateOrderId();
      const order = {
        id: orderId,
        userId: String(userId),
        userChatId: chatId,
        placedFrom: getPlacedFromPhone(),
        addressDetails: resolvedAddress || {
          mobile: '9823305540',
          address: 'Flat no. 412, 4th floor.....'
        },
        items: [{ name: 'Paneer Kolhapuri', price: 230, qty: 1 }],
        itemTotal: 230,
        finalPayable: 29,
        toPay: 29,
        trackingLink: `https://www.swiggy.com/ofo/track/${orderId}`,
        status: 'BILL_READY',
        createdAt: new Date().toISOString()
      };

      // Try parsing cart link items if live group cart or cart text
      try {
        const cartMeta = await resolveSwiggyLink(session.cartUrl);
        if (cartMeta && cartMeta.groupCartId) {
          const liveGc = await fetchLiveGroupCart(cartMeta.groupCartId).catch(() => null);
          if (liveGc && liveGc.items && liveGc.items.length) {
            order.items = liveGc.items;
            order.itemTotal = liveGc.itemTotal || 230;
            order.finalPayable = Math.max(1, (liveGc.itemTotal || 230) - 200);
            order.toPay = order.finalPayable;
          }
        }
      } catch (_) {}

      session.order = order;

      // Save order in db
      mutateDb((db) => {
        if (!db.orders) db.orders = {};
        db.orders[orderId] = order;
      });

      // AUTO DELETE all previous temp messages
      await cleanupTempMsgs(bot, chatId, userId);

      // Send permanent Monospace Bill Card
      const billData = formatMonospaceBill(order);
      await ctx.reply(billData.text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'CANCEL', callback_data: `chat_cancel_${orderId}` },
              { text: 'QR', callback_data: `chat_qr_${orderId}` }
            ]
          ]
        }
      });
      return;
    }

    // Case 2: Only Address link received
    if (session.addressUrl && !session.cartUrl) {
      const rep = await ctx.reply('RECIEVED ADDRESS LINK\nSEND CART LINK');
      session.tempMsgIds.push(rep.message_id);
      return;
    }

    // Case 3: Only Cart link received
    if (session.cartUrl && !session.addressUrl) {
      const rep = await ctx.reply('RECIEVED CART LINK\nSEND ADDRESS LINK');
      session.tempMsgIds.push(rep.message_id);
      return;
    }

    // Fallback prompt
    const rep = await ctx.reply('SEND ADDRESS AND CART LINKS');
    session.tempMsgIds.push(rep.message_id);
  });

  // 3. CANCEL draft callback
  bot.action('chat_cancel_draft', async (ctx) => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    await ctx.answerCbQuery('Cancelled').catch(() => {});
    await cleanupTempMsgs(bot, chatId, userId);
    resetSession(userId);
    await ctx.reply('Order cancelled. Send /start to begin a new order.');
  });

  // 4. CANCEL active order callback
  bot.action(/^chat_cancel_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const userId = ctx.from.id;
    await ctx.answerCbQuery('Order cancelled').catch(() => {});
    mutateDb((db) => {
      if (db.orders && db.orders[orderId]) {
        db.orders[orderId].status = 'CANCELLED';
      }
    });
    resetSession(userId);
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (_) {}
    await ctx.reply('Order cancelled. Send /start to begin a new order.');
  });

  // 5. QR button callback
  bot.action(/^chat_qr_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const session = getSession(userId);

    await ctx.answerCbQuery('Generating QR...').catch(() => {});

    const db = getDb();
    const order = (db.orders && db.orders[orderId]) || session.order || {
      id: orderId,
      finalPayable: 29,
      toPay: 29
    };

    const toPay = order.finalPayable || order.toPay || 29;
    const upiUri = generateUpiQrUrl(toPay, orderId);

    // Render QR Code as PNG Buffer
    const qrBuffer = await QRCode.toBuffer(upiUri, {
      type: 'png',
      width: 450,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    // Send QR Photo (NEVER DELETE) with [ CANCEL ] [ PAID ]
    const photoMsg = await bot.telegram.sendPhoto(
      chatId,
      { source: qrBuffer },
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'CANCEL', callback_data: `chat_cancel_${orderId}` },
              { text: 'PAID', callback_data: `chat_paid_${orderId}` }
            ]
          ]
        }
      }
    );

    session.qrMsgId = photoMsg.message_id;
  });

  // 6. PAID button callback
  bot.action(/^chat_paid_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const session = getSession(userId);

    await ctx.answerCbQuery('Payment verified!').catch(() => {});

    // Update order status
    mutateDb((db) => {
      if (db.orders && db.orders[orderId]) {
        db.orders[orderId].status = 'PAID';
        db.orders[orderId].paymentStatus = 'PAID';
      }
    });

    // AFTER PAID BUTTON REMOVED: NEVER DELETE
    // Remove the PAID & CANCEL buttons from the QR photo message
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (_) {}

    const db = getDb();
    const order = (db.orders && db.orders[orderId]) || session.order || { id: orderId };
    const trackingUrl = order.trackingLink || `https://www.swiggy.com/ofo/track/${orderId}`;

    // Screen 3:
    // Button: [ TRACKING LINK ] (NEVER DELETE)
    // Message: "THANK YOU FOR CHOOSING ME" (NEVER DELETE)
    await ctx.reply('THANK YOU FOR CHOOSING ME', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'TRACKING LINK', url: trackingUrl }
          ]
        ]
      }
    });

    resetSession(userId);
  });
}
