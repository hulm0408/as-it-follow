import fetch from 'node-fetch';

const session = {
  customer_id: 285611035,
  mobile: '8249789547',
  token: '0f1e190c-a9b3-4ed8-954d-8f165d53a3081acdded4-d46d-4a47-913a-0dc7079f6342',
  tid: 'eyJ0eXAiOiJKV1QiLCJLSUQiOiIyIiwiYWxnIjoiSFMyNTYifQ.eyJpc3MiOiJoYXAiLCJzZXNzaW9uX2RhdGEiOiJ2RU0rcDZKVXJnTW5RY3Rsc0p4bXp1MVhWTmI1TkdHMmU0eG5YNzBhbDNZNGxiZ3Nhei9FSGFCUXg1TFNsN3hBU0JXM0pBd0IyWk1PNll5Wm5LS2ExM0tOZmhOR2VLWnoxUWlVSFlsRWVDRlRqdnBVZlpqUVFPN0o2dWRTZStNNXdaQWl6bEViT2F1cEk4Vm9lbTBwOG1JVHlySTgxK1ZUZXBVL2dLSWdLTkFHczhmeE9LaFpKNEtpb1RnaVpMMi9yc0tLVjN4bWxkeGZGTHBRaGZqMTRscmxtWWxxbUVlcitjVkxCUVlZVHRtdFRFMHlSQzJQc2pRcWpTOVlHZkMrKzZUU3ovanVEbldPS0pYSWkwVlp1VHptdjFmOFN2WXhnemhDNVlGZkdWN3g4SUZhZzFTdXBYRkFLNHY1UjZRUGV3dUtvbXk4MDByQ0xWK3I4MzRTM0lmcDc4SkJ5ektKc2tBMThsTjNobHM9Iiwic3ViIjoiOWFjNjRlODctYWU0Mi00ODY2LWI5ZTQtMGM5NTBiMzE3NGEwIiwic2lkIjoidTdvNzhkZTZmNDAtOGM2Ni00ODE2LTlmOGItNGVjMzBhZjQzIiwiaWF0IjoxNzkyMTM0MjI3LCJleHAiOjE3OTQ3MjYyMjcsInVzZXJfaWQiOiIyODU2MTEwMzUifQ.5tGmUBqpfYsrzIRXDt_KnclzejNN4NmVOygc3uhrNUY',
  sid: 'u7o78de6f40-8c66-4816-9f8b-4ec30af43',
  deviceId: 'd48e229769325e97'
};

async function test() {
  const headers = {
    'User-Agent': 'Swiggy/5.2.0 (Android 14; Mobile)',
    'tid': session.tid,
    'token': session.token,
    'sid': session.sid,
    'deviceId': session.deviceId,
    'Cookie': `tid=${session.tid}; _sid=${session.sid}; _device_id=${session.deviceId}; token=${session.token}; _is_logged_in=1`
  };
  
  try {
    const res = await fetch('https://www.swiggy.com/dapi/profile', { headers });
    console.log('Profile status:', res.status);
    const text = await res.text();
    console.log('Profile response:', text.slice(0, 300));
  } catch (e) {
    console.error('Fetch error:', e.message);
  }

  try {
    const cartRes = await fetch('https://www.swiggy.com/dapi/cart', { headers });
    console.log('\nCart status:', cartRes.status);
    const cartText = await cartRes.text();
    console.log('Cart response:', cartText.slice(0, 300));
  } catch (e) {
    console.error('Cart error:', e.message);
  }
}
test();
