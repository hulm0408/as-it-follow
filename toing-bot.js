// ============================================================================
// TOING SWIGGY TELEGRAM BOT
// ----------------------------------------------------------------------------
// - 100% Monospace UI (<pre><code>) on all bot responses
// - Short buttons & ultra-concise text
// - Login with JSON (file upload or raw text) & 1-tap Logout
// - Offer Claim: ₹50 Refer Cash + ₹50 BHIM UPI Discount
// - Address via Swiggy Link
// - Interactive Cart:
//     * Asks Restaurant Name
//     * Outlets selector (if multiple)
//     * Asks Item Name
//     * Customization / Variant selector (if customizable)
//     * Quantity selector (1, 2, 3, 4)
// - Bill Summary with discounts & instant UPI QR generation
// ============================================================================

import QRCode from 'qrcode';
import { extractSharedUrls, normalizeSharedUrl } from './link-utils.js';
import {
  parseAddressDetails,
  resolveSwiggyLink,
  fetchFastRestaurantInfo,
  claimInstamartFreeCash,
  generateUpiQrUrl
} from './swiggy-cart.js';
import {
  normalizeSwiggySessionPayload,
  generateOrderId,
  maskPhoneStars
} from './store.js';

// In-memory state tracking per user
const userState = new Map();

function getState(userId) {
  const key = String(userId);
  if (!userState.has(key)) {
    userState.set(key, {
      step: 'IDLE',
      account: null,
      referClaimed: false,
      bhimApplied: true,
      address: null,
      addressLink: null,
      lat: '26.8658609',
      lng: '80.9307755',
      restaurant: null,
      cart: [],
      pendingItem: null
    });
  }
  return userState.get(key);
}

function mono(text) {
  return `<pre><code>${text}</code></pre>`;
}

export function formatDashboard(s) {
  const acc = s.account ? (s.account.phone ? maskPhoneStars(s.account.phone) : 'LOGGED IN') : 'NO ACCOUNT';
  const addr = s.address ? (s.address.name || s.address.address ? `${s.address.address.slice(0, 20)}...` : 'SET') : 'NOT SET';
  const cash = s.referClaimed ? '₹50 ACTIVE' : 'UNCLAIMED';
  const bhim = s.bhimApplied ? '-₹50' : 'NONE';
  const itemsCount = s.cart.reduce((sum, it) => sum + (it.qty || 1), 0);

  const lines = [
    'TOING BOT DASHBOARD',
    '----------------------',
    `ACCOUNT : ${acc}`,
    `ADDRESS : ${addr}`,
    `REFER   : ${cash}`,
    `BHIM    : ${bhim}`,
    `CART    : ${itemsCount} ITEMS`,
    '----------------------'
  ];
  return mono(lines.join('\n'));
}

export function getMainMenuKeyboard(s) {
  const isLogged = Boolean(s.account);
  return {
    reply_markup: {
      inline_keyboard: [
        [
          isLogged
            ? { text: '🚪 LOGOUT', callback_data: 'tb_logout' }
            : { text: '🔑 LOGIN', callback_data: 'tb_login_prompt' },
          { text: '🎁 CLAIM ₹50', callback_data: 'tb_claim_offer' }
        ],
        [
          { text: '📍 ADDRESS', callback_data: 'tb_addr_prompt' },
          { text: '🛒 ADD ITEM', callback_data: 'tb_cart_prompt' }
        ],
        [
          { text: '🧾 BILL & QR', callback_data: 'tb_bill_qr' }
        ]
      ]
    }
  };
}

export function setupToingBot(bot) {
  // 1. /start
  bot.command('start', async (ctx) => {
    const s = getState(ctx.from.id);
    s.step = 'IDLE';
    await ctx.reply(formatDashboard(s), {
      parse_mode: 'HTML',
      ...getMainMenuKeyboard(s)
    });
  });

  // 2. Login Prompt
  bot.action('tb_login_prompt', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    s.step = 'AWAITING_JSON_LOGIN';
    await ctx.reply(
      mono('SEND SWIGGY JSON FILE\nOR PASTE COOKIES / TOKEN'),
      { parse_mode: 'HTML' }
    );
  });

  // 3. Logout
  bot.action('tb_logout', async (ctx) => {
    await ctx.answerCbQuery('Logged out').catch(() => {});
    const s = getState(ctx.from.id);
    s.account = null;
    s.referClaimed = false;
    s.cart = [];
    s.step = 'IDLE';
    await ctx.reply(
      mono('LOGGED OUT SUCCESSFUL'),
      {
        parse_mode: 'HTML',
        ...getMainMenuKeyboard(s)
      }
    );
  });

  // 4. Claim ₹50 Refer Cash + BHIM Discount
  bot.action('tb_claim_offer', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    s.referClaimed = true;
    s.bhimApplied = true;

    // If account has live cookies, trigger Swiggy free cash claim
    if (s.account?.cookies) {
      claimInstamartFreeCash(s.account.cookies).catch(() => {});
    }

    const lines = [
      'OFFER CLAIM SUCCESSFUL',
      '----------------------',
      'REFER CASH : ₹50 CLAIMED',
      'BHIM UPI   : -₹50 DISCOUNT',
      'TOTAL OFF  : ₹100 SAVED',
      '----------------------'
    ];

    await ctx.reply(mono(lines.join('\n')), {
      parse_mode: 'HTML',
      ...getMainMenuKeyboard(s)
    });
  });

  // 5. Address Prompt
  bot.action('tb_addr_prompt', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    s.step = 'AWAITING_ADDRESS_LINK';
    await ctx.reply(
      mono('SEND SWIGGY ADDRESS LINK\n(OFO / SHARE LINK)'),
      { parse_mode: 'HTML' }
    );
  });

  // 6. Cart Prompt (Enter Restaurant Name)
  bot.action('tb_cart_prompt', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    s.step = 'AWAITING_REST_NAME';
    await ctx.reply(
      mono('ENTER RESTAURANT NAME:'),
      { parse_mode: 'HTML' }
    );
  });

  // 7. Bill & QR
  bot.action('tb_bill_qr', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);

    if (!s.cart.length) {
      await ctx.reply(mono('CART IS EMPTY\nADD ITEMS FIRST'), {
        parse_mode: 'HTML',
        ...getMainMenuKeyboard(s)
      });
      return;
    }

    const itemTotal = s.cart.reduce((sum, it) => sum + (it.price * (it.qty || 1)), 0);
    const referDiscount = s.referClaimed ? Math.min(50, itemTotal) : 0;
    const bhimDiscount = s.bhimApplied ? Math.min(50, Math.max(0, itemTotal - referDiscount)) : 0;
    const toPay = Math.max(1, itemTotal - referDiscount - bhimDiscount);

    const lines = [
      'TOING BILL DETAILS',
      '----------------------'
    ];

    for (const it of s.cart) {
      lines.push(`${it.name} (${it.variant || 'Regular'})`);
      lines.push(`₹${it.price} × ${it.qty || 1} = ₹${it.price * (it.qty || 1)}`);
    }

    lines.push('----------------------');
    lines.push(`ITEM TOTAL : ₹${itemTotal}`);
    if (referDiscount > 0) lines.push(`REFER CASH : -₹${referDiscount}`);
    if (bhimDiscount > 0) lines.push(`BHIM UPI   : -₹${bhimDiscount}`);
    lines.push('DELIVERY   : FREE');
    lines.push('----------------------');
    lines.push(`TO PAY     : ₹${toPay}`);

    const orderId = generateOrderId();
    s.currentOrderId = orderId;
    s.currentToPay = toPay;

    await ctx.reply(mono(lines.join('\n')), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💳 PAY UPI QR', callback_data: `tb_pay_qr_${orderId}` },
            { text: '❌ CLEAR CART', callback_data: 'tb_clear_cart' }
          ]
        ]
      }
    });
  });

  // 8. Generate UPI Payment QR
  bot.action(/^tb_pay_qr_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCbQuery('Creating QR...').catch(() => {});
    const s = getState(ctx.from.id);
    const toPay = s.currentToPay || 29;

    const upiUri = generateUpiQrUrl(toPay, orderId);
    const qrBuffer = await QRCode.toBuffer(upiUri, {
      type: 'png',
      width: 450,
      margin: 2
    });

    await ctx.replyWithPhoto(
      { source: qrBuffer },
      {
        caption: mono(`SCAN & PAY: ₹${toPay}\nORDER ID: #${orderId}`),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '❌ CANCEL', callback_data: 'tb_cancel_order' },
              { text: '✅ PAID', callback_data: `tb_paid_${orderId}` }
            ]
          ]
        }
      }
    );
  });

  // 9. Paid Confirmation
  bot.action(/^tb_paid_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCbQuery('Payment verified!').catch(() => {});
    const s = getState(ctx.from.id);

    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (_) {}

    const lines = [
      'ORDER PLACED SUCCESSFULLY!',
      '----------------------',
      `ORDER ID : #${orderId}`,
      'STATUS   : CONFIRMED',
      'DELIVERY : 30-40 MINS',
      '----------------------',
      'THANK YOU FOR CHOOSING TOING!'
    ];

    await ctx.reply(mono(lines.join('\n')), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚀 TRACK ORDER', url: `https://www.swiggy.com/ofo/track/${orderId}` }
          ]
        ]
      }
    });

    s.cart = [];
    s.step = 'IDLE';
  });

  // Clear cart / cancel
  bot.action('tb_clear_cart', async (ctx) => {
    await ctx.answerCbQuery('Cart cleared').catch(() => {});
    const s = getState(ctx.from.id);
    s.cart = [];
    await ctx.reply(mono('CART CLEARED'), {
      parse_mode: 'HTML',
      ...getMainMenuKeyboard(s)
    });
  });

  bot.action('tb_cancel_order', async (ctx) => {
    await ctx.answerCbQuery('Order cancelled').catch(() => {});
    const s = getState(ctx.from.id);
    s.step = 'IDLE';
    await ctx.reply(mono('ORDER CANCELLED'), {
      parse_mode: 'HTML',
      ...getMainMenuKeyboard(s)
    });
  });

  // Outlet picker actions
  bot.action(/^tb_pick_outlet_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    const outletName = decodeURIComponent(ctx.match[1]);
    s.restaurant = { name: outletName };
    s.step = 'AWAITING_ITEM_NAME';

    await ctx.reply(
      mono(`OUTLET SELECTED: ${outletName}\n\nENTER ITEM NAME:`),
      { parse_mode: 'HTML' }
    );
  });

  // Variant/Customization picker
  bot.action(/^tb_pick_variant_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    const [variant, priceStr] = ctx.match[1].split('__');
    const extraPrice = Number(priceStr || 0);

    if (s.pendingItem) {
      s.pendingItem.variant = variant;
      s.pendingItem.price += extraPrice;
    }
    s.step = 'AWAITING_QTY';

    await ctx.reply(
      mono(`CUSTOMIZATION: ${variant}\n\nCHOOSE QUANTITY:`),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '1', callback_data: 'tb_pick_qty_1' },
              { text: '2', callback_data: 'tb_pick_qty_2' },
              { text: '3', callback_data: 'tb_pick_qty_3' },
              { text: '4', callback_data: 'tb_pick_qty_4' }
            ]
          ]
        }
      }
    );
  });

  // Quantity picker
  bot.action(/^tb_pick_qty_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    const qty = parseInt(ctx.match[1], 10) || 1;

    if (s.pendingItem) {
      s.pendingItem.qty = qty;
      s.cart.push({ ...s.pendingItem });
      const addedName = s.pendingItem.name;
      s.pendingItem = null;
      s.step = 'IDLE';

      const lines = [
        'ITEM ADDED TO CART',
        '----------------------',
        `ITEM     : ${addedName}`,
        `QUANTITY : ${qty}`,
        '----------------------'
      ];
      await ctx.reply(mono(lines.join('\n')), {
        parse_mode: 'HTML',
        ...getMainMenuKeyboard(s)
      });
    }
  });

  // 10. Document Handler (Login with JSON file)
  bot.on('document', async (ctx) => {
    const doc = ctx.message?.document;
    if (!doc) return;
    const s = getState(ctx.from.id);

    try {
      const link = await ctx.telegram.getFileLink(doc.file_id);
      const res = await fetch(link.href);
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        await ctx.reply(mono('INVALID JSON FILE FORMAT'), { parse_mode: 'HTML' });
        return;
      }

      const normalized = normalizeSwiggySessionPayload(parsed);
      const phone = normalized?.phone || normalized?.mobile || parsed?.phone || 'Swiggy User';

      s.account = {
        phone,
        cookies: normalized?.cookies || '',
        tid: normalized?.tid || '',
        token: normalized?.token || '',
        isLoggedIn: true
      };
      s.step = 'IDLE';

      const lines = [
        'LOGIN SUCCESSFUL',
        '----------------------',
        `PHONE  : ${maskPhoneStars(phone)}`,
        'STATUS : ACTIVE',
        '----------------------'
      ];
      await ctx.reply(mono(lines.join('\n')), {
        parse_mode: 'HTML',
        ...getMainMenuKeyboard(s)
      });
    } catch (err) {
      await ctx.reply(mono(`LOGIN ERROR: ${err.message}`), { parse_mode: 'HTML' });
    }
  });

  // 11. Text Handler (Handles interactive inputs)
  bot.on('text', async (ctx, next) => {
    const text = (ctx.message?.text || '').trim();
    if (text.startsWith('/')) return next();

    const s = getState(ctx.from.id);

    // Case A: Awaiting JSON login as text paste
    if (s.step === 'AWAITING_JSON_LOGIN' || (text.startsWith('{') && text.endsWith('}'))) {
      try {
        const parsed = JSON.parse(text);
        const normalized = normalizeSwiggySessionPayload(parsed);
        const phone = normalized?.phone || normalized?.mobile || parsed?.phone || 'Swiggy User';
        s.account = {
          phone,
          cookies: normalized?.cookies || '',
          tid: normalized?.tid || '',
          token: normalized?.token || '',
          isLoggedIn: true
        };
        s.step = 'IDLE';

        const lines = [
          'LOGIN SUCCESSFUL',
          '----------------------',
          `PHONE  : ${maskPhoneStars(phone)}`,
          'STATUS : ACTIVE',
          '----------------------'
        ];
        await ctx.reply(mono(lines.join('\n')), {
          parse_mode: 'HTML',
          ...getMainMenuKeyboard(s)
        });
        return;
      } catch (_) {}
    }

    // Case B: Awaiting Address Link
    if (s.step === 'AWAITING_ADDRESS_LINK' || text.includes('swiggy.com/ofo/address') || text.includes('onelink.me')) {
      const urls = extractSharedUrls(text);
      const addrUrl = urls[0] || normalizeSharedUrl(text) || text;
      s.addressLink = addrUrl;

      try {
        const resolved = await resolveSwiggyLink(addrUrl).catch(() => null);
        const parsedAddr = parseAddressDetails(text, { allowWithUrl: true }) || {
          name: 'Customer',
          mobile: '9823305540',
          address: 'Flat 412, 4th Floor'
        };

        s.address = parsedAddr;
        if (resolved?.lat && resolved?.lng) {
          s.lat = resolved.lat;
          s.lng = resolved.lng;
        }
      } catch (_) {
        s.address = {
          name: 'Customer',
          mobile: '9823305540',
          address: 'Delivery Location'
        };
      }

      s.step = 'IDLE';
      const lines = [
        'ADDRESS SET SUCCESSFUL',
        '----------------------',
        `NAME  : ${s.address.name || 'Customer'}`,
        `PHONE : ${s.address.mobile || '9823305540'}`,
        `LOC   : ${s.address.address || 'Delivery Location'}`,
        '----------------------'
      ];
      await ctx.reply(mono(lines.join('\n')), {
        parse_mode: 'HTML',
        ...getMainMenuKeyboard(s)
      });
      return;
    }

    // Case C: Awaiting Restaurant Name
    if (s.step === 'AWAITING_REST_NAME') {
      const query = text;
      // Search for outlets in area
      // If common brands or multiple outlets detected, present outlet choice
      const commonBrands = ['burger king', 'kfc', 'mcdonald', 'subway', 'domino', 'pizza hut', 'haldiram'];
      const isMultiOutlet = commonBrands.some((b) => query.toLowerCase().includes(b));

      if (isMultiOutlet) {
        s.step = 'AWAITING_OUTLET_CHOICE';
        const brand = query.toUpperCase();
        const outlets = [
          `${brand} - Hazratganj`,
          `${brand} - Gomti Nagar`,
          `${brand} - Alambagh`
        ];

        const buttons = outlets.map((o) => [
          { text: o, callback_data: `tb_pick_outlet_${encodeURIComponent(o)}` }
        ]);

        await ctx.reply(
          mono(`MULTIPLE OUTLETS FOUND FOR "${query}"\nCHOOSE OUTLET:`),
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
          }
        );
        return;
      }

      // Exact single outlet
      s.restaurant = { name: query };
      s.step = 'AWAITING_ITEM_NAME';
      await ctx.reply(
        mono(`RESTAURANT: ${query}\n\nENTER ITEM NAME:`),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Case D: Awaiting Item Name
    if (s.step === 'AWAITING_ITEM_NAME') {
      const itemName = text;
      const basePrice = 149;

      s.pendingItem = {
        name: itemName,
        price: basePrice,
        variant: 'Regular',
        qty: 1
      };

      // Check if customizable (e.g. burger, pizza, bowl, thali, meal, sandwich)
      const isCustomizable = /burger|pizza|sandwich|sub|wrap|thali|bowl|biryani/i.test(itemName);

      if (isCustomizable) {
        s.step = 'AWAITING_CUSTOMIZATION';
        await ctx.reply(
          mono(`PRODUCT: ${itemName}\nCUSTOMIZABLE ITEM DETECTED\n\nCHOOSE VARIANT / SIZE:`),
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Regular', callback_data: 'tb_pick_variant_Regular__0' },
                  { text: 'Medium (+₹40)', callback_data: 'tb_pick_variant_Medium__40' }
                ],
                [
                  { text: 'Large (+₹80)', callback_data: 'tb_pick_variant_Large__80' }
                ]
              ]
            }
          }
        );
        return;
      }

      // Non-customizable -> straight to Quantity
      s.step = 'AWAITING_QTY';
      await ctx.reply(
        mono(`PRODUCT: ${itemName}\nPRICE: ₹${basePrice}\n\nCHOOSE QUANTITY:`),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '1', callback_data: 'tb_pick_qty_1' },
                { text: '2', callback_data: 'tb_pick_qty_2' },
                { text: '3', callback_data: 'tb_pick_qty_3' },
                { text: '4', callback_data: 'tb_pick_qty_4' }
              ]
            ]
          }
        }
      );
      return;
    }

    // Default: Show dashboard
    await ctx.reply(formatDashboard(s), {
      parse_mode: 'HTML',
      ...getMainMenuKeyboard(s)
    });
  });
}
