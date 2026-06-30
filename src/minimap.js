import { CONFIG } from './config.js';

// 우하단 2D 미니맵: 플레이어 화살표(시야 방향) + 타겟 점. 북쪽 고정.
export function createMinimap() {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const size = canvas.width; // 정사각 가정
  const world = CONFIG.groundSize;

  // 월드 XZ(±world/2) → 캔버스 픽셀
  function toMap(x, z) {
    return [(x / world + 0.5) * size, (z / world + 0.5) * size];
  }

  function update(player, manager) {
    ctx.clearRect(0, 0, size, size);

    // 배경 원
    ctx.fillStyle = 'rgba(10, 14, 18, 0.6)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // 타겟 점
    ctx.fillStyle = '#ff4848';
    for (const target of manager.targets) {
      const p = target.group.position;
      const [mx, my] = toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    drawPlayer(player);
  }

  function drawPlayer(player) {
    const pos = player.camera.position;
    const [px, py] = toMap(pos.x, pos.z);

    // 시야 정면 벡터(월드 XZ) — 화면: +x 오른쪽, +z 아래
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const perpX = -fz; // 좌우 수직 벡터
    const perpZ = fx;

    // 시야 방향 선
    ctx.strokeStyle = 'rgba(64, 208, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + fx * 22, py + fz * 22);
    ctx.stroke();

    // 화살표 삼각형
    const r = 6;
    ctx.fillStyle = '#40d0ff';
    ctx.beginPath();
    ctx.moveTo(px + fx * r, py + fz * r); // 앞쪽 꼭짓점
    ctx.lineTo(px - fx * r * 0.7 + perpX * r * 0.6, py - fz * r * 0.7 + perpZ * r * 0.6);
    ctx.lineTo(px - fx * r * 0.7 - perpX * r * 0.6, py - fz * r * 0.7 - perpZ * r * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  return { update };
}
