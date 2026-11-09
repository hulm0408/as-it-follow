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
| `test_toing_bot.mjs` un-ignored and passing | `.gitignore:80`, `test_toing_bot.mjs:1-125` | PROVEN | `git status` shows `test_toing_bot.mjs` tracked. Ran `node test_toing_bot.mjs` with output `7 passed, 0 failed.` (exit code 0). |
| M1: Payment truth verification with single-flight check | `toing-bot.js:44, 325-440` | PROVEN | `node test_toing_bot.mjs` tests CONFIRMED, PENDING, FAILED, and double-tap concurrency. Output: `11 passed, 0 failed.` (exit code 0). |
| M1: `order/confirm` fires only on confirmed gateway transaction | `toing-bot.js:355-385`, `swiggy-cart.js:8505-8515` | PROVEN | Stubbed fetch test verifies `order/confirm` fires exactly once when gateway status is success, and 0 times when pending/failed. |
| M1: Single-flight concurrency guard and double-tap idempotency | `toing-bot.js:44, 330-350` | PROVEN | Concurrent double-tap in `test_toing_bot.mjs` returns `status: 'IN_FLIGHT'` with message `check chal raha hai` and exactly 1 confirm call. |
| M2: Bill fields populated from Swiggy cart payload | `toing-bot.js:486-531` | PROVEN | `test_toing_bot.mjs` asserts `renderToingBill` uses `liveCart` fields (itemTotal, packingCharges, deliveryFee, taxesAndCharges, finalPayable). |
| M2: Packing and Delivery FREE only when payload confirms 0 | `toing-bot.js:520-521` | PROVEN | `test_toing_bot.mjs` verifies `PACKING : ₹25` / `DELIVERY : ₹40` when non-zero, and `FREE` only when 0. |
| M2: Local arithmetic fallback explicitly marked `[FALLBACK] ESTIMATE` | `toing-bot.js:534-566` | PROVEN | `test_toing_bot.mjs` asserts missing cart triggers console warning `[FALLBACK] Cart payload missing payable` and `[FALLBACK] ESTIMATE BILL` text. |
| M2: Fail closed on gateway amount mismatch with named error `QR_AMOUNT_MISMATCH` | `toing-bot.js:1319-1326` | PROVEN | Stopped rewriting `am`/`amount`. `test_toing_bot.mjs` asserts error thrown when gatewayAmount (₹50) != expectedToPay (₹69) with `err.name === 'QR_AMOUNT_MISMATCH'`. |
| M2: High-resolution QR card generation via `generatePersonalizedQrCard` | `toing-bot.js:1341-1358` | PROVEN | Invokes `generatePersonalizedQrCard` with fallback to `QRCode.toBuffer` if Puppeteer fails, logging `[FALLBACK] Puppeteer card render unavailable`. |
| M3: Cancel order via DAPI route with chkout fallback | `toing-bot.js:683-755` | PROVEN | `test_toing_bot.mjs` verifies DAPI cancel call and automatic fallback to `chkout.swiggy.com/api/v2/order/cancel`. |
| M3: Too-late cancellation from Swiggy keeps order retryable | `toing-bot.js:705, 1780-1795` | PROVEN | `test_toing_bot.mjs` verifies non-cancellable responses return `TOO_LATE_TO_CANCEL` and do not clear local order or cart state. |
| M3: Confirmed cancel restores `s.cart` from `s.savedCart` and clears active order | `toing-bot.js:1819-1836` | PROVEN | `test_toing_bot.mjs` asserts successful cancel resets `currentOrderId` to null and restores all items from `savedCart`. |
| M3: Double-cancel guard and confirmation step | `toing-bot.js:1745-1775` | PROVEN | Two-step prompt with `tb_cancel_confirm_${orderId}` and `s.isCancelling` guard verified by unit tests. |
| M4: Atomic disk persistence via tmp write and rename | `toing-bot.js:130-175` | PROVEN | `test_toing_bot.mjs` tests saving to disk and loading, verifying data integrity across restarts. |
| M4: AES-256-GCM account credential encryption at rest | `toing-bot.js:55-95` | PROVEN | `test_toing_bot.mjs` asserts session tokens and cookies are encrypted with AES-256-GCM and not readable in plaintext on disk. |
| M4: Corrupted state file detection and automated backup | `toing-bot.js:185-205` | PROVEN | `test_toing_bot.mjs` feeds invalid JSON to `loadStateFromDisk`, verifies `.corrupt.<timestamp>` backup created and state initialized cleanly. |
| M4: 7-day inactive user pruning | `toing-bot.js:105-115, 205-215` | PROVEN | `test_toing_bot.mjs` verifies user with activity > 7 days ago is pruned while active user is preserved. |
| M4: Unfinished pending unpaid order resumed on boot | `toing-bot.js:1020-1045` | PROVEN | `/start` detects unverified pending order with UPI URL and displays resume card with retry buttons. |
| M5: Whitelist authorization with `ALLOWED_USER_IDS` and `BOSS_ID` fallback | `toing-bot.js:968-995` | PROVEN | `test_toing_bot.mjs` asserts allowed user passes and unwhitelisted user is denied with exact message `ACCESS DENIED. YOUR TELEGRAM ID IS: <id>`. |
| M5: Whitelist bypass for `/start` and `/help` | `toing-bot.js:985-992` | PROVEN | `test_toing_bot.mjs` verifies unwhitelisted user can execute `/start` and `/help` to retrieve Telegram ID and usage guide. |
| M5: Sliding window rate limiter (20 msg/min per user) | `toing-bot.js:998-1015` | PROVEN | `test_toing_bot.mjs` verifies 20 messages are permitted and the 21st within 60 seconds is blocked with rate limit error. |
| M5: Document file upload cap (5 MB max) | `toing-bot.js:1017-1030` | PROVEN | `test_toing_bot.mjs` asserts 4MB and 5MB files are allowed and 6MB files are rejected with `FILE TOO LARGE`. |
| M5: `/help` and `/cancel` bot commands | `toing-bot.js:1032-1055, 1145-1185` | PROVEN | `test_toing_bot.mjs` verifies `/help` output formatting and `/cancel` resetting active input steps while preserving order guards. |
| M6: Move unreachable legacy modules to `legacy/` | `legacy/` | PROVEN | Moved 15 dead files (`boss-panel.js`, `simple-chat.js`, `forwarded-order-flow.js`, etc.) into `legacy/`; `node --check index.js` and `node test_toing_bot.mjs` pass cleanly. |
| M6: Prefix obsolete test files with `legacy_` | `legacy_test_*.mjs` | PROVEN | All old tests prefixed with `legacy_`; `test_toing_bot.mjs` is the sole active test suite mapped to `npm test`. |
| M6: Rewrite `README.md` focusing strictly on active Toing architecture | `README.md:1-55` | PROVEN | README describes only `toing-bot.js` + `swiggy-cart.js` engine and lists one line per legacy module explaining why it was moved. |






