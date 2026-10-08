import { describe, expect, it } from 'vitest';
import { Game, ROWS } from './game';
import { LEFT, RIGHT } from './pieces';
import { CatSocial, RIVALS, moodAt, type SocialFx } from './social';

function fxSpy() {
  const calls: string[] = [];
  const fx: SocialFx = {
    hiss: () => calls.push('hiss'),
    growl: () => calls.push('growl'),
    fight: () => calls.push('fight'),
    purr: () => calls.push('purr'),
    chirp: () => calls.push('chirp'),
    popup: (t) => calls.push(`popup:${t}`),
    hearts: () => calls.push('hearts'),
    shake: () => calls.push('shake'),
  };
  return { fx, calls };
}

/** A flat 3-wide cat lying on the floor row at columns x..x+2. */
function lay(game: Game, type: 'J' | 'Z' | 'L' | 'T' | 'S' | 'I' | 'O', pid: number, x: number, y = ROWS - 1) {
  for (let k = 0; k < 3; k++) {
    game.board[y][x + k] = {
      type,
      pid,
      conn: (k > 0 ? LEFT : 0) | (k < 2 ? RIGHT : 0),
      part: k === 0 ? 'head' : k === 2 ? 'tail' : 'body',
    };
  }
}

describe('cat social life', () => {
  it('rivalries are mutual', () => {
    for (const [a, list] of Object.entries(RIVALS)) {
      for (const b of list) expect(RIVALS[b as keyof typeof RIVALS]).toContain(a);
    }
  });

  it('a rival landing with a big contact starts a fight and pays a bonus', () => {
    const game = new Game();
    game.start();
    const { fx, calls } = fxSpy();
    const social = new CatSocial(fx);
    lay(game, 'Z', 1, 0); // Duman on the floor
    lay(game, 'J', 2, 0, ROWS - 2); // Tarçın lands right on top of him: 3 touching edges
    const before = game.score;
    const pts = social.onLand(game, 2, 'J', 10, false);
    expect(pts).toBe(100);
    expect(game.score - before).toBe(100);
    expect(calls).toContain('fight');
    expect(social.fights).toBe(1);
    expect(social.clouds).toHaveLength(1);
    expect(moodAt(social.reactionOf(1), 10.1)).toBe('angry');
    expect(moodAt(social.reactionOf(1), 11.5)).toBe('dizzy');
    expect(social.reactionOf(2)!.scruffyUntil).toBeGreaterThan(20);
  });

  it('a light brush with a rival is only a hissing match', () => {
    const game = new Game();
    game.start();
    const { fx, calls } = fxSpy();
    const social = new CatSocial(fx);
    lay(game, 'T', 1, 0);
    lay(game, 'S', 2, 3); // touches Pembiş on one edge only
    const pts = social.onLand(game, 2, 'S', 5, false);
    expect(pts).toBe(20);
    expect(calls).toContain('hiss');
    expect(calls).not.toContain('fight');
    expect(social.reactionOf(1)?.bubble?.style).toBe('hiss');
  });

  it('same-coloured cats become friends', () => {
    const game = new Game();
    game.start();
    const { fx, calls } = fxSpy();
    const social = new CatSocial(fx);
    lay(game, 'O', 1, 0);
    lay(game, 'O', 2, 3);
    const pts = social.onLand(game, 2, 'O', 5, false);
    expect(pts).toBe(50);
    expect(calls).toContain('purr');
    expect(social.friendships).toBe(1);
    expect(moodAt(social.reactionOf(1), 5.5)).toBe('love');
  });

  it('strangers that are neither friends nor rivals leave each other alone', () => {
    const game = new Game();
    game.start();
    const { fx } = fxSpy();
    const social = new CatSocial(fx);
    lay(game, 'I', 1, 0);
    lay(game, 'T', 2, 3);
    expect(social.onLand(game, 2, 'T', 5, false)).toBe(0);
  });
});
