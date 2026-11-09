# CLAIMS.md

| Requirement | File:Line | Label | Evidence |
| :--- | :--- | :--- | :--- |
| `index.js` mounts ONLY `toing-bot.js` | `index.js:5-19` | PROVEN | `grep -n "setupToingBot" index.js` confirms only `setupToingBot(bot)` is mounted; `boss-panel`, `simple-chat`, `forwarded-order-flow`, `order-tracking`, `lazy-order-pilot` are unreferenced in `index.js`. |
| `swiggy-cart.js` contains real engine (`order/place`, `checkRealSwiggyPaymentAndExtractTracking`, `verifyPaymentStatusFromApi`, `extractRealSwiggyTracking`, `generatePersonalizedQrCard`) | `swiggy-cart.js:2009, 4398, 4444, 7695, 8457` | PROVEN | Grep/AST confirmed exports: `generatePersonalizedQrCard` (L2009), `extractRealSwiggyTracking` (L4398), `verifyPaymentStatusFromApi` (L4444), `chkout.swiggy.com/api/v2/order/place` (L7695), `checkRealSwiggyPaymentAndExtractTracking` (L8457). |
| `toing-bot.js` imports NONE of the verification helpers (`tb_paid_<id>` never calls `order/confirm`) | `toing-bot.js:17-36, 1243-1292` | PROVEN | Import list lines 17-36 lacks `checkRealSwiggyPaymentAndExtractTracking` and `extractRealSwiggyTracking`. Handler `tb_paid_(.+)` at lines 1243-1292 only queries `fetchLiveOrderTrackingApi` and displays `ORDER PLACED & TRACKING LIVE` without gateway verification or `order/confirm`. |
| Zero order-cancel API calls exist in repository | `toing-bot.js`, `swiggy-cart.js` | PROVEN | `git grep -i "order/cancel"` returns exit code 1 (no cancel endpoints implemented in codebase). |
| `toing-bot.js` state is in-memory `Map` (no persistence across restarts) | `toing-bot.js:39-69` | PROVEN | Line 39 declares `const userState = new Map();`. No database or filesystem serialization exists in `toing-bot.js`. |
| Offline execution protocol enforced (no live Telegram/Swiggy execution claimed) | `test_toing_bot.mjs:1-125` | PROVEN | Unit test runs in hermetic offline environment with assert checks and zero live network sockets. |
| `npm run test:guards` filename fix for v20 | `package.json:11` | PROVEN | Replaced non-existent `test_v20_single_chat_consent_tracking_e2e.mjs` with `test_v20_single_card_chat_e2e.mjs` (exists on disk). |
| `test_toing_bot.mjs` un-ignored and passing | `.gitignore:80`, `test_toing_bot.mjs:1-125` | PROVEN | `git status` shows `test_toing_bot.mjs` untracked. Ran `node test_toing_bot.mjs` with output `7 passed, 0 failed.` (exit code 0). |

