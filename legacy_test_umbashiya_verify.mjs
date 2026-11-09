import { verifyAndInspectSwiggyLink, resolveSwiggyLink } from './swiggy-cart.js';
import { getDb } from './store.js';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_6296591407']; // Umbashiya
  const cartUrl = 'https://swig.gy/gc/67272/Umbashiya-642855918';

  console.log('Resolving URL:', cartUrl);
  const meta = await resolveSwiggyLink(cartUrl);
  console.log('Resolved Meta:', meta);

  console.log('\nRunning verifyAndInspectSwiggyLink with Umbashiya...');
  const result = await verifyAndInspectSwiggyLink(cartUrl, acc.cookies, {
    token: acc.token,
    tid: acc.tid,
    sid: acc.sid,
    deviceId: acc.deviceId
  });

  console.log('\nVerification Result:', JSON.stringify(result, null, 2));
})();
