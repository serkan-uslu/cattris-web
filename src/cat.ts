// Procedural cat drawing. A cat is a set of grid cells joined into one soft,
// glossy tube with a face on the head cell and a wagging tail on the tail cell.

import { drawShape } from './particles';
import { DOWN, LEFT, RIGHT, UP, type CatLook, type CatPart } from './pieces';

export interface CatCell {
  /** Top-left corner of the cell in pixels. */
  px: number;
  py: number;
  conn: number;
  part: CatPart;
}

export type Mood =
  | 'normal'
  | 'happy'
  | 'squint'
  | 'sleep'
  | 'worried'
  | 'sad'
  | 'meow'
  /** Hissing: ears back, fangs out, fur standing up. */
  | 'angry'
  /** Glaring with a frown, no hiss yet. */
  | 'grumpy'
  | 'love'
  | 'dizzy'
  | 'yawn';

export interface CatStyle {
  look: CatLook;
  /** Cell size in pixels. */
  size: number;
  /** Seconds, drives every idle animation. */
  time: number;
  /** Per-cat seed so cats don't blink in sync. */
  seed: number;
  mood?: Mood;
  /** Where the pupils look, each component in -1..1. */
  lookX?: number;
  lookY?: number;
  /** Faster wagging (excited cat). */
  wagBoost?: number;
  /** 0..1 — fur standing on end. */
  puff?: number;
  /** Fresh out of a fight: band-aid and messy tufts. */
  scruffy?: boolean;
}

const EYE = '#2a1b2b';
const NOSE = '#ff6f9c';
const BLUSH = 'rgba(255, 110, 160, 0.45)';
const INNER_EAR = '#ffb3cf';

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function bodyPath(ctx: CanvasRenderingContext2D, cells: CatCell[], S: number, inset: number, offY = 0): void {
  const s = Math.max(S - inset * 2, 1);
  const r = Math.min(s * 0.42, s / 2);
  ctx.beginPath();
  for (const c of cells) {
    const cx = c.px + S / 2;
    const cy = c.py + S / 2 + offY;
    ctx.roundRect(cx - s / 2, cy - s / 2, s, s, r);
    if (c.conn & RIGHT) ctx.rect(cx, cy - s / 2, S, s);
    if (c.conn & DOWN) ctx.rect(cx - s / 2, cy, s, S);
  }
}

/** Spiky fur sticking out of every free side of the cat (puffed up and angry). */
function drawFur(ctx: CanvasRenderingContext2D, cells: CatCell[], st: CatStyle, puff: number): void {
  const S = st.size;
  const len = S * 0.2 * puff;
  const teeth = 4;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, S * 0.04);
  ctx.strokeStyle = st.look.outline;
  ctx.fillStyle = st.look.dark;
  const sides: [number, number, number][] = [
    [UP, 0, -1],
    [RIGHT, 1, 0],
    [DOWN, 0, 1],
    [LEFT, -1, 0],
  ];
  for (const c of cells) {
    const cx = c.px + S / 2;
    const cy = c.py + S / 2;
    for (const [bit, nx, ny] of sides) {
      if (c.conn & bit) continue;
      if (bit === DOWN) continue; // nobody puffs their belly into the floor
      ctx.beginPath();
      const half = S * 0.38;
      // Along the side: tangent (tx, ty), outward normal (nx, ny).
      const tx = -ny;
      const ty = nx;
      const ex = cx + nx * S * 0.36;
      const ey = cy + ny * S * 0.36;
      ctx.moveTo(ex - tx * half, ey - ty * half);
      for (let i = 0; i < teeth; i++) {
        const a = -half + ((i + 0.5) / teeth) * half * 2;
        const b = -half + ((i + 1) / teeth) * half * 2;
        const wob = 1 + Math.sin(st.time * 30 + i + c.px) * 0.15;
        ctx.lineTo(ex + tx * a + nx * len * wob, ey + ty * a + ny * len * wob);
        ctx.lineTo(ex + tx * b, ey + ty * b);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

export function drawCatBody(ctx: CanvasRenderingContext2D, cells: CatCell[], st: CatStyle): void {
  const S = st.size;
  const { look } = st;
  const ow = Math.max(1.2, S * 0.055);
  const base = S * 0.06;
  if (st.puff && st.puff > 0.02) drawFur(ctx, cells, st, st.puff);

  ctx.fillStyle = look.outline;
  bodyPath(ctx, cells, S, base - ow);
  ctx.fill();

  ctx.fillStyle = look.dark;
  bodyPath(ctx, cells, S, base);
  ctx.fill();

  ctx.fillStyle = look.body;
  bodyPath(ctx, cells, S, base + S * 0.025, -S * 0.04);
  ctx.fill();

  ctx.globalAlpha *= 0.55;
  ctx.fillStyle = look.light;
  bodyPath(ctx, cells, S, S * 0.24, -S * 0.13);
  ctx.fill();
  ctx.globalAlpha /= 0.55;

  // Tabby stripes across the back of body cells.
  if (look.stripes) {
    ctx.strokeStyle = look.stripes;
    ctx.lineCap = 'round';
    ctx.lineWidth = S * 0.065;
    for (const c of cells) {
      if (c.part !== 'body') continue;
      const cx = c.px + S / 2;
      const cy = c.py + S / 2;
      const vertical = (c.conn & (UP | DOWN)) !== 0 && (c.conn & (LEFT | RIGHT)) === 0;
      ctx.beginPath();
      for (const k of [-0.16, 0.14]) {
        if (vertical) {
          ctx.moveTo(cx + S * 0.42, cy + S * k);
          ctx.lineTo(cx + S * 0.24, cy + S * (k + 0.03));
          ctx.moveTo(cx - S * 0.42, cy + S * k);
          ctx.lineTo(cx - S * 0.24, cy + S * (k + 0.03));
        } else {
          ctx.moveTo(cx + S * k, cy - S * 0.42);
          ctx.lineTo(cx + S * (k + 0.03), cy - S * 0.22);
        }
      }
      ctx.stroke();
    }
  }
}

/** Direction (unit vector) the tail sticks out of the tail cell. */
function tailDir(conn: number, seed: number): [number, number] {
  if (conn & LEFT && !(conn & RIGHT)) return [1, 0];
  if (conn & RIGHT && !(conn & LEFT)) return [-1, 0];
  if (conn & UP && !(conn & DOWN)) return [hash(seed) > 0.5 ? 1 : -1, 0];
  if (conn & DOWN && !(conn & UP)) return [hash(seed) > 0.5 ? 1 : -1, 0];
  return [1, 0];
}

export function drawCatTail(ctx: CanvasRenderingContext2D, cells: CatCell[], st: CatStyle): void {
  const tail = cells.find((c) => c.part === 'tail');
  if (!tail) return;
  const S = st.size;
  const { look } = st;
  const [fx, fy] = tailDir(tail.conn, st.seed);
  const cx = tail.px + S / 2;
  const cy = tail.py + S / 2;
  const wagSpeed = 2.2 + (st.wagBoost ?? 0) * 6;
  const wag = Math.sin(st.time * wagSpeed + st.seed * 3.1) * (0.22 + (st.wagBoost ?? 0) * 0.25);

  ctx.save();
  ctx.translate(cx + fx * S * 0.28, cy + fy * S * 0.28 + S * 0.08);
  ctx.rotate(Math.atan2(fy, fx) + (fx < 0 ? -wag : wag));
  const curl = fx < 0 ? 1 : -1; // tail always curls upwards
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(-S * 0.1, 0);
    ctx.bezierCurveTo(S * 0.3, -S * 0.05 * curl, S * 0.56, S * 0.04 * curl, S * 0.5, S * 0.28 * curl);
  };
  trace();
  ctx.strokeStyle = look.outline;
  ctx.lineWidth = S * 0.24;
  ctx.stroke();
  trace();
  ctx.strokeStyle = look.body;
  ctx.lineWidth = S * 0.13;
  ctx.stroke();
  if (look.stripes) {
    trace();
    ctx.strokeStyle = look.stripes;
    ctx.setLineDash([S * 0.06, S * 0.08]);
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Light tip.
  ctx.beginPath();
  ctx.arc(S * 0.5, S * 0.28 * curl, S * 0.065, 0, Math.PI * 2);
  ctx.fillStyle = look.light;
  ctx.fill();
  ctx.restore();
}

function drawEyes(ctx: CanvasRenderingContext2D, S: number, st: CatStyle, mood: Mood): void {
  const ex = S * 0.18;
  const ey = S * 0.02;
  const lw = Math.max(1.2, S * 0.045);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = EYE;
  ctx.fillStyle = EYE;
  ctx.lineWidth = lw;

  // Blink every few seconds, staggered per cat.
  const period = 3.2 + hash(st.seed) * 2.5;
  const phase = (st.time + hash(st.seed + 1) * period) % period;
  const blink = phase < 0.14 ? 1 - Math.abs(phase - 0.07) / 0.07 : 0;

  for (const side of [-1, 1]) {
    const x = side * ex;
    ctx.beginPath();
    switch (mood) {
      case 'happy':
        ctx.arc(x, ey + S * 0.03, S * 0.065, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        break;
      case 'squint':
        ctx.moveTo(x - side * S * 0.06, ey - S * 0.05);
        ctx.lineTo(x + side * S * 0.04, ey);
        ctx.lineTo(x - side * S * 0.06, ey + S * 0.05);
        ctx.stroke();
        break;
      case 'sleep':
      case 'sad':
      case 'yawn':
        ctx.arc(x, ey - S * 0.01, S * 0.06, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        break;
      case 'angry':
      case 'grumpy': {
        const angry = mood === 'angry';
        ctx.ellipse(x + (st.lookX ?? 0) * S * 0.02, ey + S * 0.01, S * 0.066, S * 0.078, 0, 0, Math.PI * 2);
        ctx.fill();
        // Eyelid cut along a slanted brow: inner end low = cross cat.
        const outer = x + side * S * 0.11;
        const inner = x - side * S * 0.1;
        const yo = ey - S * (angry ? 0.075 : 0.06);
        const yi = ey + S * (angry ? 0.005 : -0.03);
        ctx.beginPath();
        ctx.fillStyle = st.look.body;
        ctx.moveTo(outer, yo);
        ctx.lineTo(inner, yi);
        ctx.lineTo(inner, ey - S * 0.16);
        ctx.lineTo(outer, ey - S * 0.16);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(outer + side * S * 0.01, yo - S * 0.015);
        ctx.lineTo(inner - side * S * 0.01, yi - S * 0.015);
        ctx.stroke();
        ctx.fillStyle = EYE;
        break;
      }
      case 'love': {
        ctx.save();
        ctx.translate(x, ey + S * 0.03);
        const pulse = 1 + Math.sin(st.time * 10 + side) * 0.12;
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ff4f8b';
        drawShape(ctx, 'heart', S * 0.105);
        ctx.restore();
        ctx.fillStyle = EYE;
        break;
      }
      case 'dizzy': {
        ctx.save();
        ctx.translate(x, ey);
        ctx.rotate(st.time * 9 * side);
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.35) {
          const r = S * 0.0065 * a;
          if (a === 0) ctx.moveTo(0, 0);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.lineWidth = lw * 0.75;
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'worried': {
        ctx.fillStyle = '#fff';
        ctx.ellipse(x, ey, S * 0.08, S * 0.095, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = EYE;
        ctx.arc(x + (st.lookX ?? 0) * S * 0.02, ey + S * 0.02, S * 0.035, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - S * 0.07, ey - S * 0.14 - side * S * 0.02);
        ctx.lineTo(x + S * 0.07, ey - S * 0.14 + side * S * 0.02);
        ctx.stroke();
        break;
      }
      default: {
        const big = mood === 'meow' ? 1.25 : 1;
        const ry = S * 0.088 * big * (1 - blink * 0.9);
        const lx = (st.lookX ?? 0) * S * 0.022;
        const ly = (st.lookY ?? 0) * S * 0.02;
        ctx.ellipse(x + lx, ey + ly, S * 0.066 * big, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        if (blink < 0.5) {
          ctx.beginPath();
          ctx.fillStyle = '#fff';
          ctx.arc(x + lx - S * 0.022, ey + ly - S * 0.03, S * 0.026 * big, 0, Math.PI * 2);
          ctx.arc(x + lx + S * 0.025, ey + ly + S * 0.035, S * 0.012 * big, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = EYE;
        }
      }
    }
  }

  if (mood === 'sad') {
    ctx.beginPath();
    ctx.fillStyle = '#7fd0ff';
    ctx.ellipse(ex + S * 0.03, ey + S * 0.1, S * 0.025, S * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMouth(ctx: CanvasRenderingContext2D, S: number, look: CatLook, mood: Mood): void {
  const ny = S * 0.11;
  // Nose
  ctx.beginPath();
  ctx.fillStyle = NOSE;
  ctx.moveTo(-S * 0.045, ny - S * 0.02);
  ctx.quadraticCurveTo(0, ny - S * 0.04, S * 0.045, ny - S * 0.02);
  ctx.quadraticCurveTo(S * 0.01, ny + S * 0.04, 0, ny + S * 0.035);
  ctx.quadraticCurveTo(-S * 0.01, ny + S * 0.04, -S * 0.045, ny - S * 0.02);
  ctx.fill();

  ctx.strokeStyle = look.outline;
  ctx.lineWidth = Math.max(1, S * 0.03);
  ctx.lineCap = 'round';
  if (mood === 'angry') {
    // Hiss: wide open mouth with two little fangs.
    ctx.beginPath();
    ctx.fillStyle = '#6a1530';
    ctx.moveTo(-S * 0.1, ny + S * 0.05);
    ctx.quadraticCurveTo(0, ny + S * 0.025, S * 0.1, ny + S * 0.05);
    ctx.quadraticCurveTo(S * 0.07, ny + S * 0.18, 0, ny + S * 0.18);
    ctx.quadraticCurveTo(-S * 0.07, ny + S * 0.18, -S * 0.1, ny + S * 0.05);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * S * 0.075, ny + S * 0.045);
      ctx.lineTo(side * S * 0.035, ny + S * 0.04);
      ctx.lineTo(side * S * 0.058, ny + S * 0.1);
      ctx.fill();
    }
  } else if (mood === 'grumpy') {
    ctx.beginPath();
    ctx.arc(0, ny + S * 0.12, S * 0.055, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (mood === 'yawn') {
    ctx.beginPath();
    ctx.fillStyle = '#7a2340';
    ctx.ellipse(0, ny + S * 0.12, S * 0.07, S * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#ff8fb0';
    ctx.ellipse(0, ny + S * 0.17, S * 0.045, S * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (mood === 'meow' || mood === 'worried') {
    const open = mood === 'meow' ? 1 : 0.6;
    ctx.beginPath();
    ctx.fillStyle = '#7a2340';
    ctx.ellipse(0, ny + S * 0.1, S * 0.06 * open, S * 0.065 * open, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mood === 'meow') {
      ctx.beginPath();
      ctx.fillStyle = '#ff8fb0';
      ctx.ellipse(0, ny + S * 0.135, S * 0.035, S * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mood === 'sleep' || mood === 'sad') {
    ctx.beginPath();
    ctx.arc(0, ny + S * (mood === 'sad' ? 0.11 : 0.06), S * 0.035, mood === 'sad' ? Math.PI * 1.15 : 0.2, mood === 'sad' ? Math.PI * 1.85 : Math.PI - 0.2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-S * 0.04, ny + S * 0.035, S * 0.04, 0.1, Math.PI - 0.3);
    ctx.moveTo(S * 0.08, ny + S * 0.035);
    ctx.arc(S * 0.04, ny + S * 0.035, S * 0.04, 0.3, Math.PI - 0.1);
    ctx.stroke();
  }
}

export function drawCatHead(ctx: CanvasRenderingContext2D, cells: CatCell[], st: CatStyle): void {
  const head = cells.find((c) => c.part === 'head');
  const S = st.size;
  const { look } = st;
  const mood = st.mood ?? 'normal';

  // Front paws: on the body cell right next to the head, if its bottom is free.
  if (head) {
    for (const c of cells) {
      if (c.part === 'head' || c.conn & DOWN) continue;
      const adjacent = Math.abs(c.px - head.px) + Math.abs(c.py - head.py) < S * 1.5;
      if (!adjacent) continue;
      drawPaws(ctx, c.px + S / 2, c.py + S * 0.9, S, look);
      break;
    }
  }
  if (!head) return;

  const hx = head.px + S / 2;
  const hy = head.py + S / 2 + S * 0.02 + Math.sin(st.time * 2 + st.seed) * S * 0.012;
  const ow = Math.max(1.2, S * 0.055);

  const earsBack = mood === 'angry' ? 1 : mood === 'grumpy' || mood === 'worried' ? 0.45 : 0;

  // Occasional ear twitch.
  const twitch = Math.pow(Math.max(0, Math.sin(st.time * 0.9 + st.seed * 7.3)), 40) * 0.35;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.lineJoin = 'round';

  const earPath = (side: number, inner: boolean) => {
    const k = inner ? 0.62 : 1;
    const bx = side * S * 0.24;
    const by = -S * 0.25;
    ctx.save();
    ctx.translate(bx, by + earsBack * S * 0.08);
    ctx.rotate(side * earsBack * 0.75 + (side > 0 ? twitch : 0));
    ctx.beginPath();
    ctx.moveTo(-side * S * 0.18 * k, S * 0.12 * k);
    ctx.lineTo(side * S * 0.02 * k, -S * 0.36 * k);
    ctx.lineTo(side * S * 0.2 * k, S * 0.08 * k);
    ctx.closePath();
    ctx.restore();
  };

  // Outline pass (ears + head)
  ctx.strokeStyle = look.outline;
  ctx.fillStyle = look.outline;
  ctx.lineWidth = ow * 2;
  for (const side of [-1, 1]) {
    earPath(side, false);
    ctx.stroke();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, S * 0.47, S * 0.4, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Fill pass
  ctx.fillStyle = look.body;
  for (const side of [-1, 1]) {
    earPath(side, false);
    ctx.fill();
  }
  ctx.fillStyle = INNER_EAR;
  for (const side of [-1, 1]) {
    earPath(side, true);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.fillStyle = look.dark;
  ctx.ellipse(0, 0, S * 0.47, S * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = look.body;
  ctx.ellipse(0, -S * 0.025, S * 0.45, S * 0.37, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.globalAlpha *= 0.6;
  ctx.fillStyle = look.light;
  ctx.ellipse(-S * 0.04, -S * 0.2, S * 0.26, S * 0.11, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.6;

  // Muzzle
  ctx.beginPath();
  ctx.fillStyle = look.belly;
  ctx.globalAlpha *= 0.75;
  ctx.ellipse(0, S * 0.15, S * 0.17, S * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.75;

  if (look.stripes) {
    ctx.strokeStyle = look.stripes;
    ctx.lineWidth = S * 0.045;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const dx of [-0.09, 0, 0.09]) {
      ctx.moveTo(S * dx, -S * 0.34);
      ctx.lineTo(S * dx * 0.8, -S * (dx === 0 ? 0.2 : 0.24));
    }
    ctx.stroke();
  }

  // Blush
  ctx.fillStyle = BLUSH;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * S * 0.3, S * 0.13, S * 0.075, S * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Whiskers
  ctx.strokeStyle = look.outline;
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = Math.max(0.8, S * 0.018);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * S * 0.36, S * 0.09);
    ctx.lineTo(side * S * 0.58, S * 0.04);
    ctx.moveTo(side * S * 0.36, S * 0.14);
    ctx.lineTo(side * S * 0.58, S * 0.17);
  }
  ctx.stroke();
  ctx.globalAlpha /= 0.55;

  if (st.scruffy) drawScruff(ctx, S, look);

  drawEyes(ctx, S, st, mood);
  drawMouth(ctx, S, look, mood);

  if (mood === 'dizzy') {
    for (let i = 0; i < 3; i++) {
      const a = st.time * 4.5 + i * 2.094;
      ctx.save();
      ctx.translate(Math.cos(a) * S * 0.36, -S * 0.52 + Math.sin(a) * S * 0.1);
      ctx.fillStyle = '#ffe066';
      drawShape(ctx, 'star', S * 0.085);
      ctx.restore();
    }
  }

  if (mood === 'sleep') {
    const t = (st.time * 0.6 + hash(st.seed)) % 1;
    ctx.globalAlpha *= Math.sin(t * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(S * 0.32)}px Fredoka, sans-serif`;
    ctx.fillText('z', S * 0.3 + t * S * 0.2, -S * 0.35 - t * S * 0.4);
  }
  ctx.restore();
}

/** Messy tufts and a band-aid after a fight. */
function drawScruff(ctx: CanvasRenderingContext2D, S: number, look: CatLook): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, S * 0.03);
  ctx.strokeStyle = look.outline;
  ctx.fillStyle = look.body;
  ctx.beginPath();
  ctx.moveTo(-S * 0.14, -S * 0.34);
  ctx.lineTo(-S * 0.1, -S * 0.5);
  ctx.lineTo(-S * 0.04, -S * 0.37);
  ctx.lineTo(S * 0.02, -S * 0.52);
  ctx.lineTo(S * 0.07, -S * 0.36);
  ctx.lineTo(S * 0.13, -S * 0.46);
  ctx.lineTo(S * 0.15, -S * 0.33);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(S * 0.22, -S * 0.2);
  ctx.rotate(-0.65);
  ctx.fillStyle = '#f7cfa3';
  ctx.strokeStyle = '#b07a4f';
  ctx.beginPath();
  ctx.roundRect(-S * 0.14, -S * 0.048, S * 0.28, S * 0.096, S * 0.048);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e3a877';
  ctx.fillRect(-S * 0.04, -S * 0.038, S * 0.08, S * 0.076);
  ctx.restore();

  // Scratch marks on the cheek.
  ctx.strokeStyle = 'rgba(200, 40, 70, 0.7)';
  ctx.lineWidth = Math.max(1, S * 0.02);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(-S * (0.36 - i * 0.04), -S * 0.08);
    ctx.lineTo(-S * (0.3 - i * 0.04), S * 0.0);
  }
  ctx.stroke();
}

function drawPaws(ctx: CanvasRenderingContext2D, x: number, y: number, S: number, look: CatLook): void {
  ctx.lineWidth = Math.max(1, S * 0.04);
  ctx.strokeStyle = look.outline;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.fillStyle = look.belly;
    ctx.ellipse(x + side * S * 0.17, y, S * 0.11, S * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = look.dark;
    ctx.moveTo(x + side * S * 0.17 - S * 0.03, y - S * 0.01);
    ctx.lineTo(x + side * S * 0.17 - S * 0.03, y + S * 0.04);
    ctx.moveTo(x + side * S * 0.17 + S * 0.03, y - S * 0.01);
    ctx.lineTo(x + side * S * 0.17 + S * 0.03, y + S * 0.04);
    ctx.stroke();
    ctx.strokeStyle = look.outline;
  }
}

/** Translucent outline of where the cat will land. */
let ghostCanvas: HTMLCanvasElement | null = null;

export function drawCatGhost(ctx: CanvasRenderingContext2D, cells: CatCell[], st: CatStyle): void {
  const S = st.size;
  const { width, height } = ctx.canvas;
  ghostCanvas ??= document.createElement('canvas');
  if (ghostCanvas.width !== width || ghostCanvas.height !== height) {
    ghostCanvas.width = width;
    ghostCanvas.height = height;
  }
  const g = ghostCanvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, width, height);
  g.setTransform(ctx.getTransform());

  // Soft fill plus a single crisp rim (inner shape punched out of the outer one).
  g.fillStyle = st.look.light;
  bodyPath(g, cells, S, S * 0.08);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.78)';
  bodyPath(g, cells, S, S * 0.08 + Math.max(1.5, S * 0.06));
  g.fill();
  g.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.6;
  ctx.drawImage(ghostCanvas, 0, 0);
  ctx.restore();
}

export function drawCat(ctx: CanvasRenderingContext2D, cells: CatCell[], st: CatStyle): void {
  drawCatTail(ctx, cells, st);
  drawCatBody(ctx, cells, st);
  drawCatHead(ctx, cells, st);
}
