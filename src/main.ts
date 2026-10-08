import './style.css';
import { Sound } from './audio';
import { RoomBackground } from './background';
import { COLS, Game, HIDDEN_ROWS, type GameEvent } from './game';
import { Particles } from './particles';
import { LOOKS, type PieceType } from './pieces';
import { BoardRenderer, drawPortrait, drawPreview } from './render';
import { CatSocial, PROFILES, RIVALS } from './social';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const game = new Game();
const sound = new Sound();
const particles = new Particles();
const renderer = new BoardRenderer($<HTMLCanvasElement>('board'));
const room = new RoomBackground($<HTMLCanvasElement>('room'));
const social = new CatSocial({
  hiss: (loud) => sound.hiss(loud),
  growl: () => sound.growl(),
  fight: () => sound.fight(),
  purr: () => sound.purr(0.7),
  chirp: () => sound.chirp(),
  popup: (text, cls, delay) => popup(text, cls, delay),
  shake: () => shake('hard'),
  hearts: (x, y, count) => {
    const S = renderer.cell;
    for (let i = 0; i < count; i++) {
      particles.emit('heart', x * S, (y - HIDDEN_ROWS) * S, {
        color: i % 2 ? '#ff6fae' : '#ff9fcb',
        size: S * (0.14 + Math.random() * 0.08),
        vy: -70 - Math.random() * 50,
        gravity: -20,
        spread: 0.8,
        maxLife: 1 + Math.random() * 0.5,
      });
    }
  },
});

const frame = $('board-frame');
const overlay = $('overlay');
const card = $('card');
const popups = $('popups');
const holdCanvas = $<HTMLCanvasElement>('hold');
const nextCanvas = $<HTMLCanvasElement>('next');
const nextName = $('next-name');
const holdName = $('hold-name');
const scoreEl = $('score');
const levelEl = $('level');
const linesEl = $('lines');

const DAS = 160;
const ARR = 45;

let best = 0;
try {
  best = Number(localStorage.getItem('cattris.best')) || 0;
} catch {
  /* ignore */
}

// ------------------------------------------------------------------ layout

function layout(): void {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const portrait = W / H < 0.9;
  document.body.classList.toggle('portrait', portrait);
  let u: number;
  if (portrait) {
    // logo row + stats row on top, touch pad below, board fills the rest.
    const chrome = 58 + 84 + 74 + 40;
    u = Math.min((Math.min(W, 560) - 20) / 53.2, (H - chrome) / 103.2);
  } else {
    u = Math.min((H * 0.96) / 106, (W * 0.98) / 136);
  }
  document.documentElement.style.setProperty('--u', `${Math.max(u, 2).toFixed(3)}px`);
  requestAnimationFrame(() => {
    renderer.resize();
  });
  room.resize();
}

window.addEventListener('resize', layout);
layout();
document.fonts?.ready.then(() => renderer.resize());

// ------------------------------------------------------------------ overlay

function showCard(html: string): void {
  card.innerHTML = html;
  overlay.classList.add('show');
}

function hideCard(): void {
  overlay.classList.remove('show');
}

const controlsHelp = `
  <ul class="help">
    <li><kbd>←</kbd><kbd>→</kbd> Kaydır</li>
    <li><kbd>↑</kbd> / <kbd>X</kbd> Döndür · <kbd>Z</kbd> Ters</li>
    <li><kbd>↓</kbd> Yavaş in</li>
    <li><kbd>Space</kbd> Hızlı bırak</li>
    <li><kbd>C</kbd> / <kbd>Shift</kbd> Sakla (Hold)</li>
    <li><kbd>P</kbd> Duraklat · <kbd>M</kbd> Müzik</li>
  </ul>`;

const rulesHelp = `
  <ul class="rules">
    <li><b class="r-love">♥ Dostluk:</b> Aynı renk kediler yan yana gelince sevişir — bonus puan!</li>
    <li><b class="r-hiss">😾 Düşmanlık:</b> Düşman kediler birbirine hırlar. İyice sıkışırlarsa <b>KAVGA</b> çıkar — kavga bonusu!</li>
    <li><b class="r-pet">🖐 Sev:</b> Kedilere tıkla, mırlasınlar. Ama komşusu kıskanabilir…</li>
  </ul>`;

function showMenu(): void {
  showCard(`
    <div class="card-cat">😺</div>
    <h2>Kediler uyuyor…</h2>
    <p>Kedileri diz, sıraları tamamla. Ama dikkat: bu kedilerin huyu suyu var!</p>
    <button class="btn" data-cmd="start" type="button">Oyna</button>
    <button class="btn btn-ghost" data-cmd="guide" type="button">Kedileri tanı 🐾</button>
    ${best ? `<p class="best">En iyi skor: <b>${best.toLocaleString('en-US')}</b></p>` : ''}
    ${rulesHelp}
    ${controlsHelp}
    <p class="touch-hint">Telefonda: dokun = döndür · kaydır = hareket · aşağı fırlat = bırak</p>
  `);
}

function showGuide(): void {
  const order: PieceType[] = ['J', 'Z', 'L', 'T', 'S', 'I', 'O'];
  const rows = order
    .map((t) => {
      const p = PROFILES[t];
      const rivals = RIVALS[t].map((r) => `<span style="color:${LOOKS[r].dark}">${PROFILES[r].name}</span>`).join(', ');
      return `<li>
        <canvas class="portrait" data-type="${t}"></canvas>
        <div><b style="color:${LOOKS[t].dark}">${p.name}</b> <span class="trait">${p.trait}</span>
        <span class="enemy">😾 Düşmanı: ${rivals}</span></div>
      </li>`;
    })
    .join('');
  showCard(`
    <h2>Kedi Rehberi</h2>
    <p>Aynı kediden ikisi yan yana gelince <b class="r-love">dost</b> olur. Düşmanlar yan yana gelince <b class="r-hiss">hırlar</b> ya da <b class="r-hiss">kavga</b> eder!</p>
    <ul class="guide">${rows}</ul>
    <button class="btn" data-cmd="start" type="button">Oyna</button>
    <button class="btn btn-ghost" data-cmd="menu" type="button">Geri</button>
  `);
}

function showPause(): void {
  showCard(`
    <div class="card-cat">😴</div>
    <h2>Mola!</h2>
    <p>Kediler kısa bir şekerleme yapıyor.</p>
    <button class="btn" data-cmd="resume" type="button">Devam et</button>
    <button class="btn btn-ghost" data-cmd="restart" type="button">Yeniden başla</button>
  `);
}

function showGameOver(): void {
  const isBest = game.score > 0 && game.score >= best;
  showCard(`
    <div class="card-cat">😿</div>
    <h2>Oyun bitti!</h2>
    <p class="final">${game.score.toLocaleString('en-US')}</p>
    <p>Seviye ${game.level} · ${game.lines} sıra</p>
    <p class="drama">😾 ${social.fights} kavga · ♥ ${social.friendships} dostluk</p>
    ${isBest ? '<p class="best new">✨ Yeni rekor! ✨</p>' : `<p class="best">En iyi skor: <b>${best.toLocaleString('en-US')}</b></p>`}
    <button class="btn" data-cmd="start" type="button">Tekrar oyna</button>
  `);
}

card.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
  if (!btn) return;
  sound.unlock();
  sound.click();
  const cmd = btn.dataset.cmd;
  if (cmd === 'start' || cmd === 'restart') startGame();
  else if (cmd === 'resume') togglePause();
  else if (cmd === 'guide') showGuide();
  else if (cmd === 'menu') showMenu();
});

// ------------------------------------------------------------------ flow

const DEMO: [PieceType, number, number][] = [
  ['I', 0, 0], ['O', 0, 3], ['J', 1, 6], ['T', 2, 7], ['S', 0, 1], ['L', 3, 4], ['Z', 0, 6], ['T', 0, 0],
];

function napPile(): void {
  game.reset();
  renderer.forget();
  social.reset();
  for (const [t, r, x] of DEMO) game.placeStatic(t, r, x);
  game.drainEvents();
}

function startGame(): void {
  sound.unlock();
  hideCard();
  renderer.forget();
  particles.update(10_000);
  social.reset();
  game.start(1);
  displayedScore = 0;
  sound.setTempo(1);
  sound.start();
  if (sound.musicOn) sound.startMusic();
  releaseAll();
}

function togglePause(): void {
  if (game.state !== 'playing' && game.state !== 'paused') return;
  game.togglePause();
  if (game.state === 'paused') {
    showPause();
    sound.stopMusic();
  } else {
    hideCard();
    if (sound.musicOn) sound.startMusic();
  }
  releaseAll();
}

napPile();
showMenu();

// ------------------------------------------------------------------ input

type Action = 'left' | 'right' | 'down' | 'rotate' | 'rotateCcw' | 'drop' | 'hold' | 'pause';

const held = new Set<Action>();
let dirStack: number[] = [];
let dasTimer = 0;
let arrTimer = 0;

function press(a: Action): void {
  sound.unlock();
  if (game.state === 'ready' || game.state === 'over') {
    if (a === 'drop' || a === 'rotate') startGame();
    return;
  }
  if (a === 'pause') return togglePause();
  if (game.state !== 'playing') return;
  if (held.has(a)) return;
  held.add(a);
  switch (a) {
    case 'left':
    case 'right': {
      const d = a === 'left' ? -1 : 1;
      dirStack = dirStack.filter((x) => x !== d);
      dirStack.push(d);
      dasTimer = 0;
      arrTimer = 0;
      game.move(d);
      break;
    }
    case 'down':
      game.softDropping = true;
      game.softDropStep();
      break;
    case 'rotate':
      game.rotate(1);
      break;
    case 'rotateCcw':
      game.rotate(-1);
      break;
    case 'drop':
      game.hardDrop();
      break;
    case 'hold':
      game.hold();
      break;
  }
}

function release(a: Action): void {
  held.delete(a);
  if (a === 'left') dirStack = dirStack.filter((x) => x !== -1);
  if (a === 'right') dirStack = dirStack.filter((x) => x !== 1);
  if (a === 'down') game.softDropping = false;
}

function releaseAll(): void {
  held.clear();
  dirStack = [];
  game.softDropping = false;
}

const KEYS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowUp: 'rotate',
  KeyW: 'rotate',
  KeyX: 'rotate',
  KeyZ: 'rotateCcw',
  ControlLeft: 'rotateCcw',
  Space: 'drop',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyP: 'pause',
  Escape: 'pause',
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    toggleMusic();
    return;
  }
  if (e.code === 'Enter' && (game.state === 'ready' || game.state === 'over')) {
    startGame();
    e.preventDefault();
    return;
  }
  const a = KEYS[e.code];
  if (!a) return;
  e.preventDefault();
  if (e.repeat) return;
  press(a);
});

window.addEventListener('keyup', (e) => {
  const a = KEYS[e.code];
  if (a) release(a);
});

window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') togglePause();
});

// On-screen buttons (with auto-repeat via the same DAS logic as the keyboard).
for (const btn of document.querySelectorAll<HTMLElement>('[data-action]')) {
  const a = btn.dataset.action as Action;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('pressed');
    press(a);
  });
  const up = () => {
    btn.classList.remove('pressed');
    release(a);
  };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

$('hold-panel').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  press('hold');
  release('hold');
});

// Touch gestures on the board itself.
let touch: { id: number; x: number; y: number; t: number; cx: number; cy: number; moved: boolean } | null = null;
frame.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || game.state !== 'playing') return;
  if ((e.target as HTMLElement).closest('.overlay.show')) return;
  sound.unlock();
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), cx: e.clientX, cy: e.clientY, moved: false };
  frame.setPointerCapture(e.pointerId);
});
frame.addEventListener('pointermove', (e) => {
  if (!touch || e.pointerId !== touch.id) return;
  const step = renderer.cell * 0.9;
  while (e.clientX - touch.cx > step) {
    game.move(1);
    touch.cx += step;
    touch.moved = true;
  }
  while (touch.cx - e.clientX > step) {
    game.move(-1);
    touch.cx -= step;
    touch.moved = true;
  }
  while (e.clientY - touch.cy > step) {
    game.softDropStep();
    touch.cy += step;
    touch.moved = true;
  }
});
const endTouch = (e: PointerEvent) => {
  if (!touch || e.pointerId !== touch.id) return;
  const dt = performance.now() - touch.t;
  const dy = e.clientY - touch.y;
  const dx = e.clientX - touch.x;
  if (dy > renderer.cell * 2.5 && dt < 260 && Math.abs(dy) > Math.abs(dx) * 1.5) game.hardDrop();
  else if (dy < -renderer.cell * 2 && Math.abs(dy) > Math.abs(dx)) game.hold();
  else if (!touch.moved && dt < 300) game.rotate(1);
  touch = null;
};
frame.addEventListener('pointerup', endTouch);
frame.addEventListener('pointercancel', () => (touch = null));

// Petting: click (or tap while the game isn't running) on a cat.
function petAt(clientX: number, clientY: number): boolean {
  const rect = renderer.canvas.getBoundingClientRect();
  const { x, y } = renderer.cellAt(clientX - rect.left, clientY - rect.top);
  const cell = game.board[y]?.[x];
  if (!cell) return false;
  sound.unlock();
  social.pet(game, cell.pid, time);
  return true;
}
frame.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && !(e.target as HTMLElement).closest('.overlay.show')) petAt(e.clientX, e.clientY);
});
overlay.addEventListener('pointerdown', (e) => {
  if (e.target === overlay) petAt(e.clientX, e.clientY);
});

// Toggles
const sfxBtn = $('btn-sfx');
const musicBtn = $('btn-music');
function syncToggles(): void {
  sfxBtn.classList.toggle('off', !sound.sfxOn);
  musicBtn.classList.toggle('off', !sound.musicOn);
}
function toggleMusic(): void {
  sound.unlock();
  sound.setMusic(!sound.musicOn);
  if (sound.musicOn && game.state === 'playing') sound.startMusic();
  if (!sound.musicOn) sound.stopMusic();
  syncToggles();
}
sfxBtn.addEventListener('click', () => {
  sound.unlock();
  sound.setSfx(!sound.sfxOn);
  sound.click();
  syncToggles();
});
musicBtn.addEventListener('click', toggleMusic);
$('btn-pause').addEventListener('click', () => {
  sound.unlock();
  if (game.state === 'ready' || game.state === 'over') startGame();
  else togglePause();
});
syncToggles();

// ------------------------------------------------------------------ effects

function popup(text: string, cls = '', delay = 0): void {
  const el = document.createElement('div');
  el.className = `popup ${cls}`;
  el.textContent = text;
  el.style.animationDelay = `${delay}ms`;
  popups.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function bump(id: string): void {
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function shake(strength: 'soft' | 'hard'): void {
  frame.classList.remove('shake-soft', 'shake-hard');
  void frame.offsetWidth;
  frame.classList.add(`shake-${strength}`);
}

const CLEAR_WORDS = ['', 'Miyav!', 'Çifte Miyav!', 'Üçlü Pati!', 'MİYAVHARİKA!'];
const PARTICLE_COLORS = ['#ff8fc0', '#ffd84f', '#8fd8ff', '#b79cff', '#9cf08a', '#ffffff'];
let lastHardDrop = false;
let time = 0;

function handle(ev: GameEvent): void {
  const S = renderer.cell;
  switch (ev.type) {
    case 'move':
      sound.move();
      break;
    case 'rotate':
      sound.rotate();
      if (game.active) {
        for (const c of game.cellsOf(game.active)) {
          if (c.part !== 'head') continue;
          const [x, y] = renderer.cellCenter(c.bx, c.by);
          for (let i = 0; i < 3; i++) particles.emit('sparkle', x, y - S * 0.4, { color: '#fff7c2', size: S * 0.14, gravity: 0, maxLife: 0.4 });
        }
      }
      break;
    case 'softDrop':
      sound.softDrop();
      break;
    case 'hardDrop': {
      sound.hardDrop();
      shake('hard');
      lastHardDrop = true;
      const look = LOOKS[ev.piece];
      for (const c of ev.cells) {
        const [x, y] = renderer.cellCenter(c.x, c.y);
        for (let k = 0; k < 2; k++) {
          particles.emit('sparkle', x + (Math.random() - 0.5) * S * 0.6, y + Math.random() * ev.distance * S, {
            color: look.light,
            size: S * 0.12,
            vy: -30,
            gravity: 20,
            maxLife: 0.5,
          });
        }
      }
      break;
    }
    case 'lock': {
      renderer.landed(ev.pid, time);
      if (lastHardDrop) renderer.meow(ev.pid, time + 0.6);
      else sound.land();
      if (social.onLand(game, ev.pid, ev.piece, time, lastHardDrop) > 0) bump('stat-score');
      lastHardDrop = false;
      const bottoms = new Map<number, number>();
      for (const c of ev.cells) bottoms.set(c.x, Math.max(bottoms.get(c.x) ?? -1, c.y));
      for (const [x, y] of bottoms) {
        const [px, py] = renderer.cellCenter(x, y);
        for (let i = 0; i < 3; i++) {
          particles.emit('dust', px, py + S * 0.45, { color: 'rgba(255,240,225,0.9)', size: S * 0.12, vy: -20, gravity: -10, maxLife: 0.45, spread: 0.8 });
        }
      }
      break;
    }
    case 'clearStart': {
      sound.clear(ev.rows.length, game.combo + 1);
      for (const row of ev.rows) {
        for (let x = 0; x < COLS; x++) {
          const [px, py] = renderer.cellCenter(x, row);
          const kinds = ['heart', 'star', 'sparkle', 'paw'] as const;
          for (let i = 0; i < (ev.rows.length >= 4 ? 3 : 2); i++) {
            particles.emit(kinds[(x + i) % kinds.length], px, py, {
              color: PARTICLE_COLORS[(x * 3 + i + row) % PARTICLE_COLORS.length],
              size: S * (0.18 + Math.random() * 0.14),
              vy: -140 - Math.random() * 120,
              gravity: 260,
              spread: 1.6,
              maxLife: 0.9 + Math.random() * 0.6,
            });
          }
        }
      }
      if (ev.rows.length >= 4) shake('hard');
      break;
    }
    case 'clear': {
      const word = CLEAR_WORDS[ev.count];
      popup(word, ev.count >= 4 ? 'big rainbow' : 'word');
      popup(`+${ev.points.toLocaleString('en-US')}`, 'points', 120);
      if (ev.combo > 0) popup(`Kombo x${ev.combo + 1}`, 'combo', 260);
      if (ev.backToBack) popup('Arka arkaya!', 'combo b2b', 380);
      if (ev.perfect) {
        popup('Pati-Mükemmel!', 'big rainbow', 500);
        renderer.flash(time, 600, '#fff2a8');
      }
      if (ev.count >= 4) renderer.flash(time, 400, '#ffd6ec');
      bump('stat-score');
      bump('stat-lines');
      break;
    }
    case 'levelUp': {
      sound.levelUp();
      sound.setTempo(ev.level);
      popup(`Seviye ${ev.level}!`, 'level', 600);
      bump('stat-level');
      renderer.flash(time, 500, '#c9b6ff');
      for (let i = 0; i < 16; i++) {
        particles.emit('yarn', Math.random() * COLS * S, -S, {
          color: PARTICLE_COLORS[i % 5],
          size: S * 0.22,
          vy: 80 + Math.random() * 100,
          gravity: 300,
          maxLife: 1.8,
        });
      }
      break;
    }
    case 'hold':
      sound.hold();
      bump('hold-panel');
      break;
    case 'gameOver': {
      sound.gameOver();
      social.onGameOver(game, time);
      sound.stopMusic();
      releaseAll();
      if (game.score > best) {
        best = game.score;
        try {
          localStorage.setItem('cattris.best', String(best));
        } catch {
          /* ignore */
        }
      }
      setTimeout(showGameOver, 2100);
      break;
    }
    case 'spawn':
      break;
  }
}

// ------------------------------------------------------------------ loop

let displayedScore = 0;
let last = performance.now();

function updateHud(dt: number): void {
  displayedScore += (game.score - displayedScore) * Math.min(1, dt / 90);
  if (Math.abs(game.score - displayedScore) < 1) displayedScore = game.score;
  scoreEl.textContent = Math.round(displayedScore).toLocaleString('en-US');
  levelEl.textContent = String(game.level).padStart(2, '0');
  linesEl.textContent = String(game.lines);
  frame.classList.toggle('danger', game.state === 'playing' && game.stackHeight > 0.7);
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function tick(dir: number, dt: number): void {
  if (!dir) return;
  dasTimer += dt;
  if (dasTimer < DAS) return;
  arrTimer += dt;
  while (arrTimer >= ARR) {
    arrTimer -= ARR;
    if (!game.move(dir)) break;
  }
}

function loop(now: number): void {
  const dt = Math.min(now - last, 50);
  last = now;
  time = now / 1000;

  if (game.state === 'playing') tick(dirStack[dirStack.length - 1] ?? 0, dt);
  game.update(dt);
  for (const ev of game.drainEvents()) handle(ev);
  particles.update(dt);

  social.update(game, dt, time);

  room.render(time);
  renderer.render(game, particles, time, social);
  const next = game.state === 'ready' ? 'T' : game.nextPiece;
  drawPreview(holdCanvas, game.holdPiece, time, { dim: !game.canHold });
  drawPreview(nextCanvas, next, time);
  setText(nextName, PROFILES[next].name);
  setText(holdName, game.holdPiece ? PROFILES[game.holdPiece].name : '');
  for (const c of card.querySelectorAll<HTMLCanvasElement>('canvas.portrait')) drawPortrait(c, c.dataset.type as PieceType, time);
  updateHud(dt);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) Object.assign(window, { cattris: game, social });
