import * as THREE from 'three';
import { CONFIG } from './config.js';

const T = CONFIG.target;

// ============================================================
// 타겟 배치 데이터 (추가/수정은 여기서만) — 비대칭 산개.
// moving:true 인 타겟은 axis 방향으로 ±range 만큼 speed(m/s)로 왕복.
// ============================================================
export const TARGETS = [
  { pos: [-12, 1.6, -28] },
  { pos: [6, 1.6, -30] },
  { pos: [18, 1.6, -24] },
  { pos: [-24, 1.6, -10] },
  { pos: [30, 1.6, 4] },
  { pos: [-20, 1.6, 20] },
  { pos: [0, 1.6, -34], moving: true, axis: 'x', range: 8, speed: 2.0 },
  { pos: [14, 1.6, 12], moving: true, axis: 'x', range: 6, speed: 1.5 },
  { pos: [-8, 1.6, 28], moving: true, axis: 'x', range: 7, speed: 1.8 },
  { pos: [26, 1.6, -8], moving: true, axis: 'z', range: 6, speed: 1.6 },
];

// 단일 타겟: 빨간 동심원 원판. 모든 자식 메시에 userData.target=this 부착.
class Target {
  constructor(def) {
    this.def = def;
    this.base = new THREE.Vector3(...def.pos);
    this.moving = !!def.moving;
    this.axis = def.axis ?? 'x';
    this.range = def.range ?? 0;
    this.speed = def.speed ?? 0;
    this.dir = 1;
    this.offset = 0;

    this.group = new THREE.Group();
    this.group.position.copy(this.base);
    this.meshes = [];
    this._build();
    this._faceOrigin();
  }

  _build() {
    // 양면 렌더(DoubleSide)로 어느 방향에서도 보이고 Ray가 맞도록
    const rings = [
      { r: T.radius, color: 0xd92b2b },
      { r: T.radius * 0.66, color: 0xf5f5f5 },
      { r: T.radius * 0.3, color: 0xd92b2b },
    ];
    rings.forEach(({ r, color }, i) => {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(r, 28),
        new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }),
      );
      mesh.position.z = i * 0.01; // z-fighting 방지
      mesh.castShadow = true;
      mesh.userData.target = this; // Ray 히트 → 타겟 역참조
      this.group.add(mesh);
      this.meshes.push(mesh);
    });
  }

  // 원판이 플레이 영역(원점)을 향하도록 — 정면 단면이 최대가 됨
  _faceOrigin() {
    this.group.lookAt(0, this.base.y, 0);
  }

  update(delta) {
    if (!this.moving) return;
    this.offset += this.dir * this.speed * delta;
    if (Math.abs(this.offset) >= this.range) {
      this.offset = THREE.MathUtils.clamp(this.offset, -this.range, this.range);
      this.dir *= -1; // 끝에 닿으면 반대로
    }
    this.group.position[this.axis] = this.base[this.axis] + this.offset;
    this._faceOrigin();
  }
}

// 타겟 집합 관리: 생성/명중 처리/이동/이펙트/리스폰.
export class TargetManager {
  constructor(scene) {
    this.scene = scene;
    this.total = TARGETS.length;
    this.targets = [];
    this.hitMeshes = []; // Weapon이 참조(리스폰해도 같은 배열 유지)
    this.effects = [];
    this.spawn();
  }

  spawn() {
    for (const def of TARGETS) {
      const target = new Target(def);
      this.scene.add(target.group);
      this.targets.push(target);
      this.hitMeshes.push(...target.meshes);
    }
  }

  // Ray가 맞춘 타겟 제거 + 명중 이펙트. 점수 가산은 호출측(main)에서.
  kill(target) {
    const idx = this.targets.indexOf(target);
    if (idx === -1) return; // 이미 제거됨(중복 방지)
    this.targets.splice(idx, 1);

    // hitMeshes에서 해당 타겟 메시 제거(같은 배열 in-place)
    for (const mesh of target.meshes) {
      const mi = this.hitMeshes.indexOf(mesh);
      if (mi !== -1) this.hitMeshes.splice(mi, 1);
    }

    this.scene.remove(target.group);
    this._spawnHitEffect(target.group.position);
  }

  _spawnHitEffect(position) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.5, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffd040,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.position.copy(position);
    ring.lookAt(0, position.y, 0);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, life: T.effectDuration });
  }

  update(delta) {
    for (const target of this.targets) target.update(delta);
    this._updateEffects(delta);
  }

  _updateEffects(delta) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.life -= delta;
      const t = Math.max(fx.life / T.effectDuration, 0);
      fx.mesh.material.opacity = t; // 점점 투명
      const s = 1 + (1 - t) * 3; // 점점 확장
      fx.mesh.scale.set(s, s, s);
      if (fx.life <= 0) {
        this.scene.remove(fx.mesh);
        this.effects.splice(i, 1);
      }
    }
  }

  remaining() {
    return this.targets.length;
  }

  // 남은 타겟·이펙트를 모두 비우고 재생성(배열 참조는 유지)
  respawn() {
    for (const target of this.targets) this.scene.remove(target.group);
    for (const fx of this.effects) this.scene.remove(fx.mesh);
    this.targets.length = 0;
    this.hitMeshes.length = 0;
    this.effects.length = 0;
    this.spawn();
  }
}
