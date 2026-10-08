export type ParticleKind = 'heart' | 'star' | 'paw' | 'sparkle' | 'dust' | 'yarn';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  vrot: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  private list: Particle[] = [];

  get count(): number {
    return this.list.length;
  }

  emit(
    kind: ParticleKind,
    x: number,
    y: number,
    opts: Partial<Pick<Particle, 'vx' | 'vy' | 'gravity' | 'size' | 'color' | 'maxLife'>> & { spread?: number } = {},
  ): void {
    const spread = opts.spread ?? 1;
    const life = opts.maxLife ?? rand(0.7, 1.2);
    this.list.push({
      kind,
      x,
      y,
      vx: (opts.vx ?? 0) + rand(-60, 60) * spread,
      vy: (opts.vy ?? -60) + rand(-50, 30) * spread,
      gravity: opts.gravity ?? 120,
      life,
      maxLife: life,
      size: opts.size ?? rand(6, 11),
      color: opts.color ?? '#ff8fc0',
      rot: rand(-0.5, 0.5),
      vrot: rand(-3, 3),
    });
    if (this.list.length > 600) this.list.splice(0, this.list.length - 600);
  }

  update(dt: number): void {
    const s = dt / 1000;
    for (const p of this.list) {
      p.life -= s;
      p.vy += p.gravity * s;
      p.vx *= Math.pow(0.4, s);
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.vrot * s;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const sc = p.kind === 'dust' ? 1 + (1 - t) * 1.5 : 0.6 + Math.min(1, (1 - t) * 6) * 0.4;
      ctx.scale(sc, sc);
      ctx.fillStyle = p.color;
      drawShape(ctx, p.kind, p.size);
      ctx.restore();
    }
  }
}

export function drawShape(ctx: CanvasRenderingContext2D, kind: ParticleKind, s: number): void {
  ctx.beginPath();
  switch (kind) {
    case 'heart': {
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
      ctx.fill();
      break;
    }
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s : s * 0.45;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'sparkle': {
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(0, 0, s, 0);
      ctx.quadraticCurveTo(0, 0, 0, s);
      ctx.quadraticCurveTo(0, 0, -s, 0);
      ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.fill();
      break;
    }
    case 'paw': {
      ctx.ellipse(0, s * 0.25, s * 0.45, s * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      const toes: [number, number][] = [[-0.45, -0.2], [-0.16, -0.48], [0.16, -0.48], [0.45, -0.2]];
      for (const [tx, ty] of toes) {
        ctx.beginPath();
        ctx.ellipse(tx * s, ty * s, s * 0.16, s * 0.2, tx * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'dust': {
      ctx.globalAlpha *= 0.55;
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'yarn': {
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, s * 0.15);
      ctx.beginPath();
      ctx.arc(-s * 0.3, 0, s * 0.8, -1, 1);
      ctx.moveTo(s * 0.5, -s * 0.6);
      ctx.arc(s * 0.1, 0, s * 0.75, -0.9, 0.9);
      ctx.stroke();
      break;
    }
  }
}
