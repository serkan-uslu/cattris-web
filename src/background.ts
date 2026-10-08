// A cosy cat room painted procedurally behind the game.

import { drawShape } from './particles';

interface Bokeh {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  hue: string;
}

export class RoomBackground {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cache: HTMLCanvasElement | null = null;
  private w = 0;
  private h = 0;
  private bokeh: Bokeh[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.cache = null;
    const hues = ['255,214,150', '255,170,200', '190,220,255', '255,240,200'];
    this.bokeh = Array.from({ length: 18 }, (_, i) => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      r: 8 + Math.random() * 26,
      speed: 4 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      hue: hues[i % hues.length],
    }));
  }

  private get u(): number {
    return Math.min(this.w, this.h * 1.6) / 100;
  }

  private paint(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d')!;
    const { w, h, u } = this;
    const floorY = h * 0.8;

    // Wall
    const wall = g.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, '#f3dccb');
    wall.addColorStop(1, '#e8c7ae');
    g.fillStyle = wall;
    g.fillRect(0, 0, w, floorY);

    // Paw print wallpaper
    g.fillStyle = 'rgba(190, 130, 100, 0.13)';
    const step = u * 9;
    for (let y = step * 0.5, row = 0; y < floorY - step * 0.3; y += step, row++) {
      for (let x = (row % 2) * step * 0.5; x < w + step; x += step) {
        g.save();
        g.translate(x, y);
        g.rotate(((row * 7 + Math.floor(x / step)) % 5) * 0.15 - 0.3);
        drawShape(g, 'paw', u * 1.4);
        g.restore();
      }
    }

    // Warm lamp glow
    const glow = g.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, Math.max(w, h) * 0.6);
    glow.addColorStop(0, 'rgba(255, 236, 200, 0.55)');
    glow.addColorStop(1, 'rgba(255, 236, 200, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);

    // Skirting board + floor
    g.fillStyle = '#c58f69';
    g.fillRect(0, floorY - u * 1.6, w, u * 1.6);
    const floor = g.createLinearGradient(0, floorY, 0, h);
    floor.addColorStop(0, '#c9976d');
    floor.addColorStop(1, '#9d6a46');
    g.fillStyle = floor;
    g.fillRect(0, floorY, w, h - floorY);
    g.strokeStyle = 'rgba(90, 50, 30, 0.25)';
    g.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      const y = floorY + (h - floorY) * (i / 6) ** 1.2;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }

    // Rug
    g.fillStyle = '#9fcfcf';
    g.beginPath();
    g.ellipse(w * 0.5, h * 1.0, w * 0.42, h * 0.13, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = u * 0.6;
    g.setLineDash([u * 1.2, u * 1]);
    g.beginPath();
    g.ellipse(w * 0.5, h * 1.0, w * 0.39, h * 0.105, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);

    this.paintShelf(g, u * 1.5, h * 0.14, u * 22, floorY - h * 0.14);
    this.paintFrame(g, w - u * 22, h * 0.06, u * 13, u * 15);
    this.paintCatTree(g, w - u * 13, floorY);

    // Yarn balls on the floor
    this.yarn(g, u * 6, h * 0.9, u * 6.5, '#69b7e0');
    this.yarn(g, u * 15, h * 0.93, u * 7, '#f48fb7');
    g.strokeStyle = '#f48fb7';
    g.lineWidth = u * 0.5;
    g.beginPath();
    g.moveTo(u * 21, h * 0.95);
    g.bezierCurveTo(u * 28, h * 0.99, u * 26, h * 0.9, u * 34, h * 0.95);
    g.stroke();
    this.yarn(g, w - u * 30, h * 0.9, u * 3.2, '#b39af0');
    return c;
  }

  private yarn(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    g.save();
    g.fillStyle = 'rgba(60, 30, 20, 0.2)';
    g.beginPath();
    g.ellipse(x, y + r * 0.9, r * 1.05, r * 0.25, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = r * 0.09;
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.ellipse(x + i * r * 0.28, y, r * 0.35, r * 1.2, 0.5, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.ellipse(x, y + i * r * 0.35, r * 1.2, r * 0.3, -0.4, 0, Math.PI * 2);
      g.stroke();
    }
    const shade = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    shade.addColorStop(0, 'rgba(255,255,255,0.3)');
    shade.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = shade;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
  }

  private wood(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const grad = g.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#b47a4f');
    grad.addColorStop(1, '#8c5a37');
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(x, y, w, h, Math.min(w, h) * 0.15);
    g.fill();
  }

  private paintShelf(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const { u } = this;
    g.fillStyle = 'rgba(80,40,20,0.15)';
    g.fillRect(x + u, y + u, w, h);
    this.wood(g, x, y, w, h);
    g.fillStyle = '#e9c9a8';
    g.fillRect(x + u * 1.2, y + u * 1.2, w - u * 2.4, h - u * 2.4);
    const shelves = 3;
    const sh = (h - u * 2.4) / shelves;
    for (let i = 1; i < shelves; i++) this.wood(g, x, y + u * 1.2 + sh * i - u * 0.6, w, u * 1.4);
    // Shelf 1: yarn balls
    const s1 = y + u * 1.2 + sh;
    this.yarn(g, x + w * 0.28, s1 - u * 4.2, u * 3.6, '#7ccf7a');
    this.yarn(g, x + w * 0.62, s1 - u * 3.6, u * 3, '#ff9fb8');
    // Shelf 2: toy stack rings
    const s2 = y + u * 1.2 + sh * 2;
    const rings = ['#ff8a8a', '#ffd166', '#7fc8f8', '#a98cf0'];
    rings.forEach((col, i) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(x + w * 0.3, s2 - u * (1.4 + i * 1.3), u * (3.4 - i * 0.5), u * 0.9, 0, 0, Math.PI * 2);
      g.fill();
    });
    this.yarn(g, x + w * 0.74, s2 - u * 2.6, u * 2.2, '#ffb36b');
  }

  private paintFrame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const { u } = this;
    this.wood(g, x, y, w, h);
    g.fillStyle = '#f7e6d5';
    g.fillRect(x + u, y + u, w - u * 2, h - u * 2);
    // Cat silhouette portrait
    g.fillStyle = '#9b7e8f';
    const cx = x + w / 2;
    const cy = y + h * 0.62;
    g.beginPath();
    g.ellipse(cx, cy + u, u * 3.4, u * 3.6, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(cx, cy - u * 3.4, u * 2.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx - u * 2.3, cy - u * 4);
    g.lineTo(cx - u * 1.9, cy - u * 6.6);
    g.lineTo(cx - u * 0.6, cy - u * 5.4);
    g.moveTo(cx + u * 2.3, cy - u * 4);
    g.lineTo(cx + u * 1.9, cy - u * 6.6);
    g.lineTo(cx + u * 0.6, cy - u * 5.4);
    g.fill();
    g.strokeStyle = '#9b7e8f';
    g.lineWidth = u * 0.9;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx + u * 3, cy + u * 3.5);
    g.quadraticCurveTo(cx + u * 5.5, cy + u * 3, cx + u * 4.6, cy - u * 0.5);
    g.stroke();
  }

  private paintCatTree(g: CanvasRenderingContext2D, x: number, floorY: number): void {
    const { u } = this;
    // Sisal post
    g.fillStyle = '#d9b98c';
    g.fillRect(x - u * 1.6, floorY - u * 46, u * 3.2, u * 46);
    g.strokeStyle = 'rgba(120,80,40,0.35)';
    g.lineWidth = u * 0.3;
    for (let yy = floorY - u * 46; yy < floorY; yy += u * 0.9) {
      g.beginPath();
      g.moveTo(x - u * 1.6, yy);
      g.lineTo(x + u * 1.6, yy + u * 0.4);
      g.stroke();
    }
    // Platforms
    const plat = (py: number, pw: number) => {
      g.fillStyle = '#c99b6a';
      g.beginPath();
      g.roundRect(x - pw / 2, py, pw, u * 2.2, u);
      g.fill();
      g.fillStyle = '#e0b886';
      g.beginPath();
      g.roundRect(x - pw / 2, py - u * 0.6, pw, u * 1.2, u * 0.6);
      g.fill();
    };
    plat(floorY - u * 46, u * 16);
    plat(floorY - u * 28, u * 13);
    // Cubby house
    g.fillStyle = '#c99b6a';
    g.beginPath();
    g.roundRect(x - u * 9, floorY - u * 13, u * 18, u * 13, u * 2);
    g.fill();
    g.fillStyle = '#5b3a2a';
    g.beginPath();
    g.ellipse(x, floorY - u * 6, u * 4.4, u * 4.6, 0, 0, Math.PI * 2);
    g.fill();
  }

  /** Animated layer: sleeping shelf cat, swinging pom-pom, floating bokeh. */
  render(time: number): void {
    if (!this.cache) this.cache = this.paint();
    const g = this.ctx;
    const { w, h, u } = this;
    g.drawImage(this.cache, 0, 0);

    // Sleeping cat on the top shelf
    const shelfX = u * 1.5;
    const shelfY = h * 0.14;
    const shelfH = h * 0.8 - shelfY;
    const sx = shelfX + u * 11;
    const sy = shelfY + u * 1.2 + (shelfH - u * 2.4) / 3 * 3 - u * 0.4;
    const breath = Math.sin(time * 1.5) * 0.04;
    g.save();
    g.translate(sx, sy);
    g.scale(1, 1 + breath);
    g.fillStyle = '#d99a5b';
    g.beginPath();
    g.ellipse(0, -u * 3, u * 6.5, u * 3.2, 0, Math.PI, 0);
    g.fill();
    g.beginPath();
    g.arc(-u * 5, -u * 2.6, u * 2.6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-u * 7.2, -u * 4);
    g.lineTo(-u * 7, -u * 6.4);
    g.lineTo(-u * 5.4, -u * 5);
    g.moveTo(-u * 3, -u * 4);
    g.lineTo(-u * 3.3, -u * 6.4);
    g.lineTo(-u * 4.8, -u * 5);
    g.fill();
    g.strokeStyle = '#7a4a24';
    g.lineWidth = u * 0.35;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(-u * 5.9, -u * 2.6, u * 0.6, 0.2, Math.PI - 0.2);
    g.moveTo(-u * 3.5, -u * 2.6);
    g.arc(-u * 4.1, -u * 2.6, u * 0.6, 0.2, Math.PI - 0.2);
    g.stroke();
    g.strokeStyle = '#d99a5b';
    g.lineWidth = u * 1.3;
    g.beginPath();
    g.moveTo(u * 6, -u * 1);
    g.quadraticCurveTo(u * 9, u * 1 + Math.sin(time * 1.2) * u, u * 8, u * 4);
    g.stroke();
    g.restore();
    const zt = (time * 0.4) % 1;
    g.fillStyle = `rgba(120, 80, 120, ${Math.sin(zt * Math.PI) * 0.7})`;
    g.font = `700 ${u * 2.4}px Fredoka, sans-serif`;
    g.fillText('z', sx - u * 4 + zt * u * 3, sy - u * 7 - zt * u * 5);

    // Swinging pom-pom on the cat tree
    const px = w - u * 13 + u * 6;
    const py = h * 0.8 - u * 46 + u * 2;
    const ang = Math.sin(time * 1.8) * 0.35;
    const len = u * 12;
    const bx = px + Math.sin(ang) * len;
    const by = py + Math.cos(ang) * len;
    g.strokeStyle = '#7a5236';
    g.lineWidth = u * 0.3;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(bx, by);
    g.stroke();
    g.fillStyle = '#ff9fc4';
    g.beginPath();
    g.arc(bx, by, u * 1.8, 0, Math.PI * 2);
    g.fill();

    // Bokeh
    for (const b of this.bokeh) {
      const y = (b.y - time * b.speed) % (h + 60);
      const yy = y < -30 ? y + h + 60 : y;
      const x = b.x + Math.sin(time * 0.3 + b.phase) * 20;
      const a = 0.18 + Math.sin(time * 0.8 + b.phase) * 0.08;
      const grad = g.createRadialGradient(x, yy, 0, x, yy, b.r);
      grad.addColorStop(0, `rgba(${b.hue},${a})`);
      grad.addColorStop(1, `rgba(${b.hue},0)`);
      g.fillStyle = grad;
      g.fillRect(x - b.r, yy - b.r, b.r * 2, b.r * 2);
    }
  }
}
