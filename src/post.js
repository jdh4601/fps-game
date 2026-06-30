import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';

// EffectComposer 구성: RenderPass → SSAO → Bloom → FXAA → OutputPass.
// 각 패스는 CONFIG.graphics 토글로 추가되며, 마스터 토글이 꺼지면 null 반환.
export function createPostFX(renderer, scene, camera) {
  const g = CONFIG.graphics;
  if (!g.postprocessing) return null;

  const w = window.innerWidth;
  const h = window.innerHeight;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));

  let ssaoPass = null;
  if (g.ssao.enabled) {
    ssaoPass = new SSAOPass(scene, camera, w, h);
    ssaoPass.kernelRadius = g.ssao.kernelRadius;
    ssaoPass.minDistance = g.ssao.minDistance;
    ssaoPass.maxDistance = g.ssao.maxDistance;
    composer.addPass(ssaoPass);
  }

  let bloomPass = null;
  if (g.bloom.enabled) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      g.bloom.strength,
      g.bloom.radius,
      g.bloom.threshold,
    );
    composer.addPass(bloomPass);
  }

  let fxaaPass = null;
  if (g.fxaa.enabled) {
    fxaaPass = new ShaderPass(FXAAShader);
    composer.addPass(fxaaPass);
  }

  // 톤매핑 + 색공간 변환을 마지막에 적용
  composer.addPass(new OutputPass());

  function setSize(width, height) {
    const pr = renderer.getPixelRatio();
    composer.setSize(width, height);
    ssaoPass?.setSize(width, height);
    bloomPass?.setSize(width, height);
    if (fxaaPass) {
      fxaaPass.material.uniforms.resolution.value.set(1 / (width * pr), 1 / (height * pr));
    }
  }
  setSize(w, h); // FXAA 해상도 초기화

  return { composer, setSize };
}
