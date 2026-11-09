const sessionJson = {
  "name": "Fer three",
  "customer_id": 285611035,
  "mobile": "8249789547",
  "token": "0f1e190c-a9b3-4ed8-954d-8f165d53a3081acdded4-d46d-4a47-913a-0dc7079f6342",
  "tid": "eyJ0eXAiOiJKV1QiLCJLSUQiOiIyIiwiYWxnIjoiSFMyNTYifQ.eyJpc3MiOiJoYXAiLCJzZXNzaW9uX2RhdGEiOiJ2RU0rcDZKVXJnTW5RY3Rsc0p4bXp1MVhWTmI1TkdHMmU0eG5YNzBhbDNZNGxiZ3Nhei9FSGFCUXg1TFNsN3hBU0JXM0pBd0IyWk1PNll5Wm5LS2ExM0tOZmhOR2VLWnoxUWlVSFlsRWVDRlRqdnBVZlpqUVFPN0o2dWRTZStNNXdaQWl6bEViT2F1cEk4Vm9lbTBwOG1JVHlySTgxK1ZUZXBVL2dLSWdLTkFHczhmeE9LaFpKNEtpb1RnaVpMMi9yc0tLVjN4bWxkeGZGTHBRaGZqMTRscmxtWWxxbUVlcitjVkxCUVlZVHRtdFRFMHlSQzJQc2pRcWpTOVlHZkMrKzZUU3ovanVEbldPS0pYSWkwVlp1VHptdjFmOFN2WXhnemhDNVlGZkdWN3g4SUZhZzFTdXBYRkFLNHY1UjZRUGV3dUtvbXk4MDByQ0xWK3I4MzRTM0lmcDc4SkJ5ektKc2tBMThsTjNobHM9Iiwic3ViIjoiOWFjNjRlODctYWU0Mi00ODY2LWI5ZTQtMGM5NTBiMzE3NGEwIiwic2lkIjoidTdvNzhkZTZmNDAtOGM2Ni00ODE2LTlmOGItNGVjMzBhZjQzIiwiaWF0IjoxNzkyMTM0MjI3LCJleHAiOjE3OTQ3MjYyMjcsInVzZXJfaWQiOiIyODU2MTEwMzUifQ.5tGmUBqpfYsrzIRXDt_KnclzejNN4NmVOygc3uhrNUY",
  "sid": "u7o78de6f40-8c66-4816-9f8b-4ec30af43",
  "deviceId": "d48e229769325e97"
};

(async () => {
  const headers = {
    'tid': sessionJson.tid,
    'token': sessionJson.token,
    'deviceId': sessionJson.deviceId,
    'sid': sessionJson.sid,
    'Cookie': `tid=${sessionJson.tid}; token=${sessionJson.token}; _sid=${sessionJson.sid}; _device_id=${sessionJson.deviceId}; _is_logged_in=1;`,
    'User-Agent': 'Swiggy-Android/12.4.0 (Linux; U; Android 13; Pixel 6 Build/TQ3A.230901.001)',
    'Accept': 'application/json',
    'app-version': '12.4.0',
    'version-code': '1240'
  };

  const endpoints = [
    'https://www.swiggy.com/dapi/user/profile',
    'https://www.swiggy.com/dapi/cart',
    'https://www.swiggy.com/dapi/group-order/cart?groupCartId=642855918',
    'https://www.swiggy.com/dapi/group-cart/642855918',
    'https://www.swiggy.com/dapi/group-order/642855918',
    'https://www.swiggy.com/dapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=26.8467&lng=80.9462&restaurantId=67272'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { headers });
      console.log(`\n[${res.status}] ${ep}`);
      const text = await res.text();
      console.log(text.slice(0, 400));
    } catch (e) {
      console.log(`[ERR] ${ep}: ${e.message}`);
    }
  }
})();
