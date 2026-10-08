import { drawCatBody, drawCatGhost, drawCatHead, drawCatTail, type CatCell, type CatStyle, type Mood } from './cat';
import { CLEAR_DELAY, COLS, HIDDEN_ROWS, ROWS, VISIBLE_ROWS, type Game } from './game';
import { drawShape, type Particles } from './particles';
import { LOOKS, PIECES, pieceShape, type PieceType } from './pieces';
import { isRival, moodAt, type BubbleStyle, type CatSocial, type FightCloud } from './social';

interface CatGroup {
  pid: number;
  type: PieceType;
  cells: CatCell[];
  clearing: boolean;
}

const easeOutBounce = (t: number): number => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

const ROW_FALL_MS = 380;

export class BoardRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  cell = 30;
  private dpr = 1;
  private gridCache: HTMLCanvasElement | null = null;

  /** When each cat landed (seconds), for squash + falling asleep. */
  private landedAt = new Map<number, number>();
  /** Cats that are meowing until the given time. */
  private meowUntil = new Map<number, number>();
  private flashUntil = 0;
  private flashColor = '#fff';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cell = rect.width / COLS;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.gridCache = null;
  }

  landed(pid: number, time: number): void {
    this.landedAt.set(pid, time);
  }

  meow(pid: number, until: number): void {
    this.meowUntil.set(pid, until);
  }

  flash(time: number, ms: number, color = '#fff'): void {
    this.flashUntil = time + ms / 1000;
    this.flashColor = color;
  }

  forget(): void {
    this.landedAt.clear();
    this.meowUntil.clear();
  }

  /** Pixel centre of a board cell (board coordinates, hidden rows included). */
  cellCenter(x: number, y: number): [number, number] {
    return [(x + 0.5) * this.cell, (y - HIDDEN_ROWS + 0.5) * this.cell];
  }

  private drawGrid(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!this.gridCache) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      const S = this.cell * this.dpr;
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#3b2522');
      bg.addColorStop(1, '#2c1a18');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < VISIBLE_ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const m = S * 0.06;
          g.fillStyle = (x + y) % 2 === 0 ? '#4a302b' : '#462d28';
          g.beginPath();
          g.roundRect(x * S + m, y * S + m, S - 2 * m, S - 2 * m, S * 0.14);
          g.fill();
          g.fillStyle = 'rgba(255, 220, 190, 0.05)';
          g.fillRect(x * S + m * 2, y * S + m, S - 4 * m, S * 0.08);
        }
      }
      const vignette = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(20,8,5,0.45)');
      g.fillStyle = vignette;
      g.fillRect(0, 0, w, h);
      this.gridCache = c;
    }
    this.ctx.drawImage(this.gridCache, 0, 0);
  }

  private groups(game: Game): CatGroup[] {
    const S = this.cell;
    const map = new Map<number, CatGroup>();
    const fallT = Math.min(1, game.rowDropAge / ROW_FALL_MS);
    const clearing = new Set(game.clearingRows);
    for (let y = 0; y < ROWS; y++) {
      const drop = game.rowDrop[y] * (1 - easeOutBounce(fallT));
      for (let x = 0; x < COLS; x++) {
        const c = game.board[y][x];
        if (!c) continue;
        let g = map.get(c.pid);
        if (!g) {
          g = { pid: c.pid, type: c.type, cells: [], clearing: false };
          map.set(c.pid, g);
        }
        if (clearing.has(y)) g.clearing = true;
        g.cells.push({ px: x * S, py: (y - HIDDEN_ROWS - drop) * S, conn: c.conn, part: c.part });
      }
    }
    return [...map.values()];
  }

  /** Board cell under a point in canvas CSS pixels (hidden rows included). */
  cellAt(px: number, py: number): { x: number; y: number } {
    return { x: Math.floor(px / this.cell), y: Math.floor(py / this.cell) + HIDDEN_ROWS };
  }

  render(game: Game, particles: Particles, time: number, social: CatSocial): void {
    const ctx = this.ctx;
    const S = this.cell;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawGrid();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const danger = game.stackHeight > 0.7;
    const over = game.state === 'over';
    const ready = game.state === 'ready';
    const groups = this.groups(game);

    // The falling cat, its landing spot, and who it is about to land next to.
    const active = game.active && game.state === 'playing' ? game.active : null;
    let activeCells: CatCell[] = [];
    let ghostCells: CatCell[] = [];
    let activeStyle: CatStyle | null = null;
    let gy = 0;
    let anticipation = new Map<number, PieceType>();
    let ax = 0;
    let ay = 0;
    if (active) {
      const shape = pieceShape(active.type, active.rot);
      activeCells = shape.map((c) => ({
        px: (active.x + c.x) * S,
        py: (active.y + c.y - HIDDEN_ROWS) * S,
        conn: c.conn,
        part: c.part,
      }));
      gy = game.ghostY();
      ghostCells = activeCells.map((c) => ({ ...c, py: c.py + (gy - active.y) * S }));
      anticipation = social.neighboursOfCells(
        game,
        shape.map((c) => ({ x: active.x + c.x, y: gy + c.y })),
      );
      const head = activeCells.find((c) => c.part === 'head') ?? activeCells[0];
      ax = head.px + S / 2;
      ay = head.py + S / 2;
      const types = [...anticipation.values()];
      const facingRival = types.some((t) => isRival(active.type, t));
      const facingFriend = types.includes(active.type);
      activeStyle = {
        look: LOOKS[active.type],
        size: S,
        time,
        seed: active.pid,
        mood: game.lockProgress > 0.05 ? 'squint' : facingRival ? 'grumpy' : facingFriend ? 'happy' : 'normal',
        lookX: game.lastMoveDir,
        lookY: game.softDropping ? 1 : 0.4,
        puff: facingRival && gy - active.y < 3 ? 0.5 : 0,
      };
    }

    const headOf = (g: CatGroup): CatCell => g.cells.find((c) => c.part === 'head') ?? g.cells.reduce((a, b) => (b.py < a.py ? b : a));

    const styleFor = (g: CatGroup): { st: CatStyle; squash: number; jitter: boolean } => {
      const landed = this.landedAt.get(g.pid) ?? -100;
      const age = time - landed;
      const r = social.reactionOf(g.pid);
      const socialMood = moodAt(r, time);
      const near = anticipation.get(g.pid);
      let mood: Mood = 'normal';
      let puff = r && r.puffUntil > time ? Math.min(1, (time - r.moodStart) * 8 + 0.2) : 0;
      if (over) mood = 'sad';
      else if (g.clearing) mood = 'happy';
      else if (socialMood) mood = socialMood;
      else if ((this.meowUntil.get(g.pid) ?? 0) > time) mood = 'meow';
      else if (near && active && isRival(g.type, active.type)) {
        mood = 'grumpy';
        puff = Math.max(puff, 0.35);
      } else if (near && active && near === active.type) mood = 'happy';
      else if (danger) mood = 'worried';
      else if (ready || age > 22 + (g.pid % 7) * 3) mood = 'sleep';

      // Everybody keeps an eye on the falling cat.
      let lookX = 0;
      let lookY = 0;
      if (active) {
        const h = headOf(g);
        lookX = Math.max(-1, Math.min(1, (ax - h.px - S / 2) / (S * 3)));
        lookY = Math.max(-1, Math.min(1, (ay - h.py - S / 2) / (S * 3)));
      }
      // Landing squash: quick damped bounce.
      const squash = age < 0.45 ? Math.sin(age * 22) * Math.exp(-age * 9) * 0.12 : 0;
      return {
        st: {
          look: LOOKS[g.type],
          size: S,
          time,
          seed: g.pid,
          mood,
          lookX,
          lookY,
          puff,
          scruffy: !!r && r.scruffyUntil > time,
          wagBoost: g.clearing || mood === 'angry' ? 1 : mood === 'love' ? 0.6 : 0,
        },
        squash,
        jitter: !!r && r.jitterUntil > time,
      };
    };

    const withSquash = (g: CatGroup, squash: number, breath: number, jitter: boolean, fn: () => void) => {
      if (squash === 0 && breath === 0 && !jitter) return fn();
      let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of g.cells) {
        minX = Math.min(minX, c.px);
        maxX = Math.max(maxX, c.px + S);
        maxY = Math.max(maxY, c.py + S);
      }
      const ox = (minX + maxX) / 2;
      ctx.save();
      if (jitter) {
        const k = Math.floor(time * 30) + g.pid;
        ctx.translate(Math.sin(k * 12.9) * S * 0.05, Math.cos(k * 7.3) * S * 0.04);
      }
      ctx.translate(ox, maxY);
      ctx.scale(1 + squash * 0.6 + breath * 0.5, 1 - squash + breath);
      ctx.translate(-ox, -maxY);
      fn();
      ctx.restore();
    };

    const styled = groups.map((g) => ({ g, ...styleFor(g) }));
    const breathOf = (g: CatGroup, mood: Mood | undefined) =>
      mood === 'sleep' ? Math.sin(time * 1.6 + g.pid) * 0.025 : Math.sin(time * 2.2 + g.pid) * 0.01;

    // Ghost + light beam for the falling cat.
    if (active && activeStyle && gy > active.y) {
      const look = LOOKS[active.type];
      const cols = new Map<number, number>();
      for (const c of activeCells) cols.set(c.px, Math.max(cols.get(c.px) ?? -Infinity, c.py + S));
      for (const [px, bottom] of cols) {
        const top = bottom - S * 0.3;
        const end = bottom + (gy - active.y) * S;
        const grad = ctx.createLinearGradient(0, top, 0, end);
        grad.addColorStop(0, hexA(look.light, 0.32));
        grad.addColorStop(1, hexA(look.light, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(px + S * 0.18, top, S * 0.64, end - top);
      }
      drawCatGhost(ctx, ghostCells, activeStyle);
    }

    // Tails under everything, then bodies, then faces on top.
    for (const { g, st, squash, jitter } of styled) withSquash(g, squash, breathOf(g, st.mood), jitter, () => drawCatTail(ctx, g.cells, st));
    if (activeStyle) drawCatTail(ctx, activeCells, activeStyle);
    for (const { g, st, squash, jitter } of styled) withSquash(g, squash, breathOf(g, st.mood), jitter, () => drawCatBody(ctx, g.cells, st));

    const lockSquash = game.lockProgress * 0.06;
    const activeGroup: CatGroup = { pid: 0, type: active?.type ?? 'I', cells: activeCells, clearing: false };
    if (activeStyle) withSquash(activeGroup, lockSquash, 0, false, () => drawCatBody(ctx, activeCells, activeStyle!));

    for (const { g, st, squash, jitter } of styled) withSquash(g, squash, breathOf(g, st.mood), jitter, () => drawCatHead(ctx, g.cells, st));
    if (activeStyle) withSquash(activeGroup, lockSquash, 0, false, () => drawCatHead(ctx, activeCells, activeStyle!));

    // Clearing rows glow and sparkle.
    if (game.clearingRows.length) {
      const t = Math.min(1, game.clearTimer / CLEAR_DELAY);
      for (const y of game.clearingRows) {
        const py = (y - HIDDEN_ROWS) * S;
        const pulse = 0.35 + 0.65 * Math.sin(t * Math.PI);
        const grad = ctx.createLinearGradient(0, py, 0, py + S);
        grad.addColorStop(0, `rgba(255,255,255,${0.15 * pulse})`);
        grad.addColorStop(0.5, `rgba(255,250,220,${0.85 * pulse})`);
        grad.addColorStop(1, `rgba(255,255,255,${0.15 * pulse})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, py - S * 0.1, COLS * S, S * 1.2);
        // Sweeping shine
        const sx = t * COLS * S * 1.4 - S * 2;
        const shine = ctx.createLinearGradient(sx - S * 2, 0, sx + S * 2, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0)');
        shine.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.fillRect(0, py, COLS * S, S);
      }
    }

    for (const cloud of social.clouds) drawFightCloud(ctx, cloud, S, time);

    particles.draw(ctx);

    // Speech bubbles on top of everything.
    for (const { g } of styled) {
      const b = social.reactionOf(g.pid)?.bubble;
      if (!b || time < b.start || time >= b.until) continue;
      const h = headOf(g);
      drawBubble(ctx, b.text, b.style, h.px + S / 2, h.py, S, COLS * S, time - b.start, b.until - time, time);
    }

    if (this.flashUntil > time) {
      ctx.globalAlpha = Math.min(1, (this.flashUntil - time) * 3) * 0.45;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, COLS * S, VISIBLE_ROWS * S);
      ctx.globalAlpha = 1;
    }

    if (game.state === 'paused' || over) {
      ctx.fillStyle = 'rgba(30, 15, 20, 0.35)';
      ctx.fillRect(0, 0, COLS * S, VISIBLE_ROWS * S);
    }
  }
}

const BUBBLE_STYLES: Record<BubbleStyle, { fill: string; stroke: string; text: string }> = {
  say: { fill: '#fffaf3', stroke: '#5d3519', text: '#4a2a1c' },
  think: { fill: '#f3efff', stroke: '#6b5aa0', text: '#4e3790' },
  love: { fill: '#ffe1ee', stroke: '#c2407f', text: '#c2407f' },
  hiss: { fill: '#fff1d6', stroke: '#c0392b', text: '#c0392b' },
};

function drawBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: BubbleStyle,
  x: number,
  headTop: number,
  S: number,
  boardW: number,
  age: number,
  left: number,
  time: number,
): void {
  const colors = BUBBLE_STYLES[style];
  const fs = Math.max(11, S * 0.4);
  ctx.save();
  ctx.font = `700 ${fs}px Fredoka, sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + fs * 1.1;
  const h = fs * 1.6;
  const tipY = headTop - S * 0.18;
  let by = tipY - h - S * 0.22;
  if (by < 2) by = 2;
  const bx = Math.max(3, Math.min(boardW - w - 3, x - w / 2));
  const pop = age < 0.18 ? 0.4 + 0.6 * backOut(age / 0.18) : 1;
  const alpha = Math.min(1, left / 0.25);
  const shakeX = style === 'hiss' ? Math.sin(time * 70) * S * 0.03 : 0;
  ctx.globalAlpha = alpha;
  ctx.translate(x + shakeX, by + h);
  ctx.scale(pop, pop);
  ctx.translate(-x, -(by + h));

  ctx.lineWidth = Math.max(1.5, S * 0.06);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colors.stroke;
  ctx.fillStyle = colors.fill;
  ctx.beginPath();
  if (style === 'hiss') {
    // Jagged shout bubble.
    const cx = bx + w / 2;
    const cy = by + h / 2;
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = i % 2 === 0 ? 1.18 : 0.98;
      const px = cx + Math.cos(a) * (w / 2 + fs * 0.25) * k;
      const py = cy + Math.sin(a) * (h / 2 + fs * 0.2) * k;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.roundRect(bx, by, w, h, h / 2);
  }
  ctx.fill();
  ctx.stroke();

  // Tail pointing at the cat.
  const tx = Math.max(bx + h * 0.4, Math.min(bx + w - h * 0.4, x));
  if (style === 'think') {
    for (const [k, r] of [[0.35, 0.16], [0.7, 0.1]] as const) {
      ctx.beginPath();
      ctx.arc(tx + (x - tx) * k, by + h + (tipY - by - h) * k, fs * r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(tx - fs * 0.32, by + h - ctx.lineWidth);
    ctx.lineTo(x, tipY);
    ctx.lineTo(tx + fs * 0.32, by + h - ctx.lineWidth);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx - fs * 0.32, by + h);
    ctx.lineTo(x, tipY);
    ctx.lineTo(tx + fs * 0.32, by + h);
    ctx.stroke();
  }

  ctx.fillStyle = colors.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2 + fs * 0.04);
  ctx.restore();
}

function backOut(t: number): number {
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

const SYMBOLS = ['!', '#', '@', '%', '&', '$', '?!'];

/** A classic cartoon brawl: a rumbling dust ball with paws, tails and swear symbols flying out. */
function drawFightCloud(ctx: CanvasRenderingContext2D, c: FightCloud, S: number, time: number): void {
  const t = (time - c.start) / (c.until - c.start);
  if (t < 0 || t > 1) return;
  const grow = t < 0.12 ? backOut(t / 0.12) : t > 0.85 ? (1 - t) / 0.15 : 1;
  const R = S * 1.35 * grow;
  const k = Math.floor(time * 24);
  const boardW = COLS * S;
  const cx = Math.max(R * 1.05, Math.min(boardW - R * 1.05, c.x * S)) + Math.sin(k * 3.7) * S * 0.08;
  const cy = (c.y - HIDDEN_ROWS) * S + Math.cos(k * 5.1) * S * 0.08;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Limbs and tails flailing out of the cloud.
  for (let i = 0; i < 6; i++) {
    const look = LOOKS[c.colors[i % c.colors.length] as PieceType];
    const a = time * (i % 2 ? 7 : -6) + i * 1.05;
    const len = R * (1.15 + 0.15 * Math.sin(time * 25 + i));
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len * 0.85;
    ctx.beginPath();
    if (i % 3 === 2) {
      // tail
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.8) * len * 0.7, cy + Math.sin(a + 0.8) * len * 0.7, ex, ey);
    } else {
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
    }
    ctx.strokeStyle = look.outline;
    ctx.lineWidth = S * 0.26;
    ctx.stroke();
    ctx.strokeStyle = look.body;
    ctx.lineWidth = S * 0.16;
    ctx.stroke();
    if (i % 3 !== 2) {
      ctx.beginPath();
      ctx.fillStyle = look.belly;
      ctx.strokeStyle = look.outline;
      ctx.lineWidth = Math.max(1, S * 0.04);
      ctx.arc(ex, ey, S * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Dust cloud puffs (outline pass, then fill pass so it reads as one shape).
  const puffs: [number, number, number][] = [[0, 0, 0.72]];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.sin(time * 9 + i) * 0.15;
    puffs.push([Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.55, 0.42 + 0.08 * Math.sin(time * 20 + i * 2)]);
  }
  ctx.fillStyle = '#7b675b';
  for (const [px, py, r] of puffs) {
    ctx.beginPath();
    ctx.arc(cx + px, cy + py, R * r + Math.max(1.5, S * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f7efe6';
  for (const [px, py, r] of puffs) {
    ctx.beginPath();
    ctx.arc(cx + px, cy + py, R * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(180, 160, 145, 0.18)';
  for (const [px, py, r] of puffs.slice(1)) {
    ctx.beginPath();
    ctx.arc(cx + px + R * 0.05, cy + py + R * 0.08, R * r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Angry eyes glaring from inside the dust.
  ctx.fillStyle = '#2a1b2b';
  for (let i = 0; i < 2; i++) {
    const ex = cx + Math.sin(time * 6 + i * 3) * R * 0.35;
    const ey = cy + Math.cos(time * 5 + i * 2) * R * 0.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(ex + side * S * 0.06, ey - S * 0.06);
      ctx.lineTo(ex + side * S * 0.2, ey - S * 0.01);
      ctx.lineTo(ex + side * S * 0.07, ey + S * 0.03);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Swear symbols and stars popping out.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(S * 0.5)}px Fredoka, sans-serif`;
  for (let i = 0; i < 5; i++) {
    const phase = (time * 1.8 + i / 5) % 1;
    const a = i * 1.7 + Math.floor(time * 1.8 + i / 5) * 2.3;
    const d = R * (0.6 + phase * 0.9);
    const sx = cx + Math.cos(a) * d;
    const sy = cy + Math.sin(a) * d * 0.8 - phase * S * 0.4;
    ctx.globalAlpha = Math.sin(phase * Math.PI);
    if (i % 2) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(time * 6);
      ctx.fillStyle = '#ffd84f';
      drawShape(ctx, 'star', S * 0.18);
      ctx.restore();
    } else {
      ctx.lineWidth = Math.max(2, S * 0.08);
      ctx.strokeStyle = '#fff';
      const sym = SYMBOLS[(i + Math.floor(time * 4)) % SYMBOLS.length];
      ctx.strokeText(sym, sx, sy);
      ctx.fillStyle = i % 4 === 0 ? '#e0362f' : '#4a2a1c';
      ctx.fillText(sym, sx, sy);
    }
  }
  ctx.restore();
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Draws a single cat centred in a small preview canvas (HOLD / NEXT). */
export function drawPreview(
  canvas: HTMLCanvasElement,
  type: PieceType | null,
  time: number,
  opts: { dim?: boolean; mood?: Mood } = {},
): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!type) return;

  const shape = pieceShape(type, 0);
  const minX = Math.min(...shape.map((c) => c.x));
  const maxX = Math.max(...shape.map((c) => c.x)) + 1;
  const minY = Math.min(...shape.map((c) => c.y));
  const maxY = Math.max(...shape.map((c) => c.y)) + 1;
  const S = Math.min((rect.width * 0.72) / Math.max(maxX - minX, 2.6), (rect.height * 0.62) / Math.max(maxY - minY, 1.6));
  const ox = (rect.width - (maxX - minX) * S) / 2 - minX * S;
  const oy = (rect.height - (maxY - minY) * S) / 2 - minY * S + S * 0.12 + Math.sin(time * 2.4) * S * 0.05;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (opts.dim) {
    ctx.globalAlpha = 0.45;
    ctx.filter = 'grayscale(0.8)';
  }
  const cells: CatCell[] = shape.map((c) => ({ px: ox + c.x * S, py: oy + c.y * S, conn: c.conn, part: c.part }));
  const st: CatStyle = {
    look: PIECES[type].look,
    size: S,
    time,
    seed: type.charCodeAt(0),
    mood: opts.mood ?? (opts.dim ? 'sleep' : 'normal'),
  };
  drawCatTail(ctx, cells, st);
  drawCatBody(ctx, cells, st);
  drawCatHead(ctx, cells, st);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

/** A cat face for the guide card. */
export function drawPortrait(canvas: HTMLCanvasElement, type: PieceType, time: number): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = Math.min(rect.width, rect.height) * 0.72;
  const cells: CatCell[] = [{ px: (rect.width - S) / 2, py: rect.height - S * 0.98, conn: 0, part: 'head' }];
  const grumpy = RIVALS_FACE.has(type);
  drawCatHead(ctx, cells, {
    look: PIECES[type].look,
    size: S,
    time,
    seed: type.charCodeAt(0) * 3,
    mood: grumpy ? 'grumpy' : type === 'O' ? 'sleep' : type === 'T' ? 'love' : 'normal',
    scruffy: type === 'J',
  });
}

const RIVALS_FACE = new Set<PieceType>(['J', 'Z', 'S']);
