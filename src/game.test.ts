import { describe, expect, it } from 'vitest';
import { COLS, Game, ROWS } from './game';
import { DOWN, LEFT, RIGHT, UP, pieceShape, PIECE_TYPES } from './pieces';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('pieces', () => {
  it('every cat is one connected body with exactly one head and one tail in every rotation', () => {
    for (const t of PIECE_TYPES) {
      for (let r = 0; r < 4; r++) {
        const cells = pieceShape(t, r);
        expect(cells).toHaveLength(4);
        expect(cells.filter((c) => c.part === 'head')).toHaveLength(1);
        expect(cells.filter((c) => c.part === 'tail')).toHaveLength(1);
        // Connection bits are symmetric and only point at neighbouring cells of the same cat.
        for (const c of cells) {
          const dirs: [number, number, number, number][] = [
            [UP, 0, -1, DOWN],
            [RIGHT, 1, 0, LEFT],
            [DOWN, 0, 1, UP],
            [LEFT, -1, 0, RIGHT],
          ];
          for (const [bit, dx, dy, back] of dirs) {
            if (!(c.conn & bit)) continue;
            const n = cells.find((o) => o.x === c.x + dx && o.y === c.y + dy);
            expect(n, `${t}${r}`).toBeDefined();
            expect(n!.conn & back).toBeTruthy();
          }
        }
        const edges = cells.reduce((n, c) => n + bitCount(c.conn), 0) / 2;
        expect(edges).toBe(3);
      }
    }
  });
});

function bitCount(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

describe('game', () => {
  it('uses a 7-bag randomizer', () => {
    const g = new Game(seeded(42));
    g.start();
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) {
      seen.push(g.active!.type);
      g.hardDrop();
      if (g.state !== 'playing') break;
      g.board = g.board.map((row) => row.map(() => null));
    }
    expect(new Set(seen.slice(0, 7)).size).toBe(7);
    expect(new Set(seen.slice(7, 14)).size).toBe(7);
  });

  it('hard drop locks the piece at the bottom and scores 2 per cell', () => {
    const g = new Game(seeded(3));
    g.start();
    const type = g.active!.type;
    g.hardDrop();
    const filled = g.board.flat().filter(Boolean);
    expect(filled).toHaveLength(4);
    expect(filled.every((c) => c!.type === type)).toBe(true);
    expect(g.board[ROWS - 1].some(Boolean)).toBe(true);
    expect(g.score).toBeGreaterThan(0);
  });

  it('clears full rows, cuts cats in half and drops the rows above', () => {
    const g = new Game(seeded(5));
    g.start();
    // Bottom row full except column 0; a vertical body crossing rows 20/21 at column 5.
    for (let x = 1; x < COLS; x++) g.board[ROWS - 1][x] = { type: 'Z', pid: 900 + x, conn: 0, part: 'body' };
    g.board[ROWS - 1][5] = { type: 'L', pid: 77, conn: UP, part: 'body' };
    g.board[ROWS - 2][5] = { type: 'L', pid: 77, conn: DOWN, part: 'head' };
    // Drop a vertical I into column 0.
    g.active = { type: 'I', rot: 1, x: -2, y: 0, pid: 500 };
    expect(g.collides(g.active)).toBe(false);
    g.hardDrop();
    expect(g.clearingRows).toEqual([ROWS - 1]);
    g.update(1000);
    // The head that sat above the cleared row fell into it and lost its connection downwards.
    const head = g.board[ROWS - 1][5]!;
    expect(head.pid).toBe(77);
    expect(head.conn & DOWN).toBe(0);
    expect(g.lines).toBe(1);
    expect(g.score).toBeGreaterThanOrEqual(100);
  });

  it('awards a tetris and levels up every 10 lines', () => {
    const g = new Game(seeded(9));
    g.start();
    g.lines = 8;
    for (let y = ROWS - 4; y < ROWS; y++) {
      for (let x = 1; x < COLS; x++) g.board[y][x] = { type: 'O', pid: 1000 + y, conn: 0, part: 'body' };
    }
    g.active = { type: 'I', rot: 1, x: -2, y: 0, pid: 501 };
    g.drainEvents();
    g.hardDrop();
    g.update(1000);
    const ev = g.drainEvents();
    const clear = ev.find((e) => e.type === 'clear');
    expect(clear && clear.type === 'clear' && clear.count).toBe(4);
    expect(clear && clear.type === 'clear' && clear.perfect).toBe(true);
    expect(ev.some((e) => e.type === 'levelUp')).toBe(true);
    expect(g.level).toBe(2);
  });

  it('hold swaps once per piece', () => {
    const g = new Game(seeded(11));
    g.start();
    const first = g.active!.type;
    expect(g.hold()).toBe(true);
    expect(g.holdPiece).toBe(first);
    expect(g.hold()).toBe(false);
    g.hardDrop();
    expect(g.hold()).toBe(true);
    expect(g.active!.type).toBe(first);
  });

  it('rotation kicks off the wall instead of failing', () => {
    const g = new Game(seeded(2));
    g.start();
    g.active = { type: 'T', rot: 1, x: -1, y: 5, pid: 600 };
    expect(g.collides(g.active)).toBe(false);
    expect(g.rotate(1)).toBe(true);
    expect(g.collides(g.active)).toBe(false);
  });

  it('ends the game when a new cat cannot spawn', () => {
    const g = new Game(seeded(4));
    g.start();
    for (let y = 2; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x !== 0) g.board[y][x] = { type: 'S', pid: 1, conn: 0, part: 'body' };
    g.active = { type: 'O', rot: 0, x: 6, y: 0, pid: 2 };
    g.hardDrop();
    expect(g.state).toBe('over');
  });
});
