# Operational Runbook: Toing Swiggy Bot

Production operational manual and verification runbook for `@its_toing_bot`.

---

## 1. Zero-to-Paid-Order Live Verification Procedure

### Step 1: Start & Authorization Check
* **User Input:** Send `/start`
* **Expected Output (Whitelisted / Default):**
  ```
  👑 TOING SWIGGY DASHBOARD
  ----------------------
  ACCOUNT   : NO ACCOUNT
  DELIVERY  : NOT SET
  FREE CASH : UNCLAIMED
  BHIM OFFER: -₹50 (AUTO)
  CART      : 0 ITEMS
  ACTIVE ORD: NONE
  ----------------------
  SEND ADDRESS LINK OR RESTAURANT NAME:
  ```
* **Expected Output (Unwhitelisted):**
  ```
  ACCESS DENIED. YOUR TELEGRAM ID IS: 123456789
  ```

### Step 2: Session Login & Free Cash Inspection
* **User Input:** Send Swiggy session JSON file (or raw JSON text)
* **Proof Output (Valid session with Free Cash):**
  ```
  ACCOUNT ACCEPTED & SAVED
  ----------------------
  PHONE     : 98******10
  FREE CASH : ₹50 (CLAIMED)
  STATUS    : READY FOR 1-TAP CHECKOUT
  ----------------------
  ```
* **Proof Output (Valid session without Free Cash):**
  ```
  ACCOUNT REJECTED (NO FREE CASH)
  ----------------------
  PHONE     : 98******10
  FREE CASH : ₹0
  ----------------------
  [⚡ FORCE LOGIN (+₹50)] [🔙 MAIN MENU]
  ```

### Step 3: Delivery Address Configuration
* **User Input:** Send Swiggy share-address link (e.g., `https://swiggy.onelink.me/JgkQ/...`) or address text
* **Proof Output:**
  ```
  DELIVERY ADDRESS CONFIRMED
  ----------------------
  NAME     : Home
  ADDRESS  : Flat 402, Hazratganj, Lucknow
  COORDS   : 26.8467, 80.9462
  ----------------------
  ENTER RESTAURANT NAME TO ORDER:
  ```

### Step 4: Restaurant & Dish Selection
* **User Input:** Send `Patanwala`
* **Proof Output (Open Outlets List):**
  ```
  SELECT OPEN OUTLET:
  ----------------------
  [1. Patanwala - Chowk (Open)]
  [2. Patanwala - Aliganj (Open)]
  ```
* **User Action:** Tap outlet button, select dish, select quantity.
* **Proof Output (Cart Updated):**
  ```
  ADDED TO CART:
  Milk Cow 1 Ltr (₹86 × 1)
  Milk Cow 500 Ml (₹46 × 1)
  ----------------------
  CART TOTAL: ₹132 (2 items)
  ```

### Step 5: Checkout & Live Bill Generation
* **User Action:** Tap `💳 CHECKOUT`
* **Proof Output (Authentic Swiggy Live Bill & Personalized QR):**
  ```
  SWIGGY OFFICIAL LIVE BILL
  ----------------------
  RESTAURANT : Patanwala
  ----------------------
  Milk Cow 1 Ltr
  ₹86 × 1 = ₹86
  Milk Cow 500 Ml
  ₹46 × 1 = ₹46
  ----------------------
  ITEM TOTAL : ₹132
  PACKING    : FREE
  DELIVERY   : FREE
  TAXES/FEES : ₹6.6
  COUPON OFF : -₹20 (TRYNEW)
  FREE CASH  : -₹50
  ----------------------
  FINAL PAY  : ₹69
  ```
  Accompanied by personalized QR card image buffer with embedded UPI intent:
  `upi://pay?pa=swiggy...&am=69.00`
  Buttons: `[ ✅ I HAVE PAID ]` `[ ❌ CANCEL ]`

### Step 6: Payment Verification & Live Tracking
* **User Action:** Pay ₹69 in UPI app, tap `✅ I HAVE PAID`
* **Immediate Proof (Single-Flight Lock on double-tap):**
  Telegram callback alert: `"check chal raha hai..."`
* **Proof Output (Confirmed Payment):**
  ```
  ORDER CONFIRMED & TRACKING LIVE
  ----------------------
  ORDER ID : #198273645013
  STATUS   : CONFIRMED
  RIDER    : Assigned
  TRACKING : https://www.swiggy.com/track/198273645013
  ----------------------
  ```
  Button: `[ 🛵 LIVE SWIGGY TRACKING ]`

### Step 7: Order Cancellation Flow
* **User Action:** Tap `❌ CANCEL` on pending unpaid order
* **Proof Output (Confirmation Step):**
  ```
  ARE YOU SURE YOU WANT TO CANCEL?
  ----------------------
  ORDER ID : #198273645013
  AMOUNT   : ₹69
  Cart items will be restored.
  ```
* **User Action:** Tap `⚠️ CONFIRM CANCEL`
* **Proof Output (Cancelled & Cart Restored):**
  ```
  ORDER CANCELLED SUCCESSFULLY
  ----------------------
  ORDER ID : #198273645013
  SWIGGY   : CANCELLED (dapi)
  CART     : RESTORED (2 items)
  ----------------------
  ```

---

## 2. Live Failure Modes & Remediation Matrix

| Symptom / Error Code | Root Cause | Bot Behavior | Exact Remediation |
| :--- | :--- | :--- | :--- |
| `SWIGGY_SECURITY_CHALLENGE` / HTTP 403 | AWS WAF bot challenge or CloudFront block | Logs `[FALLBACK] DAPI failed, attempting chkout` | Bot automatically pulls fresh token from `waf-pool.js`. If hard-blocked, run `node -e "import('./waf-pool.js').then(m => m.refreshWafToken())"`. |
| `QR_AMOUNT_MISMATCH` | Cart expired or restaurant changed item prices before gateway response | Throws named error; refuses to overwrite UPI amount | Re-tap `💳 CHECKOUT` to flush and regenerate fresh cart session. |
| `TOO_LATE_TO_CANCEL` | Restaurant has already started preparing food or rider picked up | Preserves local order; keeps `[ 🔄 CHECK PAYMENT ]` and `[ 📊 TRACK ORDER ]` intact | User must use Swiggy in-app help/support for post-dispatch cancellations. |
| `RATE LIMIT EXCEEDED` | User sent > 20 messages in 60 seconds | Drops request with alert: `Maximum 20 messages per minute` | Wait 60 seconds for the sliding window to clear. |
| `FILE TOO LARGE` | Uploaded document exceeds 5 MB | Drops document with `Uploaded file exceeds 5 MB limit` | Compress or trim session accounts file to < 5 MB. |
| `Corrupted state.json detected` | Hard crash during non-atomic write or disk corruption | Backs up corrupt file to `state.json.corrupt.<ts>` and starts fresh state | Inspect backup file. Run `node -e "import('./toing-bot.js').then(m => m.loadStateFromDisk())"`. |

---

## 3. Operational Administration

### Important Migration Notice
> **NOTE:** accounts must be re-uploaded once after M4 restart to ensure session tokens are encrypted at rest with AES-256-GCM.

### Whitelist Management
* Add authorized users:
  ```bash
  # In .env or Render Dashboard Environment:
  ALLOWED_USER_IDS=6484999726,987654321,112233445
  ```
* Fallback administrator:
  ```bash
  BOSS_ID=6484999726
  ```

### State Backup & Recovery
* Backup active state:
  ```bash
  cp /app/data/state.json /app/data/state.json.bak.$(date +%F_%T)
  ```
* Inspect state summary without decrypting:
  ```bash
  node -e "import fs from 'node:fs'; const d = JSON.parse(fs.readFileSync('./data/state.json','utf8')); console.log('Users:', Object.keys(d.users).length, 'SavedAt:', new Date(d.savedAt).toISOString());"
  ```

### Rotating Bot Token
1. Generate new token via `@BotFather`.
2. Update `BOT_TOKEN` in Render Environment or `.env`.
3. Safe process restart:
   ```bash
   kill -TERM $(pgrep -f "node index.js")
   ```
   `toing-bot.js` handles `SIGTERM` gracefully, flushing all in-memory state to `state.json` before exiting.
