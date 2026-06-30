// HUD: 탄약(하단)·체력바(좌하단)·점수/명중률(우상단)·CLEAR(중앙).
export function createHUD() {
  const ammoEl = document.getElementById('ammo');
  const healthFillEl = document.getElementById('health-fill');
  const scoreEl = document.getElementById('score');
  const clearEl = document.getElementById('clear');

  function update(player, weapon, stats, cleared) {
    // 탄약 (재장전 중 안내)
    ammoEl.textContent = weapon.isReloading
      ? '재장전 중...'
      : `${weapon.ammo} / ${weapon.reserve}`;

    // 체력바
    const hpRatio = Math.max(player.health / player.maxHealth, 0);
    healthFillEl.style.width = `${hpRatio * 100}%`;

    // 점수 / 명중률
    const acc = stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0;
    scoreEl.textContent = `점수 ${stats.score} / ${stats.total}\n명중률 ${acc}% (${stats.hits}/${stats.shots})`;

    // 전멸 시 CLEAR
    clearEl.classList.toggle('hidden', !cleared);
  }

  return { update };
}
