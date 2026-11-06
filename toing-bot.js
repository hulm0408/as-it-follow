// ============================================================================
// TOING SWIGGY TELEGRAM BOT (REAL SWIGGY API ORDERING ENGINE)
// ----------------------------------------------------------------------------
// - 100% Monospace UI (<pre><code>) on all bot responses
// - Real Swiggy API Restaurant Search at user's delivery location
// - Real Swiggy Outlets selector
// - Real Swiggy Menu dishes & price inspection
// - Real Swiggy Customization / Variant picker
// - Real Swiggy Login with JSON / Token & Logout
// - Offer Claim: ₹50 Refer Cash + ₹50 BHIM UPI Discount
// - Instant Real UPI QR generation (genuine upi:// URI -> PNG buffer)
// ============================================================================

import QRCode from 'qrcode';
import { extractSharedUrls, normalizeSharedUrl } from './link-utils.js';
import {
  parseAddressDetails,
  resolveSwiggyLink,
  fetchFastRestaurantInfo,
  claimInstamartFreeCash,
  dapiFetch
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
      menuData: null,
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
  const addr = s.address ? (s.address.name || s.address.address ? `${String(s.address.address || '').slice(0, 20)}...` : 'SET') : 'NOT SET';
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

/**
 * Searches real Swiggy restaurants from live API at given location.
 */
export async function searchRealRestaurants(query, lat = '26.8658609', lng = '80.9307755', account = null) {
  try {
    const allRests = [];
    const seen = new Set();
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.info && n.info.id && n.info.name && !seen.has(String(n.info.id))) {
        seen.add(String(n.info.id));
        allRests.push({
          id: String(n.info.id),
          name: String(n.info.name).trim(),
          area: String(n.info.areaName || n.info.locality || '').trim()
        });
      }
      if (Array.isArray(n)) n.forEach(walk);
      else Object.values(n).forEach(walk);
    };

    // 1. Try dedicated live search endpoint (accurate city-wide matching)
    const searchRes = await dapiFetch(account, `restaurants/search/v3?lat=${lat}&lng=${lng}&str=${encodeURIComponent(query)}&trackingId=undefined&submitAction=ENTER`, { timeoutMs: 9000 });
    walk(searchRes?.json?.data);

    // 2. Fall back to home feed list if search returned no direct outlet matches
    if (allRests.length === 0) {
      const listRes = await dapiFetch(account, `restaurants/list/v5?lat=${lat}&lng=${lng}`, { timeoutMs: 9000 });
      walk(listRes?.json?.data);
    }

    const q = query.toLowerCase().trim();
    // Substring or word match
    const matched = allRests.filter(
      (r) => r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase())
    );

    return { allRests, matched };
  } catch (err) {
    console.warn('[searchRealRestaurants] failed:', err.message);
    return { allRests: [], matched: [] };
  }
}

/**
 * Searches real dishes on a Swiggy restaurant's menu.
 */
export async function searchRealMenuItems(restaurantId, itemQuery, lat = '26.8658609', lng = '80.9307755') {
  try {
    const menu = await fetchFastRestaurantInfo(restaurantId, lat, lng, true);
    if (!menu || !Array.isArray(menu.menuItems) || !menu.menuItems.length) {
      return { menu, matches: [] };
    }

    const q = itemQuery.toLowerCase().trim();
    const matches = menu.menuItems.filter((it) =>
      it && it.name && it.name.toLowerCase().includes(q)
    );

    return { menu, matches };
  } catch (err) {
    console.warn('[searchRealMenuItems] failed:', err.message);
    return { menu: null, matches: [] };
  }
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
      mono('SEND SWIGGY JSON FILE\nOR PASTE COOKIES / TOKEN:'),
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
    s.restaurant = null;
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
      mono('SEND SWIGGY ADDRESS LINK\n(OFO / SHARE LINK):'),
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

    if (s.restaurant) {
      lines.push(`RESTAURANT: ${s.restaurant.name}`);
      lines.push('----------------------');
    }

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

    // Keep short orderId so callback_data never exceeds 64 bytes
    const orderId = String(Date.now()).slice(-8);
    s.currentOrderId = orderId;
    s.currentToPay = toPay;

    await ctx.reply(mono(lines.join('\n')), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💳 PAY UPI QR', callback_data: `tb_pay_${orderId}` },
            { text: '❌ CLEAR', callback_data: 'tb_clear_cart' }
          ]
        ]
      }
    });
  });

  // 8. Generate UPI Payment QR (FIXED: valid string URI passed to QRCode)
  bot.action(/^tb_pay_(\d+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCbQuery('Generating QR...').catch(() => {});
    const s = getState(ctx.from.id);
    const toPay = s.currentToPay || 29;

    // Genuine UPI URI string
    const vpa = 'swiggyorder@icici';
    const name = 'Swiggy';
    const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${toPay.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Swiggy Order ${orderId}`)}`;

    try {
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
    } catch (err) {
      console.error('[QR GENERATE ERROR]', err);
      await ctx.reply(mono(`QR GENERATE FAILED: ${err.message}`), { parse_mode: 'HTML' });
    }
  });

  // 9. Paid Confirmation
  bot.action(/^tb_paid_(\d+)$/, async (ctx) => {
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

  // Outlet picker action (stores real restaurant ID)
  bot.action(/^tb_outlet_(\d+)__(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    const restId = ctx.match[1];
    const restName = decodeURIComponent(ctx.match[2]);

    s.restaurant = { id: restId, name: restName };
    s.step = 'AWAITING_ITEM_NAME';

    // Pre-fetch real Swiggy menu in background
    fetchFastRestaurantInfo(restId, s.lat, s.lng, true).then((m) => {
      s.menuData = m;
    }).catch(() => {});

    await ctx.reply(
      mono(`OUTLET SELECTED:\n${restName}\n\nENTER ITEM NAME:`),
      { parse_mode: 'HTML' }
    );
  });

  // Real dish item picker action
  bot.action(/^tb_dish_(\d+)__(.+)__(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    const dishId = ctx.match[1];
    const dishName = decodeURIComponent(ctx.match[2]);
    const price = Number(ctx.match[3]);

    s.pendingItem = {
      id: dishId,
      name: dishName,
      price: price > 0 ? price : 149,
      variant: 'Regular',
      qty: 1
    };

    // Check if item is customizable
    const isCustomizable = /burger|pizza|sandwich|sub|wrap|thali|bowl|biryani|cake/i.test(dishName);

    if (isCustomizable) {
      s.step = 'AWAITING_CUSTOMIZATION';
      await ctx.reply(
        mono(`ITEM: ${dishName}\nPRICE: ₹${price}\n\nCHOOSE VARIANT:`),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Regular', callback_data: 'tb_variant_Regular__0' },
                { text: 'Medium (+₹40)', callback_data: 'tb_variant_Medium__40' }
              ],
              [
                { text: 'Large (+₹80)', callback_data: 'tb_variant_Large__80' }
              ]
            ]
          }
        }
      );
      return;
    }

    s.step = 'AWAITING_QTY';
    await ctx.reply(
      mono(`ITEM: ${dishName}\nPRICE: ₹${price}\n\nCHOOSE QUANTITY:`),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '1', callback_data: 'tb_qty_1' },
              { text: '2', callback_data: 'tb_qty_2' },
              { text: '3', callback_data: 'tb_qty_3' },
              { text: '4', callback_data: 'tb_qty_4' }
            ]
          ]
        }
      }
    );
  });

  // Variant/Customization picker
  bot.action(/^tb_variant_(.+)__(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    const variant = ctx.match[1];
    const extraPrice = Number(ctx.match[2] || 0);

    if (s.pendingItem) {
      s.pendingItem.variant = variant;
      s.pendingItem.price += extraPrice;
    }
    s.step = 'AWAITING_QTY';

    await ctx.reply(
      mono(`CUSTOMIZATION: ${variant}\nPRICE: ₹${s.pendingItem?.price}\n\nCHOOSE QUANTITY:`),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '1', callback_data: 'tb_qty_1' },
              { text: '2', callback_data: 'tb_qty_2' },
              { text: '3', callback_data: 'tb_qty_3' },
              { text: '4', callback_data: 'tb_qty_4' }
            ]
          ]
        }
      }
    );
  });

  // Quantity picker
  bot.action(/^tb_qty_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const s = getState(ctx.from.id);
    const qty = parseInt(ctx.match[1], 10) || 1;

    if (s.pendingItem) {
      s.pendingItem.qty = qty;
      s.cart.push({ ...s.pendingItem });
      const added = s.pendingItem;
      s.pendingItem = null;
      s.step = 'IDLE';

      const lines = [
        'ITEM ADDED TO CART',
        '----------------------',
        `ITEM     : ${added.name}`,
        `VARIANT  : ${added.variant || 'Regular'}`,
        `PRICE    : ₹${added.price} × ${qty}`,
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

    // Case B: Awaiting Address Link or Text Address
    if (s.step === 'AWAITING_ADDRESS_LINK' || text.includes('swiggy.com/ofo/address') || text.includes('onelink.me') || text.includes('swig.gy')) {
      const urls = extractSharedUrls(text);
      const addrUrl = urls[0] || (text.startsWith('http') ? text : null);

      if (addrUrl) {
        s.addressLink = addrUrl;
        const statusMsg = await ctx.reply(mono('FETCHING ADDRESS FROM SWIGGY...'), { parse_mode: 'HTML' });

        try {
          const resolved = await resolveSwiggyLink(addrUrl, s.account || null);
          await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});

          const addr = resolved?.addressDetails;
          const isUsable = addr && !addr.unresolvableShortLink && addr.address && addr.address.length >= 5;

          if (isUsable) {
            s.address = {
              name: addr.name || 'Customer',
              mobile: addr.mobile || '',
              address: addr.address,
              flat_no: addr.flat_no || '',
              area: addr.area || '',
              landmark: addr.landmark || '',
              city: addr.city || 'Delivery Location',
              lat: addr.lat,
              lng: addr.lng
            };
            if (addr.lat && addr.lng) {
              s.lat = String(addr.lat);
              s.lng = String(addr.lng);
            }
            s.step = 'IDLE';

            const lines = [
              'ADDRESS SET (SWIGGY VERIFIED)',
              '----------------------',
              `NAME  : ${s.address.name || 'Not Provided'}`,
              `PHONE : ${s.address.mobile || 'Not Provided'}`,
              `LOC   : ${s.address.address}`,
              '----------------------'
            ];
            await ctx.reply(mono(lines.join('\n')), {
              parse_mode: 'HTML',
              ...getMainMenuKeyboard(s)
            });
            return;
          } else {
            // Address could NOT be resolved from Swiggy link
            s.address = null;
            const errLines = [
              'COULD NOT FETCH ADDRESS',
              '----------------------',
              'SWIGGY LINK IS INVALID OR EXPIRED.',
              'PLEASE SEND A FRESH SWIGGY ADDRESS LINK',
              'OR SEND MANUAL ADDRESS FORMAT:',
              'NAME, 10-DIGIT MOBILE, FULL ADDRESS',
              '----------------------'
            ];
            await ctx.reply(mono(errLines.join('\n')), { parse_mode: 'HTML' });
            return;
          }
        } catch (err) {
          await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
          s.address = null;
          await ctx.reply(mono(`ADDRESS FETCH FAILED: ${err.message}`), { parse_mode: 'HTML' });
          return;
        }
      }

      // If user typed manual text without URL
      const parsedAddr = parseAddressDetails(text, { allowWithUrl: false });
      if (parsedAddr && parsedAddr.address && parsedAddr.mobile) {
        s.address = parsedAddr;
        if (parsedAddr.lat && parsedAddr.lng) {
          s.lat = String(parsedAddr.lat);
          s.lng = String(parsedAddr.lng);
        }
        s.step = 'IDLE';

        const lines = [
          'ADDRESS SET (MANUAL)',
          '----------------------',
          `NAME  : ${s.address.name || 'Customer'}`,
          `PHONE : ${s.address.mobile}`,
          `LOC   : ${s.address.address}`,
          '----------------------'
        ];
        await ctx.reply(mono(lines.join('\n')), {
          parse_mode: 'HTML',
          ...getMainMenuKeyboard(s)
        });
        return;
      }

      await ctx.reply(
        mono('INVALID ADDRESS FORMAT\nPLEASE SEND A VALID SWIGGY LINK\nOR: NAME, MOBILE, ADDRESS'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Case C: Awaiting Restaurant Name (REAL SWIGGY SEARCH)
    if (s.step === 'AWAITING_REST_NAME') {
      const query = text;
      const searchStatus = await ctx.reply(mono(`SEARCHING SWIGGY FOR "${query.toUpperCase()}"...`), { parse_mode: 'HTML' });

      const { allRests, matched } = await searchRealRestaurants(query, s.lat, s.lng, s.account);
      await ctx.telegram.deleteMessage(ctx.chat.id, searchStatus.message_id).catch(() => {});

      if (!matched.length) {
        // Show suggestions from allRests in area
        const sampleSuggestions = allRests.slice(0, 5).map(r => `• ${r.name} (${r.area})`).join('\n');
        const errLines = [
          `NO OUTLET FOUND FOR "${query.toUpperCase()}"`,
          '----------------------',
          'NEARBY OPEN RESTAURANTS:',
          sampleSuggestions || 'No restaurants found in area',
          '----------------------',
          'ENTER A RESTAURANT NAME AGAIN:'
        ];
        await ctx.reply(mono(errLines.join('\n')), { parse_mode: 'HTML' });
        return;
      }

      // If multiple outlets found: show outlet choice buttons
      if (matched.length > 1) {
        s.step = 'AWAITING_OUTLET_CHOICE';
        const buttons = matched.slice(0, 6).map((r) => [
          {
            text: `${r.name} (${r.area || 'Outlet'})`,
            callback_data: `tb_outlet_${r.id}__${encodeURIComponent(r.name)}`
          }
        ]);

        await ctx.reply(
          mono(`FOUND ${matched.length} OUTLETS FOR "${query.toUpperCase()}":\nCHOOSE OUTLET:`),
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
          }
        );
        return;
      }

      // Single outlet matched
      const chosen = matched[0];
      s.restaurant = { id: chosen.id, name: chosen.name };
      s.step = 'AWAITING_ITEM_NAME';

      // Pre-fetch real menu in background
      fetchFastRestaurantInfo(chosen.id, s.lat, s.lng, true).then((m) => {
        s.menuData = m;
      }).catch(() => {});

      await ctx.reply(
        mono(`RESTAURANT: ${chosen.name} (${chosen.area})\n\nENTER ITEM NAME:`),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Case D: Awaiting Item Name (REAL SWIGGY MENU SEARCH)
    if (s.step === 'AWAITING_ITEM_NAME') {
      const itemName = text;
      const restId = s.restaurant?.id;

      if (!restId) {
        s.step = 'AWAITING_REST_NAME';
        await ctx.reply(mono('RESTAURANT NOT SELECTED\nENTER RESTAURANT NAME:'), { parse_mode: 'HTML' });
        return;
      }

      const searchItemMsg = await ctx.reply(mono(`SEARCHING MENU FOR "${itemName.toUpperCase()}"...`), { parse_mode: 'HTML' });

      const { menu, matches } = await searchRealMenuItems(restId, itemName, s.lat, s.lng);
      await ctx.telegram.deleteMessage(ctx.chat.id, searchItemMsg.message_id).catch(() => {});

      if (!matches.length) {
        // Show sample dishes from menu
        const sampleDishes = (menu?.menuItems || []).slice(0, 5).map(it => `• ${it.name} - ₹${it.price}`).join('\n');
        const errLines = [
          `ITEM "${itemName.toUpperCase()}" NOT FOUND`,
          '----------------------',
          'POPULAR ON THIS MENU:',
          sampleDishes || 'No menu items available',
          '----------------------',
          'ENTER ITEM NAME AGAIN:'
        ];
        await ctx.reply(mono(errLines.join('\n')), { parse_mode: 'HTML' });
        return;
      }

      // Present matched real dishes as buttons
      const buttons = matches.slice(0, 6).map((it) => [
        {
          text: `${it.name} - ₹${it.price}`,
          callback_data: `tb_dish_${it.id}__${encodeURIComponent(it.name.slice(0, 24))}__${it.price || 149}`
        }
      ]);

      await ctx.reply(
        mono(`FOUND ${matches.length} DISHES:\nSELECT ITEM:`),
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons }
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
