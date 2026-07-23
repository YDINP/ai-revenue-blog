---
title: "Phaser 3 실전 프로젝트: 충돌·물리·애니메이션 완벽 마스터 2026"
description: "Phaser 3로 만드는 웹게임의 핵심 5가지: 충돌 감지·중력·입력 처리·스프라이트 애니메이션. 완성된 게임 예제 코드로 지금 시작하세요."
pubDate: 2026-07-23
author: "TechFlow"
category: "Game"
tags: ["Phaser 3", "웹게임 개발", "JavaScript 게임", "게임 물리 엔진", "웹 게임 프레임워크"]

coupangLinks:
  - title: "게임 프로그래밍 패턴"
    url: "https://link.coupang.com/a/dJj5U5"
  - title: "유니티 교과서"
    url: "https://link.coupang.com/a/dJj8Bn"
faq:
  - q: "Phaser 3에서 충돌 감지와 오버랩의 정확한 차이는?"
    a: "collider는 두 물체가 부딪히면 이동을 멈추고(물리 반응), overlap은 만났는지만 감지하고 통과합니다. 플레이어가 플랫폼에 서야 하면 collider, 수집 아이템이라면 overlap을 사용합니다."
  - q: "60fps를 유지하려면 어떻게 해야 하나?"
    a: "Static Group으로 움직이지 않는 객체를 분류하고, 화면 밖 객체는 culling으로 처리하세요. 객체가 100개 이상이면 Canvas 대신 WebGL 렌더러를 사용해야 합니다."
  - q: "모바일에서도 Phaser 3 게임이 잘 작동하나?"
    a: "네, Phaser 3는 터치 입력과 반응형 레이아웃을 기본 지원합니다. 단, 모바일 성능은 기기마다 크게 달라지므로 테스트를 충분히 해야 하고, 객체 수를 50개 이하로 제한하는 것이 안전합니다."
---

## Phaser 3: 웹게임 개발의 실전 완성판

이미 **Phaser.js 웹 게임 개발 완벽 가이드**에서 기본 설정과 장면 구조를 배웠다면, 이제는 실제 게임처럼 동작하는 프로젝트를 만들 차례입니다. Phaser 3는 단순한 도형 그리기를 넘어 **충돌 감지, 물리 엔진, 자연스러운 애니메이션**까지 모두 갖춘 완성된 프레임워크입니다. 2026년 현재 웹게임 개발자들이 가장 많이 선택하는 이유가 바로 이것입니다.

이 글에서는 "플레이어 캐릭터 조종 → 적 충돌 → 점수 시스템"으로 이루어진 미니게임을 실제로 코딩하면서, Phaser 3의 핵심 기능들을 체계적으로 습득합니다.

## 1단계: 게임 기본 틀과 플레이어 생성

```javascript
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 300 },
      debug: false
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);
let player;
let cursors;
let score = 0;

function preload() {
  this.load.image('sky', 'assets/sky.png');
  this.load.image('ground', 'assets/platform.png');
  this.load.image('star', 'assets/star.png');
  this.load.image('bomb', 'assets/bomb.png');
}

function create() {
  this.add.image(400, 300, 'sky');
  
  // 플레이어 생성 (물리 활성화)
  player = this.add.sprite(100, 450, 'dude');
  this.physics.add.existing(player);
  player.body.setBounce(0.2);
  player.body.setCollideWorldBounds(true);
  
  // 키보드 입력
  cursors = this.input.keyboard.createCursorKeys();
}

function update() {
  if (cursors.left.isDown) {
    player.body.setVelocityX(-160);
  } else if (cursors.right.isDown) {
    player.body.setVelocityX(160);
  } else {
    player.body.setVelocityX(0);
  }
  
  if (cursors.up.isDown && player.body.touching.down) {
    player.body.setVelocityY(-330);
  }
}
```

이 기본 코드만으로 **중력이 적용된 캐릭터를 좌우로 움직이고 점프시킬 수 있습니다.** Phaser의 `arcade` 물리 엔진이 자동으로 충돌과 중력을 계산해줍니다.

## 2단계: 플랫폼과 충돌 감지 시스템

실제 게임처럼 만들려면 플레이어가 서있을 "바닥"이 필요합니다.

```javascript
function create() {
  // ... 기존 코드 ...
  
  const platforms = this.physics.add.staticGroup();
  platforms.create(400, 568, 'ground');
  platforms.create(600, 400, 'ground');
  platforms.create(50, 250, 'ground');
  platforms.create(750, 220, 'ground');
  
  // 플레이어와 플랫폼의 충돌
  this.physics.add.collider(player, platforms);
}
```

`this.physics.add.collider()`는 Phaser에서 **가장 자주 쓰이는 메서드**입니다. 두 객체가 만날 때 자동으로 "뚫고 지나가지 않도록" 물리 처리합니다.

## 3단계: 수집 아이템과 오버랩 감지

별을 수집하면 점수가 올라가는 시스템입니다. 충돌이 아니라 **오버랩**을 사용합니다:

```javascript
let stars;

function create() {
  // ... 기존 코드 ...
  
  stars = this.physics.add.group();
  for (let i = 0; i < 12; i++) {
    const x = Phaser.Math.Between(50, 750);
    const y = Phaser.Math.Between(0, 300);
    stars.create(x, y, 'star');
  }
  
  // 플레이어가 별을 만나면 collectStar 함수 호출
  this.physics.add.overlap(player, stars, collectStar, null, this);
}

function collectStar(player, star) {
  star.disableBody(true, true); // 별 제거
  score += 10;
  // 게임 오버 조건: 별이 모두 사라지면 게임 승리
}
```

**collider** vs **overlap**의 차이:
- `collider`: 두 물체가 "부딪혀서" 통과할 수 없음
- `overlap`: 단순히 만났는지만 감지 (통과 가능)

## 4단계: 적(Enemy) 생성과 게임 오버

```javascript
let bombs;

function create() {
  // ... 기존 코드 ...
  
  bombs = this.physics.add.group();
  
  // 플레이어와 폭탄의 충돌 → 게임 오버
  this.physics.add.collider(bombs, platforms);
  this.physics.add.overlap(player, bombs, hitBomb, null, this);
}

function update() {
  // ... 기존 코드 ...
  
  // 별을 전부 수집하면 폭탄 생성
  if (stars.children.entries.length === 0) {
    const x = (player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);
    const bomb = bombs.create(x, 16, 'bomb');
    bomb.setBounce(1);
    bomb.setCollideWorldBounds(true);
    bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
  }
}

function hitBomb(player, bomb) {
  this.physics.pause();
  player.setTint(0xff0000);
  gameOver = true;
}
```

## 5단계: 스프라이트 애니메이션 추가

PNG 스프라이트시트를 사용한 자연스러운 움직임:

```javascript
function preload() {
  // ... 기존 코드 ...
  this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
}

function create() {
  // 왼쪽 이동 애니메이션
  this.anims.create({
    key: 'left',
    frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }),
    frameRate: 10,
    repeat: -1
  });
  
  // 오른쪽 이동 애니메이션
  this.anims.create({
    key: 'right',
    frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
    frameRate: 10,
    repeat: -1
  });
  
  // 정지 상태
  this.anims.create({
    key: 'turn',
    frames: [{ key: 'dude', frame: 4 }],
    frameRate: 20
  });
}

function update() {
  if (cursors.left.isDown) {
    player.body.setVelocityX(-160);
    player.play('left', true);
  } else if (cursors.right.isDown) {
    player.body.setVelocityX(160);
    player.play('right', true);
  } else {
    player.body.setVelocityX(0);
    player.play('turn');
  }
}
```

## 성능 최적화: Phaser 3의 숨은 기능들

실제 게임처럼 여러 객체를 동시에 처리할 때는 성능이 중요합니다:

| 기능 | 설명 | 효과 |
|------|------|------|
| **Pool (객체 재사용)** | 같은 객체를 생성/삭제 반복하지 않고 재사용 | 메모리 누수 방지, 60fps 유지 |
| **Static Group** | 움직이지 않는 객체들 (플랫폼 등) | 충돌 계산 효율 30~40% ↑ |
| **Culling** | 화면 밖 객체는 렌더링 안 함 | 객체 100개 이상 시 필수 |
| **WebGL Renderer** | Canvas 대신 GPU 가속 | 모바일에서 2배 이상 빠름 |

더 자세한 성능 최적화 방법은 [웹게임 성능 최적화 완벽 가이드 2026](/blog/phaser-3-web-game-performance-optimization-2026/)을 참고하세요.

## 실전 팁: 게임을 완성하기 위한 체크리스트

```javascript
// 1. 난이도 조절: 폭탄 속도 점진적 증가
let level = 1;
let bombSpeed = 100 + (level * 20);
bomb.setVelocity(
  Phaser.Math.Between(-bombSpeed, bombSpeed),
  20
);

// 2. UI 표시: 점수와 레벨
let scoreText = this.add.text(16, 16, 'Score: 0', {
  fontSize: '32px',
  fill: '#fff'
});
scoreText.setText('Score: ' + score);

// 3. 게임 오버 화면
let gameOverText = this.add.text(400, 300, 'GAME OVER', {
  fontSize: '64px',
  fill: '#ff0000',
  align: 'center'
});
gameOverText.setOrigin(0.5);

// 4. 재시작 기능
this.input.keyboard.on('keydown-SPACE', () => {
  if (gameOver) this.scene.restart();
});
```

## Phaser 3 vs 다른 프레임워크: 왜 선택해야 하나?

2026년 현재 JavaScript 게임 프레임워크 상황을 보면, [2026년 JavaScript 게임 프레임워크 선택 가이드: 성능·학습곡선·커뮤니티 비교](/blog/javascript-game-framework-comparison-2026/)에서 상세히 비교했지만, Phaser 3의 가장 큰 강점은 **"처음부터 완성"**입니다.

<div class="chart-versus" data-title="Phaser 3 vs 경쟁 프레임워크" data-name-a="Phaser 3" data-name-b="PixiJS" data-color-a="#3b82f6" data-color-b="#f59e0b" data-items='[{"label":"학습곡선","a":85,"b":65},{"label":"물리 엔진","a":95,"b":40},{"label":"커뮤니티 자료","a":90,"b":70},{"label":"성능","a":80,"b":95}]'></div>

- **Phaser 3**: 물리, 입력, 충돌 모두 포함 → 초보자 친화적
- **PixiJS**: 렌더링만 담당 → 가볍지만 물리 직접 구현 필요
- **Babylon.js**: 3D에 최적화 → 웹게임에는 오버스펙

## 2026년 게임 에셋: 무료로 시작하기

Phaser 3 프로젝트를 시작하려면 스프라이트, 사운드, 타일맵이 필요합니다. [무료 게임 에셋 총정리 2026: 0원으로 시작하는 그래픽·사운드·폰트](/blog/2026-07-15-game-free-game-assets-tools-2026/)에서 제시된 사이트들을 활용하면, 전문적인 게임을 제작 비용 없이 시작할 수 있습니다.

특히 권장하는 에셋 소스:
- **OpenGameArt.org**: CC 라이선스 스프라이트 9,000개+
- **Freesound.org**: 게임 효음 700만 개
- **Kenney.nl**: 게임 디자이너 필수 사이트 (1,000+ 팩)

## 참고 자료

- [Phaser 3 공식 문서 - Physics](https://photonstorm.github.io/phaser3-docs/Phaser.Physics.Arcade.html)
- [Phaser 3 예제 모음 - GitHub](https://github.com/photonstorm/phaser3-examples)
- [MDN Web Docs - Collision Detection](https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection)
- [Phaser 공식 튜토리얼 - Making your first game](https://phaser.io/tutorials/making-your-first-game)

---

## 자주 묻는 질문

### Phaser 3에서 충돌 감지와 오버랩의 정확한 차이는?

collider는 두 물체가 부딪히면 이동을 멈추고(물리 반응), overlap은 만났는지만 감지하고 통과합니다. 플레이어가 플랫폼에 서야 하면 collider, 수집 아이템이라면 overlap을 사용합니다.

### 60fps를 유지하려면 어떻게 해야 하나?

Static Group으로 움직이지 않는 객체를 분류하고, 화면 밖 객체는 culling으로 처리하세요. 객체가 100개 이상이면 Canvas 대신 WebGL 렌더러를 사용해야 합니다.

### 모바일에서도 Phaser 3 게임이 잘 작동하나?

네, Phaser 3는 터치 입력과 반응형 레이아웃을 기본 지원합니다. 단, 모바일 성능은 기기마다 크게 달라지므로 테스트를 충분히 해야 하고, 객체 수를 50개 이하로 제한하는 것이 안전합니다.


