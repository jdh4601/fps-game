import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { TargetManager } from './enemies.js';
import { createHUD } from './ui.js';
import { createMinimap } from './minimap.js';
import { createPostFX } from './post.js';
import { createControls } from './controls.js';

// --- 부트스트랩 ---
const canvas = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = CONFIG.graphics.shadow.enabled;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 사막의 강한 햇빛 톤을 위한 필름 톤매핑 + 노출
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.graphics.toneMappingExposure;

const scene = new THREE.Scene();
const world = createWorld(scene);

const player = new Player(canvas);
player.setColliders(world.colliders); // 장애물 통과 차단

// 사격 타겟
const targets = new TargetManager(scene);

// 점수/명중률 통계 (R키 리스폰 시 초기화)
const stats = { score: 0, shots: 0, hits: 0, total: targets.total };

// 타겟 명중 시: 제거 + 점수/명중 가산
const hooks = {
  onShot: () => { stats.shots += 1; },
  onHitTarget: (target) => {
    targets.kill(target);
    stats.hits += 1;
    stats.score += 1;
  },
};

// 총알(Raycaster)은 지형 + 장애물 + 타겟에 막히게
const weapon = new Weapon(
  player.camera,
  scene,
  [world.ground, ...world.obstacleMeshes],
  targets.hitMeshes,
  hooks,
);
player.setWeapon(weapon); // state 라벨이 aiming/reloading 반영
const ui = createHUD();
const minimap = createMinimap();
scene.add(player.camera); // 카메라(자식=총)를 씬에 추가해야 총이 렌더됨

// 후처리(Bloom/FXAA/SSAO) — CONFIG.graphics.postprocessing=false면 null
const postfx = createPostFX(renderer, scene, player.camera);

// R = 재장전. 단, 전멸 상태에서는 라운드 리스폰.
function handleReload() {
  if (targets.remaining() === 0) {
    targets.respawn();
    stats.score = 0;
    stats.shots = 0;
    stats.hits = 0;
    return;
  }
  weapon.reload();
}
// 키 매핑: Space=점프(player), Enter=발사, R=조준. 재장전/리스폰은 RELOAD 버튼.
document.addEventListener('keydown', (e) => {
  if (e.repeat) return; // 키 자동반복 무시
  if (e.code === 'Enter') weapon.setTrigger(true); // Enter = 발사(누르면 연사)
  else if (e.code === 'KeyR') weapon.setAim(true); // R = 조준
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Enter') weapon.setTrigger(false);
  else if (e.code === 'KeyR') weapon.setAim(false);
});

// 드래그-룩 + 온스크린 버튼을 입력 API에 연결
const input = {
  forward: (p) => player.setForward(p),
  back: (p) => player.setBack(p),
  left: (p) => player.setLeft(p),
  right: (p) => player.setRight(p),
  run: (p) => player.setRun(p),
  fire: (p) => weapon.setTrigger(p),
  aim: (p) => weapon.setAim(p),
  jump: () => player.jump(),
  reload: () => handleReload(),
};
createControls(canvas, player, input);

// 반응형 리사이즈
window.addEventListener('resize', () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  player.onResize();
  postfx?.setSize(window.innerWidth, window.innerHeight);
});

// --- 게임 루프 (delta time 기반, 프레임레이트 독립적) ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1); // 탭 복귀 시 거대한 delta 방지

  player.update(delta);
  weapon.update(delta);
  targets.update(delta);

  const cleared = targets.remaining() === 0;
  ui.update(player, weapon, stats, cleared);
  minimap.update(player, targets);

  // 후처리 사용 시 composer, 아니면 renderer 직접 렌더
  if (postfx) postfx.composer.render();
  else renderer.render(scene, player.camera);
}

animate();
