import { drawCatBody, drawCatGhost, drawCatHead, drawCatTail, type CatCell, type CatStyle, type Mood } from './cat';
import { CLEAR_DELAY, COLS, HIDDEN_ROWS, ROWS, VISIBLE_ROWS, type Game } from './game';
import { LOOKS, PIECES, pieceShape, type PieceType } from './pieces';
import type { Particles } from './particles';

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

  render(game: Game, particles: Particles, time: number): void {
    const ctx = this.ctx;
    const S = this.cell;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawGrid();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const danger = game.stackHeight > 0.7;
    const over = game.state === 'over';
    const ready = game.state === 'ready';
    const groups = this.groups(game);

    const styleFor = (g: CatGroup): { st: CatStyle; squash: number } => {
      const landed = this.landedAt.get(g.pid) ?? -100;
      const age = time - landed;
      let mood: Mood = 'normal';
      if (over) mood = 'sad';
      else if (g.clearing) mood = 'happy';
      else if ((this.meowUntil.get(g.pid) ?? 0) > time) mood = 'meow';
      else if (danger) mood = 'worried';
      else if (ready || age > 22 + (g.pid % 7) * 3) mood = 'sleep';
      // Landing squash: quick damped bounce.
      const squash = age < 0.45 ? Math.sin(age * 22) * Math.exp(-age * 9) * 0.12 : 0;
      return {
        st: {
          look: LOOKS[g.type],
          size: S,
          time,
          seed: g.pid,
          mood,
          wagBoost: g.clearing ? 1 : 0,
        },
        squash,
      };
    };

    const withSquash = (g: CatGroup, squash: number, breath: number, fn: () => void) => {
      if (squash === 0 && breath === 0) return fn();
      let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of g.cells) {
        minX = Math.min(minX, c.px);
        maxX = Math.max(maxX, c.px + S);
        maxY = Math.max(maxY, c.py + S);
      }
      const ox = (minX + maxX) / 2;
      ctx.save();
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
    const active = game.active && game.state !== 'over' ? game.active : null;
    let activeCells: CatCell[] = [];
    let activeStyle: CatStyle | null = null;
    if (active) {
      const look = LOOKS[active.type];
      const shape = pieceShape(active.type, active.rot);
      activeCells = shape.map((c) => ({
        px: (active.x + c.x) * S,
        py: (active.y + c.y - HIDDEN_ROWS) * S,
        conn: c.conn,
        part: c.part,
      }));
      const gy = game.ghostY();
      const ghostCells = activeCells.map((c) => ({ ...c, py: c.py + (gy - active.y) * S }));
      activeStyle = {
        look,
        size: S,
        time,
        seed: active.pid,
        mood: game.lockProgress > 0.05 ? 'squint' : 'normal',
        lookX: game.lastMoveDir,
        lookY: game.softDropping ? 1 : 0.4,
      };

      if (gy > active.y) {
        // Soft glowing beam between the cat and its landing spot.
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
    }

    // Tails under everything, then bodies, then faces on top.
    for (const { g, st, squash } of styled) withSquash(g, squash, breathOf(g, st.mood), () => drawCatTail(ctx, g.cells, st));
    if (activeStyle) drawCatTail(ctx, activeCells, activeStyle);
    for (const { g, st, squash } of styled) withSquash(g, squash, breathOf(g, st.mood), () => drawCatBody(ctx, g.cells, st));

    const lockSquash = game.lockProgress * 0.06;
    const activeGroup: CatGroup = { pid: 0, type: active?.type ?? 'I', cells: activeCells, clearing: false };
    if (activeStyle) withSquash(activeGroup, lockSquash, 0, () => drawCatBody(ctx, activeCells, activeStyle!));

    for (const { g, st, squash } of styled) withSquash(g, squash, breathOf(g, st.mood), () => drawCatHead(ctx, g.cells, st));
    if (activeStyle) withSquash(activeGroup, lockSquash, 0, () => drawCatHead(ctx, activeCells, activeStyle!));

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

    particles.draw(ctx);

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
