import * as THREE from 'three';

// 외부 에셋 없이 캔버스로 PBR 텍스처(albedo/normal/roughness)를 절차 생성한다.
// 프랙탈 노이즈(다중 스케일 블러)를 공유해 세 맵이 서로 들어맞게 만든다.

const SIZE = 256; // 텍스처 해상도(타일링용)

function whiteField() {
  const a = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < a.length; i++) a[i] = Math.random();
  return a;
}

// 경계를 wrap 처리하는 분리형 박스 블러(타일링 seamless 유지)
function boxBlurWrap(src, radius) {
  const norm = 1 / (radius * 2 + 1);
  const tmp = new Float32Array(SIZE * SIZE);
  const out = new Float32Array(SIZE * SIZE);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let sum = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        sum += src[y * SIZE + ((x + dx + SIZE) % SIZE)];
      }
      tmp[y * SIZE + x] = sum * norm;
    }
  }
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        sum += tmp[((y + dy + SIZE) % SIZE) * SIZE + x];
      }
      out[y * SIZE + x] = sum * norm;
    }
  }
  return out;
}

// 다중 스케일 노이즈 → [0,1] 높이장
function fractalHeight() {
  const w = whiteField();
  const coarse = boxBlurWrap(w, 10);
  const mid = boxBlurWrap(w, 4);
  const h = new Float32Array(SIZE * SIZE);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < h.length; i++) {
    const v = coarse[i] * 0.6 + mid[i] * 0.3 + w[i] * 0.1;
    h[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - min) / span;
  return h;
}

function makeCanvasTexture(imageData, colorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (colorSpace) tex.colorSpace = colorSpace;
  return tex;
}

function lerpByte(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// 높이장으로부터 albedo/normal/roughness 세 맵을 만든다.
function buildSurface({ dark, light, roughBase, roughVar, normalStrength, grain }) {
  const h = fractalHeight();
  const noise = whiteField(); // 미세 입자

  const albedo = new ImageData(SIZE, SIZE);
  const normal = new ImageData(SIZE, SIZE);
  const rough = new ImageData(SIZE, SIZE);

  for (let i = 0; i < SIZE * SIZE; i++) {
    const t = h[i];
    const g = (noise[i] - 0.5) * grain; // 입자 흔들림
    const p = i * 4;

    // albedo: dark↔light 보간 + 입자
    albedo.data[p] = THREE.MathUtils.clamp(lerpByte(dark[0], light[0], t) + g * 255, 0, 255);
    albedo.data[p + 1] = THREE.MathUtils.clamp(lerpByte(dark[1], light[1], t) + g * 255, 0, 255);
    albedo.data[p + 2] = THREE.MathUtils.clamp(lerpByte(dark[2], light[2], t) + g * 255, 0, 255);
    albedo.data[p + 3] = 255;

    // roughness: 높이에 따라 약간 변동
    const r = THREE.MathUtils.clamp((roughBase + t * roughVar) * 255, 0, 255);
    rough.data[p] = r;
    rough.data[p + 1] = r;
    rough.data[p + 2] = r;
    rough.data[p + 3] = 255;
  }

  // normal: 높이장 중앙차분(경계 wrap)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const l = h[y * SIZE + ((x - 1 + SIZE) % SIZE)];
      const r = h[y * SIZE + ((x + 1) % SIZE)];
      const u = h[((y - 1 + SIZE) % SIZE) * SIZE + x];
      const d = h[((y + 1) % SIZE) * SIZE + x];
      let nx = (l - r) * normalStrength;
      let ny = (u - d) * normalStrength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const p = i * 4;
      normal.data[p] = (nx * 0.5 + 0.5) * 255;
      normal.data[p + 1] = (ny * 0.5 + 0.5) * 255;
      normal.data[p + 2] = (nz * 0.5 + 0.5) * 255;
      normal.data[p + 3] = 255;
    }
  }

  return {
    map: makeCanvasTexture(albedo, THREE.SRGBColorSpace),
    normalMap: makeCanvasTexture(normal), // 선형
    roughnessMap: makeCanvasTexture(rough), // 선형
  };
}

// 모래 바닥용(빛바랜 따뜻한 톤)
export function createSandTextures() {
  return buildSurface({
    dark: [150, 124, 86],
    light: [201, 180, 140],
    roughBase: 0.8,
    roughVar: 0.15,
    normalStrength: 2.0,
    grain: 0.06,
  });
}

// 콘크리트/구조물 디테일용(거친 회사질 표면)
export function createConcreteTextures() {
  return buildSurface({
    dark: [120, 114, 100],
    light: [176, 168, 150],
    roughBase: 0.82,
    roughVar: 0.12,
    normalStrength: 1.4,
    grain: 0.04,
  });
}
