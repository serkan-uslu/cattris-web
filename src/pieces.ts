// Tetromino definitions where every piece is a little cat.
// Each cat is a tiny graph: 4 cells, the edges that join them into one
// continuous body, a head cell and a tail cell.

export type PieceType = 'I' | 'O' | 'T' | 'L' | 'J' | 'S' | 'Z';

export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];

export interface CatLook {
  name: string;
  body: string;
  light: string;
  dark: string;
  outline: string;
  belly: string;
  /** Tabby stripes on forehead and back. */
  stripes?: string;
}

export interface PieceDef {
  /** Size of the rotation box (SRS). */
  box: number;
  cells: [number, number][];
  edges: [number, number][];
  head: number;
  tail: number;
  look: CatLook;
}

export const LOOKS: Record<PieceType, CatLook> = {
  I: { name: 'Mavi', body: '#6cc4f5', light: '#a9e2ff', dark: '#3f97cf', outline: '#24628c', belly: '#d3f0ff' },
  O: { name: 'Limon', body: '#ffd84f', light: '#fff09a', dark: '#e8ad1f', outline: '#9c6a12', belly: '#fff6c9' },
  T: { name: 'Pembiş', body: '#ff9fcb', light: '#ffd0e6', dark: '#e46da6', outline: '#a23c71', belly: '#ffe3f0' },
  L: { name: 'Fıstık', body: '#86e06c', light: '#c3f7a9', dark: '#55b33e', outline: '#2f7a22', belly: '#e1fbd3' },
  J: {
    name: 'Tarçın', body: '#ff9e47', light: '#ffcf96', dark: '#e0731d', outline: '#93440c', belly: '#ffe6c8',
    stripes: '#d0611a',
  },
  S: { name: 'Lavanta', body: '#ac8ff2', light: '#d6c8ff', dark: '#7f62d1', outline: '#4e3790', belly: '#ece5ff' },
  Z: {
    name: 'Duman', body: '#a9adbd', light: '#d6d9e4', dark: '#80859a', outline: '#4c5063', belly: '#eceef4',
    stripes: '#6f7488',
  },
};

export const PIECES: Record<PieceType, PieceDef> = {
  // Long cat: head on the left, tail on the right.
  I: {
    box: 4,
    cells: [[0, 1], [1, 1], [2, 1], [3, 1]],
    edges: [[0, 1], [1, 2], [2, 3]],
    head: 0,
    tail: 3,
    look: LOOKS.I,
  },
  // Loaf cat curled into a ring: head top-left, tail tucked bottom-left.
  O: {
    box: 4,
    cells: [[1, 0], [2, 0], [2, 1], [1, 1]],
    edges: [[0, 1], [1, 2], [2, 3]],
    head: 0,
    tail: 3,
    look: LOOKS.O,
  },
  // Sitting cat: head on top, haunches to the left, tail to the right.
  T: {
    box: 3,
    cells: [[1, 0], [1, 1], [0, 1], [2, 1]],
    edges: [[0, 1], [1, 2], [1, 3]],
    head: 0,
    tail: 3,
    look: LOOKS.T,
  },
  L: {
    box: 3,
    cells: [[2, 0], [2, 1], [1, 1], [0, 1]],
    edges: [[0, 1], [1, 2], [2, 3]],
    head: 0,
    tail: 3,
    look: LOOKS.L,
  },
  J: {
    box: 3,
    cells: [[0, 0], [0, 1], [1, 1], [2, 1]],
    edges: [[0, 1], [1, 2], [2, 3]],
    head: 0,
    tail: 3,
    look: LOOKS.J,
  },
  S: {
    box: 3,
    cells: [[2, 0], [1, 0], [1, 1], [0, 1]],
    edges: [[0, 1], [1, 2], [2, 3]],
    head: 0,
    tail: 3,
    look: LOOKS.S,
  },
  Z: {
    box: 3,
    cells: [[0, 0], [1, 0], [1, 1], [2, 1]],
    edges: [[0, 1], [1, 2], [2, 3]],
    head: 0,
    tail: 3,
    look: LOOKS.Z,
  },
};

// Connection bits: which neighbours of a cell belong to the same cat.
export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;

export type CatPart = 'head' | 'body' | 'tail';

export interface PieceCell {
  x: number;
  y: number;
  conn: number;
  part: CatPart;
}

/** Rotate a cell clockwise `rot` times inside an N×N box (SRS convention). */
function rotateCell([x, y]: [number, number], n: number, rot: number): [number, number] {
  let cx = x;
  let cy = y;
  for (let i = 0; i < rot; i++) {
    const nx = n - 1 - cy;
    const ny = cx;
    cx = nx;
    cy = ny;
  }
  return [cx, cy];
}

function dirBit(dx: number, dy: number): number {
  if (dx === 1) return RIGHT;
  if (dx === -1) return LEFT;
  if (dy === 1) return DOWN;
  return UP;
}

const shapeCache = new Map<string, PieceCell[]>();

/** Cells of a piece in a given rotation, relative to its box origin. */
export function pieceShape(type: PieceType, rot: number): PieceCell[] {
  const r = ((rot % 4) + 4) % 4;
  const key = type + r;
  const cached = shapeCache.get(key);
  if (cached) return cached;

  const def = PIECES[type];
  const coords = def.cells.map((c) => (type === 'O' ? c : rotateCell(c, def.box, r)));
  const cells: PieceCell[] = coords.map(([x, y], i) => ({
    x,
    y,
    conn: 0,
    part: i === def.head ? 'head' : i === def.tail ? 'tail' : 'body',
  }));
  for (const [a, b] of def.edges) {
    const dx = cells[b].x - cells[a].x;
    const dy = cells[b].y - cells[a].y;
    cells[a].conn |= dirBit(dx, dy);
    cells[b].conn |= dirBit(-dx, -dy);
  }
  shapeCache.set(key, cells);
  return cells;
}

// SRS wall kicks. Offsets use y-up in the guideline tables, so y is negated.
type Kick = [number, number][];
const JLSTZ_KICKS: Record<string, Kick> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS: Record<string, Kick> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export function wallKicks(type: PieceType, from: number, to: number): [number, number][] {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}>${to}`].map(([x, y]) => [x, -y] as [number, number]);
}
