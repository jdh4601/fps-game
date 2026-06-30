import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createSandTextures, createConcreteTextures } from './textures.js';

// ============================================================
// 장애물 데이터 (추가/수정은 여기서만) — 좌우 대칭이 아니라 자연스럽게 산개.
// pos = 바닥에 놓인 기준점(중심 x/z, y는 빌더가 바닥 기준으로 처리).
// 회전은 주지 않는다(축 정렬 AABB 충돌을 유효하게 유지하기 위함).
// ============================================================
// 빛바랜 사막 군사기지 톤(따뜻하고 채도 낮게)
const COLORS = {
  crate: 0xa07b46, // 나무 상자
  concrete: 0xb6a98f, // 콘크리트(모래 먼지)
  pillar: 0x9a9384, // 기둥
  tower: 0x7d6647, // 감시탑 목재
};

// 구조물 표면 디테일용 공유 노멀/러프니스(텍스처 생성 1회)
let detailMaps = null;

export const OBSTACLES = [
  // 나무 상자 (일부는 쌓음)
  { type: 'box', name: 'crate', pos: [-8, 0, -14], size: [1.4, 1.4, 1.4], color: COLORS.crate },
  { type: 'box', name: 'crate', pos: [-6.7, 0, -13.2], size: [1.4, 1.4, 1.4], color: COLORS.crate },
  { type: 'box', name: 'crate', pos: [-7.4, 1.4, -13.6], size: [1.4, 1.4, 1.4], color: COLORS.crate },
  { type: 'box', name: 'crate', pos: [12, 0, -8], size: [1.6, 1.6, 1.6], color: COLORS.crate },
  { type: 'box', name: 'crate', pos: [22, 0, 6], size: [1.3, 1.3, 1.3], color: COLORS.crate },
  { type: 'box', name: 'crate', pos: [-19, 0, 11], size: [1.5, 1.5, 1.5], color: COLORS.crate },

  // 콘크리트 벽 (엄폐물) — 길이/방향(가로·세로)을 섞어 비대칭으로
  { type: 'box', name: 'wall', pos: [4, 0, -22], size: [8, 2.6, 0.6], color: COLORS.concrete },
  { type: 'box', name: 'wall', pos: [-16, 0, -4], size: [0.6, 2.6, 9], color: COLORS.concrete },
  { type: 'box', name: 'wall', pos: [16, 0, 16], size: [6, 2.4, 0.6], color: COLORS.concrete },
  { type: 'box', name: 'wall', pos: [-2, 0, 20], size: [0.6, 2.4, 7], color: COLORS.concrete },

  // 기둥 (시야 차단)
  { type: 'cylinder', name: 'pillar', pos: [0, 0, 0], size: [0.9, 4, 0.9], color: COLORS.pillar },
  { type: 'cylinder', name: 'pillar', pos: [9, 0, 9], size: [0.8, 4, 0.8], color: COLORS.pillar },
  { type: 'cylinder', name: 'pillar', pos: [-11, 0, -20], size: [0.8, 4, 0.8], color: COLORS.pillar },
  { type: 'cylinder', name: 'pillar', pos: [27, 0, -17], size: [1.0, 5, 1.0], color: COLORS.pillar },

  // 감시탑 (다리 사이로 통과 가능, 다리/플랫폼은 충돌)
  { type: 'watchtower', name: 'tower', pos: [-26, 0, -26], footprint: 4.5, legHeight: 5, color: COLORS.tower },
  { type: 'watchtower', name: 'tower', pos: [24, 0, 24], footprint: 4.5, legHeight: 5, color: COLORS.tower },
];

// --- AABB 콜라이더 헬퍼 ---
function boxCollider(cx, cy, cz, w, h, d) {
  return new THREE.Box3(
    new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
    new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2),
  );
}

// 공유 디테일(노멀/러프니스)을 입힌 표면 머티리얼
function surfaceMaterial(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    normalMap: detailMaps?.normalMap ?? null,
    roughnessMap: detailMaps?.roughnessMap ?? null,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
}

// --- 타입별 빌더: { meshes, colliders } 반환 ---
const BUILDERS = {
  box(def) {
    const [x, , z] = def.pos;
    const [w, h, d] = def.size;
    const cy = def.pos[1] + h / 2; // 바닥 위에 놓이도록 중심 y 보정
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      surfaceMaterial(def.color),
    );
    mesh.position.set(x, cy, z);
    return { meshes: [mesh], colliders: [boxCollider(x, cy, z, w, h, d)] };
  },

  cylinder(def) {
    const [x, , z] = def.pos;
    const [diameter, h] = def.size;
    const cy = def.pos[1] + h / 2;
    const r = diameter / 2;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 16),
      surfaceMaterial(def.color),
    );
    mesh.position.set(x, cy, z);
    // 콜라이더는 지름 기준 AABB(원기둥 근사)
    return { meshes: [mesh], colliders: [boxCollider(x, cy, z, diameter, h, diameter)] };
  },

  watchtower(def) {
    const [x, , z] = def.pos;
    const f = def.footprint;
    const H = def.legHeight;
    const mat = surfaceMaterial(def.color);
    const meshes = [];
    const colliders = [];

    // 네 다리
    const legSize = 0.4;
    const half = f / 2 - legSize / 2;
    const legOffsets = [
      [-half, -half], [half, -half], [-half, half], [half, half],
    ];
    for (const [ox, oz] of legOffsets) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legSize, H, legSize), mat);
      leg.position.set(x + ox, H / 2, z + oz);
      meshes.push(leg);
      colliders.push(boxCollider(x + ox, H / 2, z + oz, legSize, H, legSize));
    }

    // 플랫폼(올라설 수 있음)
    const platThick = 0.3;
    const platY = H + platThick / 2;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(f, platThick, f), mat);
    platform.position.set(x, platY, z);
    meshes.push(platform);
    colliders.push(boxCollider(x, platY, z, f, platThick, f));

    // 지붕(피라미드) — 시각용, 충돌 없음
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(f * 0.8, 1.6, 4),
      surfaceMaterial(0x8a4a36),
    );
    roof.position.set(x, H + 1.5, z);
    roof.rotation.y = Math.PI / 4;
    meshes.push(roof);

    return { meshes, colliders };
  },
};

// 외곽 펜스: 맵 경계 4변(플레이어·총알 모두 차단)
function buildFence(scene, meshes, colliders) {
  const edge = CONFIG.groundSize / 2 - 1; // 경계 안쪽 1m
  const len = CONFIG.groundSize - 2;
  const height = 3;
  const thick = 0.3;
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b6457, metalness: 0.3, roughness: 0.8 });

  // [중심x, 중심z, 폭, 깊이]
  const sides = [
    [0, -edge, len, thick],
    [0, edge, len, thick],
    [-edge, 0, thick, len],
    [edge, 0, thick, len],
  ];
  for (const [cx, cz, w, d] of sides) {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
    fence.position.set(cx, height / 2, cz);
    fence.castShadow = true;
    fence.receiveShadow = true;
    scene.add(fence);
    meshes.push(fence);
    colliders.push(boxCollider(cx, height / 2, cz, w, height, d));
  }
}

// 데이터 배열 → 메시·콜라이더 생성 후 씬에 추가
function buildObstacles(scene) {
  const meshes = [];
  const colliders = [];

  for (const def of OBSTACLES) {
    const builder = BUILDERS[def.type];
    if (!builder) {
      console.warn(`[world] 알 수 없는 장애물 타입: ${def.type}`);
      continue;
    }
    const built = builder(def);
    for (const mesh of built.meshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      meshes.push(mesh);
    }
    colliders.push(...built.colliders);
  }

  buildFence(scene, meshes, colliders);
  return { meshes, colliders };
}

// 맵(평지 + 하늘 + 안개 + 조명 + 장애물) 생성. SRP: 월드 구성.
export function createWorld(scene) {
  const gfx = CONFIG.graphics;

  // 디테일 텍스처(구조물 공유) 1회 생성
  detailMaps = createConcreteTextures();

  scene.background = new THREE.Color(CONFIG.skyColor);
  // 원거리 안개로 깊이감(배경색과 동일색이라 지평선이 자연스럽게 녹음)
  scene.fog = new THREE.Fog(gfx.fog.color, gfx.fog.near, gfx.fog.far);

  // 모래 평지 (100m x 100m) — PBR 텍스처(albedo/normal/roughness)
  const sand = createSandTextures();
  const tile = CONFIG.groundSize / 4; // 약 4m마다 1타일 반복
  for (const t of [sand.map, sand.normalMap, sand.roughnessMap]) t.repeat.set(tile, tile);

  const groundMat = new THREE.MeshStandardMaterial({
    map: sand.map,
    normalMap: sand.normalMap,
    roughnessMap: sand.roughnessMap,
    color: gfx.sandColor,
    roughness: 1,
    metalness: 0,
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 약한 환경광 + 하늘/지면 반사를 흉내내는 헤미스피어(따뜻한 채움광)
  const ambient = new THREE.AmbientLight(0xffe9c8, 0.25);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xcdbb97, 0x6b5a3f, 0.5);
  scene.add(hemi);

  // 태양(따뜻한 직사광) + 부드러운 그림자
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
  sun.position.set(40, 55, 25);
  sun.castShadow = gfx.shadow.enabled;
  sun.shadow.mapSize.set(gfx.shadow.mapSize, gfx.shadow.mapSize);
  sun.shadow.radius = gfx.shadow.radius;
  sun.shadow.bias = -0.0004; // 그림자 여드름(acne) 방지
  const half = CONFIG.groundSize / 2;
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  scene.add(sun);

  const obstacles = buildObstacles(scene);

  return {
    ground,
    sun,
    colliders: obstacles.colliders, // 플레이어 AABB 충돌용
    obstacleMeshes: obstacles.meshes, // 총알 Raycaster 대상
  };
}
