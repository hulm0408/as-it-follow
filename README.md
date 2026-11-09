# Toing Swiggy Bot

Telegram bot for automated Swiggy food ordering with real-time restaurant search, live menu dish selection, address intake, official checkout bill rendering, merchant UPI QR generation, payment verification, and real tracking extraction.

## Architecture

`index.js` mounts exactly one active service:
- **`toing-bot.js`**: Core conversational Telegram bot engine managing state, sessions, menu browsing, cart management, checkout, UPI payments, and order tracking.
- **`swiggy-cart.js`**: Underlying Swiggy API engine handling live DAPI endpoints, restaurant discovery, cart calculations, merchant UPI QR creation (`chkout.swiggy.com/api/v2/order/place`), gateway payment confirmation (`payments.swiggy.com/api/v3/order/confirm`), and order tracking extraction.
- **`waf-pool.js`**: Shared WAF token pool maintaining active AWS WAF tokens for fast-path Swiggy DAPI requests.
- **`link-utils.js`**: Swiggy URL extraction and normalization utilities.
- **`phone-utils.js`**: Indian phone number parsing and formatting helpers.
- **`network-shield.js`**: Telegram transport agent and resilient network retry layer.

## Commands

- `/start`: Open main dashboard and resume any pending unpaid order.
- `/help`: Display complete usage guide and the user's Telegram ID.
- `/cancel`: Cancel active order or reset current input step.

## Security & Operational Guardrails

- **Single-Flight Payment Verification**: Idempotent locks prevent concurrent double-confirmation on Telegram button taps.
- **Live Bill Truth**: Live cart charges (item total, packing, delivery, taxes, discounts, wallet pay) render directly from Swiggy cart payloads.
- **Amount Verification**: Fails closed with `QR_AMOUNT_MISMATCH` if gateway intent amount deviates from cart calculation.
- **Disk Persistence**: User sessions, addresses, and orders persist in `data/state.json` via atomic tmp-replace with AES-256-GCM encryption at rest and 7-day inactive pruning.
- **Access Control & Limits**: Whitelist enforcement via `ALLOWED_USER_IDS` / `BOSS_ID`, 20 messages/minute rate limiting, and 5 MB document upload cap.

## Testing

```bash
npm test
```
Executes the hermetic offline unit test suite in `test_toing_bot.mjs`.

## Legacy Modules (`legacy/`)

The following historical modules were disconnected from `index.js` and moved to `legacy/`:
- `boss-panel.js`: Old admin multi-account slot control panel, superseded by direct single-user Toing bot flows.
- `simple-chat.js`: Previous prototype two-link chat mode, replaced by full Toing bot menu and cart engine.
- `forwarded-order-flow.js`: Obsolete order-forwarding topic handler for group slots, no longer mounted.
- `order-tracking.js`: Legacy polling tracker superseded by `extractRealSwiggyTracking` in `swiggy-cart.js`.
- `vault-sync.js`: Unused GitHub gist synchronization service for historical shared multi-account vaults.
- `account-vault-intake.js`: Obsolete batch zip intake for shared accounts vault, superseded by per-user direct session intake.
- `channel-gate.js`: Dead Telegram channel subscription gate, not part of the core bot workflow.
- `chat-flow.js`: Deprecated interactive conversational wizard superseded by `toing-bot.js`.
- `lazy-order-pilot.js`: Unused automated slot ordering autopilot queue.
- `sms-notify.js`: Fast2SMS parent notification service from multi-tenant slot bot.
- `tracking-validation.js`: Dead validator helpers merged into `swiggy-cart.js`.
- `ammi-abbu-topic-flow.js`: Deprecated Telegram forum-topic progression handler for legacy "Beta" bot.
- `boss-mirror.js`: Dead forwarder that mirrored user chats into a boss group.
- `menu-labels.js`: Redundant menu labeling heuristics superseded by direct DAPI restaurant and menu parsing.
- `scan-diagnostics.js`: Diagnostics formatter for the decommissioned multi-account vault scanner.
