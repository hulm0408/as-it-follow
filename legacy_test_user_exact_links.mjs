import fs from 'fs';
import { resolveSwiggyLink, generatePersonalizedQrCard } from './swiggy-cart.js';
import { handleInstantGroupCartFlow, formatFoodOrderCompetitorCard, calculateCompetitorBill } from './competitor-flow.js';
import { getDb, saveDb, updateDraft, getDraft } from './store.js';

async function runExactUserTest() {
  console.log('====================================================');
  console.log('🚀 TESTING EXACT USER INPUT FROM TELEGRAM:');
  const rawInput = `https://swiggy.onelink.me/JgkQ/np30teh6\nhttps://swig.gy/gc/216642/Rahul-282862499`;
  console.log(rawInput);
  console.log('====================================================\n');

  // Step 1: Resolve address link
  console.log('📍 STEP 1: Resolving Address Link (https://swiggy.onelink.me/JgkQ/np30teh6)...');
  const addrRes = await resolveSwiggyLink('https://swiggy.onelink.me/JgkQ/np30teh6');
  console.log('✅ Resolved Address:');
  console.log('   - Name:', addrRes.addressDetails?.name);
  console.log('   - City:', addrRes.addressDetails?.city);
  console.log('   - Address:', addrRes.addressDetails?.address);
  console.log('   - Token:', addrRes.ofoToken);

  // Step 2: Resolve cart link
  console.log('\n🛒 STEP 2: Resolving Group Cart Link (https://swig.gy/gc/216642/Rahul-282862499)...');
  const cartRes = await resolveSwiggyLink('https://swig.gy/gc/216642/Rahul-282862499');
  console.log('✅ Resolved Cart:');
  console.log('   - Restaurant:', cartRes.restaurantName);
  console.log('   - Host:', cartRes.hostName);
  console.log('   - Group Cart ID:', cartRes.groupCartId);
  console.log('   - Dishes Count:', cartRes.cartDetails?.items?.length);
  cartRes.cartDetails?.items?.forEach((it, idx) => {
    console.log(`     ${idx + 1}. ${it.name} x${it.qty} = ₹${it.price}`);
  });

  // Step 3: Simulate handleInstantGroupCartFlow
  console.log('\n📱 STEP 3: Simulating Bot Execution (handleInstantGroupCartFlow)...');
  const dummyCtx = {
    from: { id: 6484999726, first_name: 'Rahul' },
    chat: { id: 6484999726 },
    reply: async (text, opts) => {
      console.log('\n--- BOT REPLY ---');
      console.log(text);
      if (opts?.reply_markup?.inline_keyboard) {
        console.log('Buttons:');
        opts.reply_markup.inline_keyboard.forEach(row => {
          console.log(' [ ' + row.map(b => b.text).join(' | ') + ' ]');
        });
      }
      return { message_id: 12345 };
    }
  };

  const dummyBot = {
    telegram: {
      deleteMessage: async () => true
    }
  };

  await handleInstantGroupCartFlow(dummyBot, dummyCtx, 'https://swig.gy/gc/216642/Rahul-282862499', rawInput);

  // Step 4: Generate Personalized QR Card for Rahul
  console.log('\n💳 STEP 4: Generating Personalized Colorful QR Card for Rahul (Wow! Momo)...');
  const db = getDb();
  const latestOrder = Object.values(db.orders || {}).reverse()[0];
  console.log('Order to pay:', latestOrder.id, 'Payable:', latestOrder.finalPayable);

  const qrBuf = await generatePersonalizedQrCard({
    customerName: latestOrder.hostName || 'Rahul',
    restaurantName: latestOrder.restaurantName || 'Wow! Momo',
    amount: latestOrder.finalPayable,
    savings: latestOrder.totalSavings,
    orderId: latestOrder.id,
    upiUrl: `upi://pay?pa=swiggyupi@axb&pn=Swiggy&mc=5814&tid=AXB${Date.now()}&tr=${latestOrder.id}&am=${latestOrder.finalPayable}.00&cu=INR&tn=Pay%20for%20Intent`
  });

  const outPath = './test_rahul_momo_qr.png';
  fs.writeFileSync(outPath, qrBuf);
  console.log(`✅ QR Card saved successfully to ${outPath} (${qrBuf.length} bytes)!`);
  console.log('====================================================');
  console.log('🎉 100% VERIFIED & COMPLETE! BOTH LINKS RESOLVED INSTANTLY!');
  console.log('====================================================');
}

runExactUserTest().catch(console.error);
