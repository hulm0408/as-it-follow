const url = 'https://www.swiggy.com/dapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=26.892114374733&lng=80.9455500698667&restaurantId=67272';

fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
})
  .then(r => r.json())
  .then(j => {
    const str = JSON.stringify(j);
    const m = str.match(/"couponCode":"([^"]+)"/g) || [];
    console.log('Coupons found in menu:', m);
    for (const c of (j?.data?.cards || [])) {
      const s = JSON.stringify(c);
      if (s.includes('offers') || s.includes('coupon')) {
        const offers = c.card?.card?.gridElements?.infoWithStyle?.offers;
        if (offers) {
          console.log('Offers list:', offers.map(o => ({
            code: o.info?.couponCode,
            header: o.info?.header,
            desc: o.info?.description,
            discountType: o.info?.discountType
          })));
        }
      }
    }
  })
  .catch(e => console.error(e));
