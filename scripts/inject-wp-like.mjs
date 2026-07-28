// (구) 추천 버튼 전용 주입기 → 지금은 여러 블록을 다루는 inject-wp-js.mjs 로 통합됐다.
// 기존 명령을 쓰던 습관이 깨지지 않게 그대로 넘겨준다.
console.log('→ scripts/inject-wp-js.mjs 로 통합됨. 그대로 실행합니다.\n');
await import('./inject-wp-js.mjs');
