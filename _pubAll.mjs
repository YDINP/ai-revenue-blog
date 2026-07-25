const auth='Basic '+Buffer.from('ben:'+process.env.WP_APP_PASS).toString('base64');
const B='https://mungge.com/wp-json/wp/v2';
const H={Authorization:auth,'Content-Type':'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// 모든 draft 글 수집
let drafts=[], page=1;
while(true){
  const r=await fetch(`${B}/posts?status=draft&per_page=100&page=${page}&_fields=id,slug`,{headers:{Authorization:auth}});
  if(!r.ok) break;
  const arr=await r.json();
  if(!arr.length) break;
  drafts.push(...arr); page++;
  if(arr.length<100) break;
}
console.log('발행 대상 draft:', drafts.length);
let ok=0, fail=0;
for(const p of drafts){
  try{
    const r=await fetch(`${B}/posts/${p.id}`,{method:'POST',headers:H,body:JSON.stringify({status:'publish'})});
    if(r.ok){ ok++; if(ok%25===0) console.log(`  ${ok}개 발행...`); }
    else { fail++; console.log('  ❌', p.id, r.status); }
  }catch(e){ fail++; console.log('  ❌', p.id, e.message); }
  await sleep(400);
}
console.log(`\n완료: 발행 ${ok} / 실패 ${fail}`);
// 발행 확인
const cnt=await (await fetch(`${B}/posts?status=publish&per_page=1&_fields=id`,{headers:{Authorization:auth}})).json();
console.log('현재 발행글 총계 확인용 요청 완료');
