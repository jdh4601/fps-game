import * as THREE from 'three';
import { CONFIG } from './config.js';

// 허용된 플레이어 상태
export const PlayerState = {
  IDLE: 'idle',
  RUNNING: 'running',
  JUMPING: 'jumping',
  AIMING: 'aiming',
  RELOADING: 'reloading',
};

// 상태 전이 규칙 (불가능한 전이는 막는다).
// 핵심 제약: reloading 중에는 aiming으로 직접 못 감(재장전 완료 후에만).
// 발사/재점프 금지는 액션 지점(weapon.fire, player.jump)에서 별도 차단.
const ALLOWED_TRANSITIONS = {
  idle: ['running', 'jumping', 'aiming', 'reloading'],
  running: ['idle', 'jumping', 'aiming', 'reloading'],
  jumping: ['idle', 'running', 'aiming', 'reloading'],
  aiming: ['idle', 'running', 'jumping', 'reloading'],
  reloading: ['idle', 'running', 'jumping'],
};

const pitchLimit = THREE.MathUtils.degToRad(CONFIG.pitchLimitDeg);

// 1인칭 플레이어: 카메라 소유 + 입력 + 이동/중력/지면충돌 + 상태.
export class Player {
  constructor(domElement) {
    this.dom = domElement;

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.fov,
      window.innerWidth / window.innerHeight,
      CONFIG.near,
      CONFIG.far,
    );

    // 위치는 카메라 위치로 직접 표현(눈높이). 시작은 맵 중앙.
    this.camera.position.set(0, CONFIG.eyeHeight, 0);
    this.camera.rotation.order = 'YXZ'; // yaw(Y) 후 pitch(X) 순서로 적용

    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = true;
    this.state = PlayerState.IDLE;

    // 입력 플래그
    this.keys = { w: false, a: false, s: false, d: false, shift: false };
    this.jumpQueued = false;

    this.colliders = []; // 장애물 AABB(Box3) 목록
    this.weapon = null; // state 산출용(aiming/reloading 플래그 참조)

    // 체력 (현재는 피해원이 없어 표시 전용)
    this.maxHealth = CONFIG.maxHealth;
    this.health = this.maxHealth;

    this._bindEvents();
  }

  // 월드가 생성한 장애물 콜라이더 주입
  setColliders(colliders) {
    this.colliders = colliders;
  }

  // 무기 주입(상태 라벨이 aiming/reloading을 반영하도록)
  setWeapon(weapon) {
    this.weapon = weapon;
  }

  // --- 상태 전이는 이 함수 한 곳에서만 처리 ---
  setState(next) {
    if (next === this.state) return;
    if (!ALLOWED_TRANSITIONS[this.state]?.includes(next)) return;
    this.state = next;
  }

  // --- 키보드 입력 ---
  _bindEvents() {
    document.addEventListener('keydown', (e) => this._onKey(e, true));
    document.addEventListener('keyup', (e) => this._onKey(e, false));
  }

  // 마우스/터치 드래그로 시점 회전(Pointer Lock 미사용)
  applyLook(dx, dy) {
    this.yaw -= dx * CONFIG.mouseSensitivity;
    this.pitch -= dy * CONFIG.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -pitchLimit, pitchLimit);
  }

  // 온스크린 버튼/키보드 공용 이동 입력 API
  setForward(p) { this.keys.w = p; }
  setBack(p) { this.keys.s = p; }
  setLeft(p) { this.keys.a = p; }
  setRight(p) { this.keys.d = p; }
  setRun(p) { this.keys.shift = p; }
  jump() { this.jumpQueued = true; }

  _onKey(e, pressed) {
    switch (e.code) {
      case 'KeyW': this.keys.w = pressed; break;
      case 'KeyA': this.keys.a = pressed; break;
      case 'KeyS': this.keys.s = pressed; break;
      case 'KeyD': this.keys.d = pressed; break;
      case 'ShiftLeft':
      case 'ShiftRight': this.keys.shift = pressed; break;
      case 'Space':
        if (pressed) this.jumpQueued = true; // Space = 점프
        break;
      default: break;
    }
  }

  // yaw 기준 평면 이동 방향 계산
  _horizontalMoveDir() {
    const { w, a, s, d } = this.keys;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    // 카메라 정면(XZ): (-sin, -cos), 오른쪽: (cos, -sin)
    const forward = (w ? 1 : 0) - (s ? 1 : 0);
    const strafe = (d ? 1 : 0) - (a ? 1 : 0);

    const dir = new THREE.Vector3(
      -sin * forward + cos * strafe,
      0,
      -cos * forward - sin * strafe,
    );
    if (dir.lengthSq() > 0) dir.normalize();
    return dir;
  }

  // --- 프레임 갱신(delta time 기반) ---
  update(delta) {
    this._applyMovement(delta);
    this._applyGravityAndGround(delta);
    this._updateState();
    this._syncCamera();
  }

  _applyMovement(delta) {
    const dir = this._horizontalMoveDir();
    const speed = CONFIG.moveSpeed * (this.keys.shift ? CONFIG.runMultiplier : 1);

    // 수평 속도는 즉시 반영(관성 없음 — 1단계 단순화)
    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;

    // 축을 분리해 이동→충돌 해소(벽을 따라 미끄러지도록)
    this.camera.position.x += this.velocity.x * delta;
    this._resolveHorizontal('x', this.velocity.x);
    this.camera.position.z += this.velocity.z * delta;
    this._resolveHorizontal('z', this.velocity.z);
  }

  _applyGravityAndGround(delta) {
    // 점프: 지면에 있을 때만 가능(점프 중 재점프 차단)
    if (this.jumpQueued && this.onGround) {
      this.velocity.y = CONFIG.jumpForce;
      this.onGround = false;
    }
    this.jumpQueued = false;

    this.velocity.y -= CONFIG.gravity * delta;
    this.camera.position.y += this.velocity.y * delta;

    // 이번 프레임 지지 여부는 충돌/지면 검사로 다시 판정
    this.onGround = false;
    this._resolveVertical();

    // 지면(바닥 평지) 충돌: 눈높이 아래로 내려가면 착지
    if (this.camera.position.y <= CONFIG.eyeHeight) {
      this.camera.position.y = CONFIG.eyeHeight;
      this.velocity.y = 0;
      this.onGround = true;
    }
  }

  // 현재 위치 기준 플레이어 AABB
  _playerBox() {
    const r = CONFIG.playerRadius;
    const p = this.camera.position;
    return new THREE.Box3(
      new THREE.Vector3(p.x - r, p.y - CONFIG.eyeHeight, p.z - r),
      new THREE.Vector3(p.x + r, p.y + 0.1, p.z + r),
    );
  }

  // 수평(x 또는 z) 침투를 이동 방향 반대로 밀어내 해소
  _resolveHorizontal(axis, vel) {
    if (vel === 0) return;
    for (const c of this.colliders) {
      const box = this._playerBox();
      if (!box.intersectsBox(c)) continue;
      if (vel > 0) this.camera.position[axis] -= box.max[axis] - c.min[axis];
      else this.camera.position[axis] += c.max[axis] - box.min[axis];
    }
  }

  // 수직 충돌: 낙하 중이면 상단 착지, 상승 중이면 머리 충돌
  _resolveVertical() {
    for (const c of this.colliders) {
      const box = this._playerBox();
      if (!box.intersectsBox(c)) continue;
      if (this.velocity.y <= 0) {
        this.camera.position.y += c.max.y - box.min.y; // 윗면 위로 올림
        this.velocity.y = 0;
        this.onGround = true;
      } else {
        this.camera.position.y -= box.max.y - c.min.y; // 아랫면 아래로
        this.velocity.y = 0;
      }
    }
  }

  // 상태 우선순위: reloading > jumping > aiming > running > idle
  _updateState() {
    if (this.weapon?.isReloading) {
      this.setState(PlayerState.RELOADING);
      return;
    }
    if (!this.onGround) {
      this.setState(PlayerState.JUMPING);
      return;
    }
    if (this.weapon?.isAiming) {
      this.setState(PlayerState.AIMING);
      return;
    }
    const isMoving = this.velocity.x !== 0 || this.velocity.z !== 0;
    this.setState(isMoving ? PlayerState.RUNNING : PlayerState.IDLE);
  }

  _syncCamera() {
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  // 디버그용 수평 속력
  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
