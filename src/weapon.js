import * as THREE from 'three';
import { CONFIG } from './config.js';

const W = CONFIG.weapon;

// 1인칭 무기: 카메라 고정 총 + 발사(Ray) + 반동/머즐플래시 + 합성음
//          + 탄약/재장전 + 조준(ADS: FOV 줌·총 중앙·산포 감소).
export class Weapon {
  constructor(camera, scene, collidables, targetMeshes = [], hooks = {}) {
    this.camera = camera;
    this.scene = scene;
    this.collidables = collidables; // 정적 Ray 대상(지형/장애물)
    this.targetMeshes = targetMeshes; // 동적 타겟 Ray 대상(매니저가 in-place 갱신)
    this.hooks = hooks; // { onShot, onHitTarget }

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = W.range;
    this._aimNDC = new THREE.Vector2();

    this.cooldown = 0; // 다음 발사까지 남은 시간(초)
    this.triggerHeld = false;
    this.dryFired = false; // 빈 클릭 1회/누름 처리

    // 탄약
    this.ammo = W.magSize;
    this.reserve = W.reserve;
    this.isReloading = false;
    this.reloadTimer = 0;

    // 조준(ADS)
    this.aimHeld = false;
    this.isAiming = false;
    this.aimT = 0; // 0=비조준, 1=조준 (보간)

    // 반동/플래시
    this.recoilZ = 0;
    this.recoilX = 0;
    this.flashTimer = 0;
    this.markers = [];

    this._buildGun();
    this._buildMarkerTemplate();
    this.audio = null;
  }

  // --- 총 메시 + 머즐 플래시 (카메라 자식) ---
  _buildGun() {
    this.gun = new THREE.Group();
    this.gunRest = new THREE.Vector3(0.28, -0.3, -0.7); // 비조준(허리)
    this.gunAds = new THREE.Vector3(0, -0.13, -0.5); // 조준(화면 중앙)
    this.gunBase = this.gunRest.clone(); // ADS 보간 결과(반동 전 기준)
    this.gun.position.copy(this.gunBase);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.6, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.5), bodyMat);
    this.gun.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 12), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.45);
    this.gun.add(barrel);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffdd66, transparent: true, opacity: 0.9, depthWrite: false,
    });
    this.muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
    this.muzzle.position.set(0, 0.03, -0.78);
    this.muzzle.visible = false;
    this.gun.add(this.muzzle);

    this.muzzleLight = new THREE.PointLight(0xffcc55, 0, 6);
    this.muzzleLight.position.copy(this.muzzle.position);
    this.gun.add(this.muzzleLight);

    this.camera.add(this.gun);
  }

  _buildMarkerTemplate() {
    this.markerGeo = new THREE.SphereGeometry(0.08, 8, 8);
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
  }

  // --- 입력 (main에서 호출) ---
  setTrigger(held) {
    this.triggerHeld = held;
    if (!held) this.dryFired = false; // 손 떼면 빈 클릭 재허용
  }

  setAim(held) {
    this.aimHeld = held;
  }

  reload() {
    if (this.isReloading) return; // 재장전 중 재시도 차단
    if (this.ammo >= W.magSize) return; // 탄창 가득
    if (this.reserve <= 0) return; // 예비탄 없음
    this.isReloading = true;
    this.reloadTimer = W.reloadTime;
    this.aimHeld = false; // 재장전 시 조준 해제
  }

  // --- 프레임 갱신 ---
  update(delta) {
    if (this.cooldown > 0) this.cooldown -= delta;

    this._updateReload(delta);
    this._updateAim(delta);

    // 발사 판정 (재장전 중 불가)
    if (this.cooldown <= 0 && this.triggerHeld && !this.isReloading) {
      if (this.ammo > 0) this._fire();
      else this._dryFire();
    }

    this._updateRecoil(delta);
    this._updateMuzzleFlash(delta);
  }

  _updateReload(delta) {
    if (!this.isReloading) return;
    this.reloadTimer -= delta;
    if (this.reloadTimer > 0) return;

    const need = W.magSize - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.isReloading = false;
  }

  // 조준 진행도 보간 → FOV 줌 + 총 중앙 이동
  _updateAim(delta) {
    this.isAiming = this.aimHeld && !this.isReloading;
    const target = this.isAiming ? 1 : 0;
    this.aimT += (target - this.aimT) * Math.min(W.adsLerp * delta, 1);

    this.camera.fov = THREE.MathUtils.lerp(CONFIG.fov, W.adsFov, this.aimT);
    this.camera.updateProjectionMatrix();

    this.gunBase.lerpVectors(this.gunRest, this.gunAds, this.aimT);
  }

  _fire() {
    this.cooldown = 1 / W.fireRate;
    this.ammo -= 1;

    this.hooks.onShot?.();
    this._raycastAndMark();
    this._startRecoil();
    this._startMuzzleFlash();
    this._playShotSound();
  }

  _dryFire() {
    if (this.dryFired) return; // 누름당 1회만
    this.dryFired = true;
    this._playEmptyClick();
  }

  _raycastAndMark() {
    // 산포: 비조준일수록 큼, 조준일수록 작음(aimT로 보간)
    const spread = THREE.MathUtils.lerp(W.hipSpread, W.adsSpread, this.aimT);
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * spread;
    this._aimNDC.set(Math.cos(ang) * rad, Math.sin(ang) * rad);
    this.raycaster.setFromCamera(this._aimNDC, this.camera);

    const hits = this.raycaster.intersectObjects(
      [...this.collidables, ...this.targetMeshes],
      false,
    );
    if (hits.length === 0) return;

    const hit = hits[0];
    const target = hit.object.userData.target;
    if (target) {
      this.hooks.onHitTarget?.(target);
      return;
    }
    this._addMarker(hit.point);
  }

  _addMarker(point) {
    const marker = new THREE.Mesh(this.markerGeo, this.markerMat);
    marker.position.copy(point);
    this.scene.add(marker);
    this.markers.push(marker);
    if (this.markers.length > W.maxMarkers) {
      this.scene.remove(this.markers.shift());
    }
  }

  // --- 반동: ADS 기준 위치(gunBase) 위에 후퇴/들림을 더하고 0으로 복귀 ---
  _startRecoil() {
    this.recoilZ = W.recoil;
    this.recoilX = W.recoilPitch;
  }

  _updateRecoil(delta) {
    const decay = Math.min(W.recoilRecovery * delta, 1);
    this.recoilZ += (0 - this.recoilZ) * decay;
    this.recoilX += (0 - this.recoilX) * decay;

    this.gun.position.set(this.gunBase.x, this.gunBase.y, this.gunBase.z + this.recoilZ);
    this.gun.rotation.x = this.recoilX;
  }

  // --- 머즐 플래시 ---
  _startMuzzleFlash() {
    this.flashTimer = W.muzzleFlashTime;
    this.muzzle.visible = true;
    this.muzzle.rotation.z = Math.random() * Math.PI;
    this.muzzleLight.intensity = 4;
  }

  _updateMuzzleFlash(delta) {
    if (this.flashTimer <= 0) return;
    this.flashTimer -= delta;
    if (this.flashTimer <= 0) {
      this.muzzle.visible = false;
      this.muzzleLight.intensity = 0;
    }
  }

  // --- WebAudio: 발사음 ---
  _playShotSound() {
    const ctx = this._ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, now);
    noise.connect(lp).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.13);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // --- WebAudio: 빈 클릭음(탄약 0) ---
  _playEmptyClick() {
    const ctx = this._ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(700, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  _ensureAudio() {
    if (this.audio) {
      if (this.audio.state === 'suspended') this.audio.resume();
      return this.audio;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.audio = new Ctx();

    const len = Math.floor(this.audio.sampleRate * 0.2);
    const buffer = this.audio.createBuffer(1, len, this.audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    return this.audio;
  }
}
