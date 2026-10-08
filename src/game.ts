import {
  DOWN,
  PIECE_TYPES,
  UP,
  pieceShape,
  wallKicks,
  type CatPart,
  type PieceCell,
  type PieceType,
} from './pieces';

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const LOCK_DELAY = 500;
export const MAX_LOCK_RESETS = 15;
export const CLEAR_DELAY = 420;
export const SOFT_DROP_INTERVAL = 32;

export interface BoardCell {
  type: PieceType;
  /** Id of the cat this cell belongs to — cells of one cat share it. */
  pid: number;
  conn: number;
  part: CatPart;
}

export interface ActivePiece {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
  pid: number;
}

export type GameEvent =
  | { type: 'spawn'; piece: PieceType }
  | { type: 'move'; dx: number }
  | { type: 'rotate'; dir: number }
  | { type: 'softDrop' }
  | { type: 'hardDrop'; distance: number; cells: { x: number; y: number }[]; piece: PieceType }
  | { type: 'lock'; pid: number; cells: { x: number; y: number }[]; piece: PieceType }
  | { type: 'clearStart'; rows: number[] }
  | {
      type: 'clear';
      rows: number[];
      count: number;
      points: number;
      combo: number;
      backToBack: boolean;
      perfect: boolean;
    }
  | { type: 'levelUp'; level: number }
  | { type: 'hold'; piece: PieceType }
  | { type: 'gameOver' };

export type GameState = 'ready' | 'playing' | 'paused' | 'over';

export type Rng = () => number;

const LINE_POINTS = [0, 100, 300, 500, 800];
const PERFECT_POINTS = [0, 800, 1200, 1800, 2000];

export function gravityInterval(level: number): number {
  const l = Math.min(level, 20) - 1;
  return Math.max(Math.pow(0.8 - l * 0.007, l) * 1000, 16);
}

export class Game {
  board: (BoardCell | null)[][] = [];
  active: ActivePiece | null = null;
  queue: PieceType[] = [];
  holdPiece: PieceType | null = null;
  canHold = true;

  score = 0;
  lines = 0;
  level = 1;
  startLevel = 1;
  combo = -1;
  backToBack = false;

  state: GameState = 'ready';
  /** Rows (board indices) currently playing the clear animation. */
  clearingRows: number[] = [];
  clearTimer = 0;
  /** Per-row distance (in cells) the row just fell after a clear; animated by the renderer. */
  rowDrop: number[] = new Array(ROWS).fill(0);
  rowDropAge = Infinity;

  softDropping = false;
  lastMoveDir = 0;

  private nextPid = 1;
  private gravityTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private bag: PieceType[] = [];
  private events: GameEvent[] = [];
  private rng: Rng;

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset(startLevel = 1): void {
    this.board = Array.from({ length: ROWS }, () => new Array<BoardCell | null>(COLS).fill(null));
    this.active = null;
    this.queue = [];
    this.bag = [];
    this.holdPiece = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.startLevel = startLevel;
    this.level = startLevel;
    this.combo = -1;
    this.backToBack = false;
    this.clearingRows = [];
    this.clearTimer = 0;
    this.rowDrop.fill(0);
    this.rowDropAge = Infinity;
    this.softDropping = false;
    this.events = [];
    this.state = 'ready';
    this.fillQueue();
  }

  start(startLevel = 1): void {
    this.reset(startLevel);
    this.state = 'playing';
    this.spawn();
  }

  togglePause(): void {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
  }

  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  get nextPiece(): PieceType {
    return this.queue[0];
  }

  // ---------------------------------------------------------------- pieces

  private fillQueue(): void {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) {
        this.bag = [...PIECE_TYPES];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop()!);
    }
  }

  private makePiece(type: PieceType): ActivePiece {
    const box = type === 'I' || type === 'O' ? 4 : 3;
    return {
      type,
      rot: 0,
      x: Math.floor((COLS - box) / 2),
      y: 1,
      pid: this.nextPid++,
    };
  }

  private spawn(type?: PieceType): void {
    const t = type ?? this.queue.shift()!;
    this.fillQueue();
    const piece = this.makePiece(t);
    this.active = piece;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = piece.y;
    if (this.collides(piece)) {
      this.gameOver();
      return;
    }
    this.events.push({ type: 'spawn', piece: t });
  }

  cellsOf(p: ActivePiece): (PieceCell & { bx: number; by: number })[] {
    return pieceShape(p.type, p.rot).map((c) => ({ ...c, bx: p.x + c.x, by: p.y + c.y }));
  }

  collides(p: ActivePiece): boolean {
    for (const c of pieceShape(p.type, p.rot)) {
      const x = p.x + c.x;
      const y = p.y + c.y;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && this.board[y][x]) return true;
    }
    return false;
  }

  private onGround(): boolean {
    return !!this.active && this.collides({ ...this.active, y: this.active.y + 1 });
  }

  private afterSuccessfulShift(): void {
    if (!this.active) return;
    if (this.active.y > this.lowestY) {
      this.lowestY = this.active.y;
      this.lockResets = 0;
    }
    if (this.onGround() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private canAct(): boolean {
    return this.state === 'playing' && !!this.active && this.clearingRows.length === 0;
  }

  move(dx: number): boolean {
    if (!this.canAct()) return false;
    const moved = { ...this.active!, x: this.active!.x + dx };
    if (this.collides(moved)) return false;
    this.active = moved;
    this.lastMoveDir = dx;
    this.afterSuccessfulShift();
    this.events.push({ type: 'move', dx });
    return true;
  }

  rotate(dir: 1 | -1): boolean {
    if (!this.canAct()) return false;
    const p = this.active!;
    const to = (p.rot + dir + 4) % 4;
    for (const [kx, ky] of wallKicks(p.type, p.rot, to)) {
      const cand = { ...p, rot: to, x: p.x + kx, y: p.y + ky };
      if (!this.collides(cand)) {
        this.active = cand;
        this.afterSuccessfulShift();
        this.events.push({ type: 'rotate', dir });
        return true;
      }
    }
    return false;
  }

  /** One row of soft drop. Returns false if the piece is resting. */
  softDropStep(): boolean {
    if (!this.canAct()) return false;
    const down = { ...this.active!, y: this.active!.y + 1 };
    if (this.collides(down)) return false;
    this.active = down;
    this.score += 1;
    this.gravityTimer = 0;
    this.afterSuccessfulShift();
    this.events.push({ type: 'softDrop' });
    return true;
  }

  ghostY(): number {
    if (!this.active) return 0;
    let y = this.active.y;
    while (!this.collides({ ...this.active, y: y + 1 })) y++;
    return y;
  }

  hardDrop(): void {
    if (!this.canAct()) return;
    const p = this.active!;
    const gy = this.ghostY();
    const distance = gy - p.y;
    const startCells = this.cellsOf(p).map((c) => ({ x: c.bx, y: c.by }));
    this.active = { ...p, y: gy };
    this.score += distance * 2;
    this.events.push({ type: 'hardDrop', distance, cells: startCells, piece: p.type });
    this.lock();
  }

  hold(): boolean {
    if (!this.canAct() || !this.canHold) return false;
    const current = this.active!.type;
    const swap = this.holdPiece;
    this.holdPiece = current;
    this.canHold = false;
    this.events.push({ type: 'hold', piece: current });
    this.spawn(swap ?? undefined);
    return true;
  }

  /** Drops a cat straight down at column x without scoring (used for the title-screen nap pile). */
  placeStatic(type: PieceType, rot: number, x: number): boolean {
    const p: ActivePiece = { ...this.makePiece(type), rot, x, y: 0 };
    if (this.collides(p)) return false;
    while (!this.collides({ ...p, y: p.y + 1 })) p.y++;
    for (const c of this.cellsOf(p)) {
      if (c.by >= 0) this.board[c.by][c.bx] = { type: p.type, pid: p.pid, conn: c.conn, part: c.part };
    }
    return true;
  }

  // ---------------------------------------------------------------- locking

  private lock(): void {
    const p = this.active;
    if (!p) return;
    const cells = this.cellsOf(p);
    let allHidden = true;
    for (const c of cells) {
      if (c.by >= 0) this.board[c.by][c.bx] = { type: p.type, pid: p.pid, conn: c.conn, part: c.part };
      if (c.by >= HIDDEN_ROWS) allHidden = false;
    }
    this.active = null;
    this.canHold = true;
    this.events.push({ type: 'lock', pid: p.pid, cells: cells.map((c) => ({ x: c.bx, y: c.by })), piece: p.type });

    if (allHidden) {
      this.gameOver();
      return;
    }

    const full: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every((c) => c !== null)) full.push(y);
    }
    if (full.length > 0) {
      this.clearingRows = full;
      this.clearTimer = 0;
      this.events.push({ type: 'clearStart', rows: full });
    } else {
      this.combo = -1;
      this.spawn();
    }
  }

  private finishClear(): void {
    const rows = this.clearingRows;
    const count = rows.length;
    const cleared = new Set(rows);

    // Cats cut in half by a cleared row lose that connection.
    for (const y of rows) {
      if (y - 1 >= 0) for (const c of this.board[y - 1]) if (c) c.conn &= ~DOWN;
      if (y + 1 < ROWS) for (const c of this.board[y + 1]) if (c) c.conn &= ~UP;
    }

    const kept: (BoardCell | null)[][] = [];
    const drops: number[] = [];
    for (let y = ROWS - 1, removedBelow = 0; y >= 0; y--) {
      if (cleared.has(y)) {
        removedBelow++;
        continue;
      }
      kept.unshift(this.board[y]);
      drops.unshift(removedBelow);
    }
    while (kept.length < ROWS) {
      kept.unshift(new Array<BoardCell | null>(COLS).fill(null));
      drops.unshift(count);
    }
    this.board = kept;
    this.rowDrop = drops;
    this.rowDropAge = 0;

    this.combo++;
    const difficult = count === 4;
    const b2b = difficult && this.backToBack;
    let points = LINE_POINTS[count] * this.level;
    if (b2b) points = Math.floor(points * 1.5);
    if (this.combo > 0) points += 50 * this.combo * this.level;
    const perfect = this.board.every((row) => row.every((c) => c === null));
    if (perfect) points += PERFECT_POINTS[count] * this.level;
    this.backToBack = difficult;

    this.score += points;
    this.lines += count;
    this.clearingRows = [];
    this.events.push({ type: 'clear', rows, count, points, combo: this.combo, backToBack: b2b, perfect });

    const newLevel = Math.max(this.startLevel, Math.floor(this.lines / 10) + 1);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.events.push({ type: 'levelUp', level: newLevel });
    }
    this.spawn();
  }

  private gameOver(): void {
    this.state = 'over';
    this.events.push({ type: 'gameOver' });
  }

  // ---------------------------------------------------------------- tick

  update(dt: number): void {
    this.rowDropAge += dt;
    if (this.state !== 'playing') return;

    if (this.clearingRows.length > 0) {
      this.clearTimer += dt;
      if (this.clearTimer >= CLEAR_DELAY) this.finishClear();
      return;
    }
    if (!this.active) return;

    const interval = this.softDropping ? Math.min(SOFT_DROP_INTERVAL, gravityInterval(this.level)) : gravityInterval(this.level);
    this.gravityTimer += dt;
    while (this.gravityTimer >= interval && this.active) {
      this.gravityTimer -= interval;
      if (this.onGround()) {
        this.gravityTimer = 0;
        break;
      }
      if (this.softDropping) this.softDropStep();
      else {
        this.active = { ...this.active, y: this.active.y + 1 };
        this.afterSuccessfulShift();
      }
    }

    if (this.active && this.onGround()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  /** 0..1 — how close the active piece is to locking (for squash animation). */
  get lockProgress(): number {
    return this.active && this.onGround() ? Math.min(this.lockTimer / LOCK_DELAY, 1) : 0;
  }

  /** Highest occupied visible row, as fraction of the board (0 = empty, 1 = topped out). */
  get stackHeight(): number {
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].some((c) => c)) return (ROWS - y) / VISIBLE_ROWS;
    }
    return 0;
  }
}
