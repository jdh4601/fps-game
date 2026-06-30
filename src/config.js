// 게임의 모든 주요 수치는 이 CONFIG 한 곳에서만 관리한다 (단일 출처).
// 코드 본문에 매직 넘버를 두지 말고 항상 여기에 추가할 것.
export const CONFIG = {
  // 카메라
  fov: 75,
  near: 0.1,
  far: 1000,

  // 플레이어 신체/이동
  eyeHeight: 1.7, // 눈높이(m) — 지면에 섰을 때 카메라 y
  playerRadius: 0.35, // 충돌용 플레이어 반경(AABB 절반 폭)
  maxHealth: 100, // 최대 체력
  moveSpeed: 5.0, // 기본 이동 속도(m/s)
  runMultiplier: 1.6, // Shift 달리기 배수
  jumpForce: 7.0, // 점프 초기 상승 속도(m/s)
  gravity: 20.0, // 중력 가속도(m/s^2)

  // 시점 회전
  mouseSensitivity: 0.0022, // 마우스 픽셀당 라디안
  pitchLimitDeg: 85, // 상하 시점 제한(도)

  // 월드
  groundSize: 100, // 평지 한 변 길이(m)

  // 렌더링
  maxPixelRatio: 2, // devicePixelRatio 상한(성능 보호)
  skyColor: 0xcdbb97, // 빛바랜 따뜻한 사막 하늘(안개색과 동일)

  // 그래픽 품질 — 무거운 효과는 여기서 끄거나 낮출 수 있다.
  graphics: {
    toneMappingExposure: 1.0, // ACESFilmic 노출
    sandColor: 0xc2a878, // 모래 바닥 기본색
    shadow: {
      enabled: true,
      mapSize: 2048, // 그림자 해상도(성능 부담 시 1024/512)
      radius: 5, // PCFSoft 그림자 번짐(부드러움)
    },
    fog: {
      color: 0xcdbb97, // 따뜻한 흐린 색
      near: 35, // 안개 시작 거리(m)
      far: 170, // 완전 안개 거리(m)
    },
    postprocessing: true, // 후처리 마스터 토글(끄면 renderer 직접 렌더)
    bloom: {
      enabled: true,
      strength: 0.28, // 약한 블룸
      radius: 0.6,
      threshold: 0.85, // 밝은 부분만(머즐 플래시 등)
    },
    ssao: {
      enabled: true, // 가장 무거움 — 성능 부족 시 false
      kernelRadius: 8,
      minDistance: 0.004,
      maxDistance: 0.08,
    },
    fxaa: { enabled: true }, // 후처리 시 MSAA 대체 AA
  },

  // 무기/발사
  weapon: {
    fireRate: 8, // 초당 발사 수(연사 간격 = 1/fireRate)
    recoil: 0.12, // 반동 시 총이 뒤로 밀리는 거리(m)
    recoilPitch: 0.04, // 반동 시 총구가 들리는 각(rad)
    recoilRecovery: 14, // 반동 복귀 속도(클수록 빨리 제자리)
    damage: 25, // 발당 데미지(적 추가 시 적용)
    range: 200, // 사정거리(m) = Raycaster far
    muzzleFlashTime: 0.05, // 머즐 플래시 지속(초)
    maxMarkers: 20, // 화면에 남기는 탄착 마커 최대 수

    // 탄약/재장전
    magSize: 30, // 탄창 용량
    reserve: 120, // 예비 탄약
    reloadTime: 2.0, // 재장전 소요(초)

    // 조준(ADS)
    adsFov: 50, // 조준 시 FOV(줌인)
    adsLerp: 12, // 조준 전환 속도(클수록 빠름)
    hipSpread: 0.03, // 비조준 산포(NDC 반경)
    adsSpread: 0.005, // 조준 산포(감소)
  },

  // 사격 타겟
  target: {
    radius: 0.6, // 원판 반지름(m)
    effectDuration: 0.35, // 명중 이펙트 지속(초)
  },
};
