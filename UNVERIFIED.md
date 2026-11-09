# UNVERIFIED.md

The following operations require live external infrastructure (Telegram bot gateway, live Swiggy DAPI, live UPI settlement) and cannot be verified via offline tests:

1. **Live Telegram Bot Updates Polling (`@its_toing_bot`):**
   - Polling updates from Telegram bot token `9162341634:AAGHvmopXvQaFGBy9a_jrWCjgr-OfRLbZiI`.
   - Incoming button callback queries and inline keyboards rendering on mobile Telegram clients.

2. **Live Swiggy Restaurant Search (`/dapi/restaurants/list/v5`):**
   - Live location-based menu search for open outlets around Lucknow / Indian GPS coordinates.

3. **Live Swiggy Checkout Order Placement (`https://chkout.swiggy.com/api/v2/order/place`):**
   - Live creation of dynamic pending UPI order tokens with real user sessions (`tid`, `_session_tid`, `token`).

4. **Live UPI Merchant Gateway Settlement & Confirmation (`payments.swiggy.com/api/v3/order/confirm`):**
   - Verifying actual bank settlement from user UPI apps (GPay, PhonePe, Paytm, BHIM) to Swiggy ICICI merchant VPA.

5. **Live CloudFront & AWS WAF Challenges:**
   - Real-world interaction with CloudFront bot mitigation challenges on live Indian network carriers.

