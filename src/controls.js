// 입력 UI: 캔버스 드래그-룩 + 하단 온스크린 버튼을 input API에 연결.
// input = { forward, back, left, right, run, aim, fire (bool), jump, reload (무인자) }

// 버튼 정의: [DOM id, action, 'hold' | 'tap']
const BUTTON_MAP = [
  ['btn-fwd', 'forward', 'hold'],
  ['btn-back', 'back', 'hold'],
  ['btn-left', 'left', 'hold'],
  ['btn-right', 'right', 'hold'],
  ['btn-run', 'run', 'hold'],
  ['btn-fire', 'fire', 'hold'],
  ['btn-aim', 'aim', 'hold'],
  ['btn-jump', 'jump', 'tap'],
  ['btn-reload', 'reload', 'tap'],
];

export function createControls(canvas, player, input) {
  setupDragLook(canvas, player);
  for (const [id, action, type] of BUTTON_MAP) {
    const el = document.getElementById(id);
    if (el) bindButton(el, input, action, type);
  }
}

// 캔버스 위에서 포인터를 누른 채 움직이면 시점 회전
function setupDragLook(canvas, player) {
  let dragging = false;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId); // 캔버스 밖으로 나가도 추적
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) player.applyLook(e.movementX, e.movementY);
  });
}

function bindButton(el, input, action, type) {
  if (type === 'tap') {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input[action]();
      flash(el);
    });
    return;
  }

  // hold: 누르는 동안 true, 떼면 false
  const press = (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId); // 버튼 밖에서 떼도 release 보장
    input[action](true);
    el.classList.add('active');
  };
  const release = () => {
    input[action](false);
    el.classList.remove('active');
  };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}

// tap 버튼 누름 피드백(짧게 강조)
function flash(el) {
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 120);
}
