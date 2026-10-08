// Cat social life: rivals hiss and brawl, friends nuzzle, everyone gossips.
// Works in board coordinates; the renderer turns it into faces, bubbles and dust clouds.

import type { Mood } from './cat';
import { COLS, HIDDEN_ROWS, ROWS, type Game } from './game';
import type { PieceType } from './pieces';

export interface CatProfile {
  name: string;
  trait: string;
  catchphrase: string[];
}

export const PROFILES: Record<PieceType, CatProfile> = {
  J: { name: 'Tarçın', trait: 'Mahallenin kabadayısı, herkese diklenir.', catchphrase: ['Ne bakıyon?', 'Burası benim mahallem!', 'Gel bakalım!'] },
  Z: { name: 'Duman', trait: 'Huysuz ve gururlu bir tekir.', catchphrase: ['Hıh.', 'Beni rahat bırakın.', 'Pazartesiden nefret ederim.'] },
  T: { name: 'Pembiş', trait: 'Tatlı ama müthiş kıskanç.', catchphrase: ['Beni sev!', 'En tatlısı benim', 'Sevgi lütfen ♥'] },
  S: { name: 'Lavanta', trait: 'Bir diva. Kimseyi beğenmez.', catchphrase: ['Ben bir divayım.', 'Pati bakımı lazım', 'Iyy, sıradan kediler'] },
  I: { name: 'Mavi', trait: 'Meraklı, upuzun bir kedi.', catchphrase: ['Ne kadar uzunum!', 'Orada ne var?', 'Kuş mu o?'] },
  O: { name: 'Limon', trait: 'Uykucu tombik, uyandırılmaktan nefret eder.', catchphrase: ['Zzz… 5 dk daha', 'Mama saati mi?', 'Hıaaav…'] },
  L: { name: 'Fıstık', trait: 'Oyuncu ve haylaz, kuyruk çekmeyi sever.', catchphrase: ['Oyun oynayalım!', 'Yakala beni!', 'Yün yumağı nerde?'] },
};

/** Who can't stand whom. Tarçın has picked a fight with two cats. */
export const RIVALS: Record<PieceType, PieceType[]> = {
  J: ['Z', 'L'],
  Z: ['J'],
  T: ['S'],
  S: ['T'],
  I: ['O'],
  O: ['I'],
  L: ['J'],
};

export const isRival = (a: PieceType, b: PieceType) => RIVALS[a].includes(b);

export type BubbleStyle = 'say' | 'hiss' | 'love' | 'think';

export interface Bubble {
  text: string;
  style: BubbleStyle;
  start: number;
  until: number;
}

export interface Reaction {
  mood?: Mood;
  moodStart: number;
  moodUntil: number;
  puffUntil: number;
  jitterUntil: number;
  scruffyUntil: number;
  bubble?: Bubble;
  /** A follow-up mood (e.g. dizzy after a fight). */
  next?: { mood: Mood; from: number; until: number };
}

export interface FightCloud {
  /** Centre in board cells (hidden rows included). */
  x: number;
  y: number;
  start: number;
  until: number;
  colors: string[];
}

export interface SocialFx {
  hiss(loud: boolean): void;
  growl(): void;
  fight(): void;
  purr(): void;
  chirp(): void;
  popup(text: string, cls: string, delay?: number): void;
  hearts(x: number, y: number, count: number): void;
  shake(): void;
}

interface Contact {
  pid: number;
  type: PieceType;
  edges: number;
  /** Sum of contact midpoints, divide by edges for the average. */
  sx: number;
  sy: number;
  /** The landing cat sits on top of this one. */
  under: boolean;
}

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const HISS = ['Hıhh!', 'Pısss!', 'Grrr!', 'Çekil!', 'Bakma bana!', 'Benim yerim!', 'Hıssss!', 'Defol!'];
const HISS_BACK = ['Asıl sen çekil!', 'Hıhh!', 'Sensin!', 'Pıss!', 'Grrr…', 'Bana mı dedin?'];
const AFTER_FIGHT = ['Bu daha bitmedi!', 'Kazandım!', 'Pati yedin!', 'Tüylerim!', 'Gördün mü?'];
const LOVE = ['Kankam!', 'Mırrr ♥', '♥ ♥', 'Sarıl bana', 'Dostum!', 'Seni özledim'];
const SAT_ON = ['Ağırsın!', 'Of!', 'Üstümden in!', 'Ezildim!', 'Kilo mu aldın?'];
const IDLE = ['Miyav?', 'Mama nerede?', 'Hıaaav…', 'Sıkıldım', 'Mrrp?', 'Kuş!', 'Prr…'];
const DANGER = ['Yer yok!', 'Sıkıştık!', 'İmdat!', 'Çok kalabalık!', 'Nefes alamıyorum!'];
const PET = ['Mırrr ♥', 'Bir daha!', 'Oh be…', 'Prr prr', 'Kulağımın arkası!'];
const JEALOUS = ['Ya ben?!', 'Beni de sev!', 'Hıh! Kıskandım', 'Haksızlık!'];
const SLEEP = ['Zzz…', 'Mrr… balık…', 'Zzz… mama…'];
const LAND = ['Miyaaav!', 'Yaşasın!', 'Uçuyorum!', 'Wiii!'];

export class CatSocial {
  private reactions = new Map<number, Reaction>();
  clouds: FightCloud[] = [];
  fights = 0;
  friendships = 0;
  private ambientTimer = 3000;

  constructor(private fx: SocialFx) {}

  reset(): void {
    this.reactions.clear();
    this.clouds = [];
    this.fights = 0;
    this.friendships = 0;
    this.ambientTimer = 3000;
  }

  reactionOf(pid: number): Reaction | undefined {
    return this.reactions.get(pid);
  }

  private react(pid: number): Reaction {
    let r = this.reactions.get(pid);
    if (!r) {
      r = { moodStart: 0, moodUntil: 0, puffUntil: 0, jitterUntil: 0, scruffyUntil: 0 };
      this.reactions.set(pid, r);
    }
    return r;
  }

  setMood(pid: number, mood: Mood, from: number, until: number): void {
    const r = this.react(pid);
    r.mood = mood;
    r.moodStart = from;
    r.moodUntil = until;
    r.next = undefined;
  }

  say(pid: number, text: string, style: BubbleStyle, from: number, dur = 1.6): void {
    this.react(pid).bubble = { text, style, start: from, until: from + dur };
  }

  // ---------------------------------------------------------------- board queries

  private contacts(game: Game, pid: number): Contact[] {
    const map = new Map<number, Contact>();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (game.board[y][x]?.pid !== pid) continue;
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
          const o = game.board[ny][nx];
          if (!o || o.pid === pid) continue;
          let c = map.get(o.pid);
          if (!c) {
            c = { pid: o.pid, type: o.type, edges: 0, sx: 0, sy: 0, under: false };
            map.set(o.pid, c);
          }
          c.edges++;
          c.sx += x + 0.5 + dx * 0.5;
          c.sy += y + 0.5 + dy * 0.5;
          if (dy === 1) c.under = true;
        }
      }
    }
    return [...map.values()];
  }

  private headOf(game: Game, pid: number): { x: number; y: number } | null {
    let any: { x: number; y: number } | null = null;
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = game.board[y][x];
        if (c?.pid !== pid) continue;
        if (c.part === 'head') return { x, y };
        any ??= { x, y };
      }
    }
    return any;
  }

  private typeOf(game: Game, pid: number): PieceType | null {
    for (const row of game.board) for (const c of row) if (c?.pid === pid) return c.type;
    return null;
  }

  /** Cats touching the cells given (used for the falling cat's landing preview). */
  neighboursOfCells(game: Game, cells: { x: number; y: number }[]): Map<number, PieceType> {
    const out = new Map<number, PieceType>();
    for (const { x, y } of cells) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        const o = game.board[ny]?.[nx];
        if (o) out.set(o.pid, o.type);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- events

  /** A cat just landed. Returns bonus points earned through drama and friendship. */
  onLand(game: Game, pid: number, type: PieceType, time: number, hardDrop: boolean): number {
    const contacts = this.contacts(game, pid);
    const rivals = contacts.filter((c) => isRival(type, c.type));
    const friends = contacts.filter((c) => c.type === type);
    const lvl = game.level;
    let points = 0;
    const touched = new Set<number>();

    if (rivals.length >= 2 || (rivals.length === 1 && rivals[0].edges >= 2)) {
      // Full-blown cat fight.
      this.fights++;
      const edges = rivals.reduce((n, c) => n + c.edges, 0);
      const x = rivals.reduce((n, c) => n + c.sx, 0) / edges;
      const y = rivals.reduce((n, c) => n + c.sy, 0) / edges;
      const fighters = [pid, ...rivals.map((r) => r.pid)];
      const end = time + 1.25;
      this.clouds.push({ x, y, start: time, until: end, colors: [type, ...rivals.map((r) => r.type)] });
      for (const f of fighters) {
        touched.add(f);
        const r = this.react(f);
        this.setMood(f, 'angry', time, end);
        r.next = { mood: 'dizzy', from: end, until: end + 1.6 };
        r.puffUntil = end + 0.4;
        r.jitterUntil = end;
        r.scruffyUntil = time + 14;
        r.bubble = undefined;
      }
      this.say(pid, pick(AFTER_FIGHT), 'hiss', end + 0.1, 1.8);
      this.say(rivals[0].pid, pick(AFTER_FIGHT), 'hiss', end + 0.7, 1.6);
      points += 100 * lvl * rivals.length;
      this.fx.fight();
      this.fx.shake();
      this.fx.popup('KEDİ KAVGASI!', 'fight');
      this.fx.popup(`+${(100 * lvl * rivals.length).toLocaleString('en-US')}`, 'points fight-points', 150);

      // Spectators gasp.
      for (const r of rivals) {
        for (const c of this.contacts(game, r.pid)) {
          if (fighters.includes(c.pid) || touched.has(c.pid)) continue;
          touched.add(c.pid);
          this.setMood(c.pid, 'meow', time, time + 1.3);
        }
      }
    } else if (rivals.length === 1) {
      // A hissing match.
      const rival = rivals[0];
      touched.add(rival.pid).add(pid);
      this.setMood(rival.pid, 'angry', time, time + 1.6);
      this.react(rival.pid).puffUntil = time + 1.6;
      this.say(rival.pid, pick(HISS), 'hiss', time, 1.4);
      this.setMood(pid, 'angry', time + 0.45, time + 1.9);
      this.react(pid).puffUntil = time + 1.9;
      this.say(pid, pick(HISS_BACK), 'hiss', time + 0.5, 1.4);
      points += 20 * lvl;
      this.fx.hiss(true);
      this.fx.popup(`Hıhh! +${20 * lvl}`, 'hiss');
    }

    if (friends.length > 0) {
      this.friendships += friends.length;
      for (const f of friends) {
        touched.add(f.pid);
        this.setMood(f.pid, 'love', time, time + 2.2);
        this.fx.hearts(f.sx / f.edges, f.sy / f.edges, 6);
      }
      if (!rivals.length) {
        this.setMood(pid, 'love', time, time + 2.2);
        this.say(friends[0].pid, pick(LOVE), 'love', time + 0.1, 1.6);
      }
      points += 50 * lvl * friends.length;
      this.fx.purr();
      this.fx.popup(`Dost kediler ♥ +${50 * lvl * friends.length}`, 'friend', rivals.length ? 400 : 0);
    }

    // Whoever got sat on complains.
    for (const c of contacts) {
      if (!c.under || touched.has(c.pid) || Math.random() > 0.45) continue;
      this.setMood(c.pid, 'squint', time, time + 0.9);
      this.say(c.pid, pick(SAT_ON), 'say', time + 0.05, 1.3);
      break;
    }

    if (hardDrop && !rivals.length && !friends.length && Math.random() < 0.35) {
      this.say(pid, pick(LAND), 'say', time, 1.1);
    }

    game.score += points;
    return points;
  }

  /** Game over: the cats look for someone to blame. */
  onGameOver(game: Game, time: number): void {
    const pids = new Set<number>();
    for (let y = HIDDEN_ROWS; y < ROWS; y++) for (const c of game.board[y]) if (c) pids.add(c.pid);
    const list = [...pids].sort(() => Math.random() - 0.5).slice(0, 3);
    const lines = ["Hepsi Tarçın'ın suçu!", 'Eve gitmek istiyorum…', 'Mama yok mu?', 'Bir daha oynayalım!', 'Sıkıştık kaldık…', 'Miyav… 😿'];
    list.forEach((pid, i) => {
      const type = this.typeOf(game, pid);
      const text = type === 'J' ? 'Ben bir şey yapmadım!' : lines[(i + Math.floor(Math.random() * lines.length)) % lines.length];
      this.say(pid, text, i === 0 ? 'hiss' : 'say', time + 0.3 + i * 0.5, 2.6);
    });
  }

  /** The player petted a cat. */
  pet(game: Game, pid: number, time: number): void {
    const head = this.headOf(game, pid);
    this.setMood(pid, 'love', time, time + 1.8);
    this.say(pid, pick(PET), 'love', time, 1.5);
    this.fx.purr();
    if (head) this.fx.hearts(head.x + 0.5, head.y, 5);
    const jealous = this.contacts(game, pid).filter((c) => c.pid !== pid);
    if (jealous.length && Math.random() < 0.6) {
      const j = pick(jealous);
      this.setMood(j.pid, 'grumpy', time + 0.6, time + 2.2);
      this.say(j.pid, pick(JEALOUS), 'say', time + 0.7, 1.4);
    }
  }

  /** Random banter between cats sitting on the board. */
  update(game: Game, dt: number, time: number): void {
    this.clouds = this.clouds.filter((c) => c.until > time);
    for (const [pid, r] of this.reactions) {
      if (r.moodUntil < time && (r.next?.until ?? 0) < time && r.puffUntil < time && r.scruffyUntil < time && (!r.bubble || r.bubble.until < time)) {
        this.reactions.delete(pid);
      }
    }
    if (game.state !== 'playing' && game.state !== 'ready') return;

    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 2600 + Math.random() * 3800;

    const pids = new Set<number>();
    for (let y = HIDDEN_ROWS; y < ROWS; y++) for (const c of game.board[y]) if (c) pids.add(c.pid);
    const candidates = [...pids].filter((p) => {
      const r = this.reactions.get(p);
      return !r?.bubble || r.bubble.until < time;
    });
    if (!candidates.length) return;
    const pid = pick(candidates);
    const type = this.typeOf(game, pid);
    if (!type) return;

    if (game.state === 'ready') {
      this.say(pid, pick(SLEEP), 'think', time, 1.8);
      return;
    }

    const contacts = this.contacts(game, pid);
    const rival = contacts.find((c) => isRival(type, c.type));
    const friend = contacts.find((c) => c.type === type);
    const roll = Math.random();

    if (rival && roll < 0.65) {
      this.setMood(pid, 'angry', time, time + 1.4);
      this.react(pid).puffUntil = time + 1.4;
      this.say(pid, pick(HISS), 'hiss', time, 1.3);
      this.setMood(rival.pid, 'angry', time + 0.6, time + 1.9);
      this.say(rival.pid, pick(HISS_BACK), 'hiss', time + 0.65, 1.3);
      this.fx.hiss(false);
    } else if (friend && roll < 0.7) {
      this.setMood(pid, 'love', time, time + 1.8);
      this.setMood(friend.pid, 'love', time, time + 1.8);
      this.say(pid, pick(LOVE), 'love', time, 1.5);
      this.fx.hearts(friend.sx / friend.edges, friend.sy / friend.edges, 4);
    } else if (game.stackHeight > 0.7 && roll < 0.8) {
      this.setMood(pid, 'worried', time, time + 1.6);
      this.say(pid, pick(DANGER), 'say', time, 1.5);
    } else if (roll < 0.55) {
      this.say(pid, pick(PROFILES[type].catchphrase), 'say', time, 1.7);
      this.fx.chirp();
    } else {
      const text = pick(IDLE);
      if (text.startsWith('Hıaa')) this.setMood(pid, 'yawn', time, time + 1.4);
      this.say(pid, text, text.endsWith('…') ? 'think' : 'say', time, 1.5);
    }
  }
}

/** Mood of a cat at a given time, honouring a queued follow-up mood. */
export function moodAt(r: Reaction | undefined, time: number): Mood | undefined {
  if (!r) return undefined;
  if (r.mood && time >= r.moodStart && time < r.moodUntil) return r.mood;
  if (r.next && time >= r.next.from && time < r.next.until) return r.next.mood;
  return undefined;
}
