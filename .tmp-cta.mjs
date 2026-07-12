import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
await p.goto('http://localhost:8006/blog/2026-07-12-review-webcam-mic-recommendation-2026/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const r = await p.evaluate(()=>{
  const ctas = document.querySelectorAll('#post-content .coupang-cta-inline');
  const items = [...ctas].map(a=>({product:a.getAttribute('data-product'), href:(a.getAttribute('href')||'').slice(0,45)}));
  // 중간 삽입 확인: 각 CTA의 앞/뒤에 h2가 존재하는지
  const midPositions = [...ctas].map(a=>{
    const wrap = a.closest('.mid-coupang-wrap');
    let before=false, after=false, n=wrap;
    while((n=n.previousElementSibling)) if(n.tagName==='H2'){before=true;break;}
    n=wrap; while((n=n.nextElementSibling)) if(n.tagName==='H2'){after=true;break;}
    return {before, after};
  });
  return { count: ctas.length, items, midPositions, dataRemoved: !document.getElementById('mid-coupang-data') };
});
const cta = await p.$('#post-content .coupang-cta-inline');
if (cta) await cta.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await p.screenshot({ path: 'C:/Users/a/AppData/Local/Temp/cta.png' });
console.log(JSON.stringify(r, null, 1));
await b.close();
