/* Встроенные анимации ловушек: рисуются на обычном 2D-холсте, кадр за кадром.
   Без Foundry и PIXI — тот же код показывает их на сцене (foundry/fx.mjs) и на стенде (dev/fx).

   Эффект: { duration (мс), pad (клеток вокруг области), init(env) → state, draw(ctx, t, env, state) }
   env: { w, h — холст; cx, cy — центр области; cell — клетка в px; size — сторона области в px;
          R — половина стороны; rand — случайные числа эффекта; seed }
   t — от 0 до 1. Холст очищается перед каждым кадром. */

const TAU = Math.PI * 2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, p) => a + (b - a) * p;
/** Доля пути внутри отрезка времени [a, b]. */
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const outCubic = (p) => 1 - (1 - p) ** 3;
const inCubic = (p) => p ** 3;
const inOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const outBack = (p) => {
  const c = 1.70158;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
};
/** Плавно проявиться за [a, b] и исчезнуть за [c, d]. */
const fade = (t, a, b, c, d) => seg(t, a, b) * (1 - seg(t, c, d));
const between = (rand, a, b) => a + rand() * (b - a);

const rgba = ([r, g, b], a) => `rgba(${r | 0},${g | 0},${b | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (c1, c2, p) => [lerp(c1[0], c2[0], p), lerp(c1[1], c2[1], p), lerp(c1[2], c2[2], p)];

/** Цвет по шкале [[доля, [r,g,b]], …]. */
function ramp(stops, p) {
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      return mix(ca, cb, (p - a) / (b - a || 1));
    }
  }
  return stops[stops.length - 1][1];
}

function glow(ctx, x, y, r, color, a, inner = 0) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, r * inner, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function ring(ctx, x, y, r, width, color, a) {
  if (r <= 0 || a <= 0 || width <= 0) return;
  ctx.strokeStyle = rgba(color, a);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

/** Неровный многоугольник вокруг точки: jitter — вершины на радиусе [1-j, 1+j]. */
function blobPoints(rand, n, jitter) {
  return Array.from({ length: n }, (_, i) => ({ a: (i / n) * TAU, k: 1 + between(rand, -jitter, jitter) }));
}

function blobPath(ctx, x, y, r, points, ry = r) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const px = x + Math.cos(p.a) * r * p.k;
    const py = y + Math.sin(p.a) * ry * p.k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

/** Частицы со своим временем жизни: delay и life — доли общей длительности. */
function makeParticles(rand, n, make) {
  return Array.from({ length: n }, (_, i) => make(rand, i));
}

/** Магический знак: два круга, руны между ними, медленно вращается. */
function makeRune(rand) {
  return Array.from({ length: 12 }, () =>
    Array.from({ length: 3 }, () => [between(rand, -1, 1), between(rand, -1, 1), between(rand, -1, 1), between(rand, -1, 1)]),
  );
}

function drawRune(ctx, env, glyphs, t, color, alpha) {
  if (alpha <= 0) return;
  const { cx, cy } = env;
  const r = Math.max(env.R * 0.92, env.cell * 0.45);
  const spin = t * 0.9;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, cx, cy, r * 1.25, color, 0.22 * alpha);
  ctx.shadowColor = rgba(color, alpha);
  ctx.shadowBlur = env.cell * 0.12;
  ctx.lineCap = "round";
  ring(ctx, cx, cy, r, Math.max(1.5, env.cell * 0.025), color, 0.9 * alpha);
  ring(ctx, cx, cy, r * 0.74, Math.max(1, env.cell * 0.015), color, 0.75 * alpha);
  ctx.strokeStyle = rgba(color, 0.9 * alpha);
  ctx.lineWidth = Math.max(1, env.cell * 0.014);
  const g = (r * 0.26) / 2.4;
  glyphs.forEach((strokes, i) => {
    const a = spin + (i / glyphs.length) * TAU;
    const gx = cx + Math.cos(a) * r * 0.87;
    const gy = cy + Math.sin(a) * r * 0.87;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of strokes) {
      ctx.moveTo(gx + x1 * g, gy + y1 * g);
      ctx.lineTo(gx + x2 * g, gy + y2 * g);
    }
    ctx.stroke();
  });
  // Вписанная звезда — поворачивается навстречу.
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -spin * 0.6 + ((i * 2) / 5) * TAU - Math.PI / 2;
    const px = cx + Math.cos(a) * r * 0.7;
    const py = cy + Math.sin(a) * r * 0.7;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

/** Пыль: мягкие серо-бурые клубы. */
function dust(ctx, x, y, r, a, color = [150, 132, 108]) {
  glow(ctx, x, y, r, color, a, 0.1);
}

/** Летящий снаряд (дротик, стрела) с шлейфом. */
function projectile(ctx, x, y, angle, len, width, colors, trail) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  if (trail > 0) {
    const tx = x - dx * trail;
    const ty = y - dy * trail;
    const g = ctx.createLinearGradient(tx, ty, x, y);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(255,255,255,0.55)");
    ctx.strokeStyle = g;
    ctx.lineWidth = width * 1.6;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  const bx = x - dx * len;
  const by = y - dy * len;
  ctx.lineCap = "round";
  ctx.strokeStyle = colors.shaft;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(x, y);
  ctx.stroke();
  // Наконечник
  ctx.fillStyle = colors.tip;
  ctx.beginPath();
  ctx.moveTo(x + dx * width * 2.2, y + dy * width * 2.2);
  ctx.lineTo(x - dy * width * 1.3, y + dx * width * 1.3);
  ctx.lineTo(x + dy * width * 1.3, y - dx * width * 1.3);
  ctx.closePath();
  ctx.fill();
  // Оперение
  ctx.strokeStyle = colors.fletch;
  ctx.lineWidth = width * 0.9;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(bx + dx * len * 0.22, by + dy * len * 0.22);
    ctx.lineTo(bx - dx * width * 0.5 + -dy * s * width * 2.2, by - dy * width * 0.5 + dx * s * width * 2.2);
  }
  ctx.stroke();
}

function sparks(ctx, x, y, p, rays, len, color) {
  if (p <= 0 || p >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(color, 1 - p);
  ctx.lineWidth = Math.max(1, len * 0.08);
  ctx.beginPath();
  for (const a of rays) {
    const r1 = len * p * 0.6;
    const r2 = len * (0.3 + p);
    ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
  }
  ctx.stroke();
  glow(ctx, x, y, len * 0.7, color, 0.6 * (1 - p));
  ctx.restore();
}

function stone(ctx, x, y, r, points, rot, base, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, rgba(mix(base, [255, 255, 255], 0.35), alpha));
  g.addColorStop(0.55, rgba(base, alpha));
  g.addColorStop(1, rgba(mix(base, [0, 0, 0], 0.55), alpha));
  ctx.fillStyle = g;
  blobPath(ctx, 0, 0, r, points);
  ctx.fill();
  ctx.strokeStyle = rgba([25, 20, 15], 0.6 * alpha);
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------- эффекты */

const pit = {
  duration: 1900,
  pad: 0.8,
  init(env) {
    const { rand, R } = env;
    return {
      hole: blobPoints(rand, 20, 0.12),
      cracks: makeParticles(rand, 8, (r, i) => ({
        a: (i / 8) * TAU + between(r, -0.3, 0.3),
        len: between(r, 0.9, 1.35),
        bend: between(r, -0.35, 0.35),
      })),
      stones: makeParticles(rand, 16, (r) => ({
        a: between(r, 0, TAU),
        d: between(r, 0.75, 1.05),
        s: between(r, 0.05, 0.1) * env.cell,
        delay: between(r, 0.14, 0.42),
        rot: between(r, 0, TAU),
        pts: blobPoints(r, 6, 0.3),
        col: [between(r, 95, 130), between(r, 82, 105), between(r, 64, 82)],
      })),
      R,
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, R, cell } = env;
    const out = 1 - seg(t, 0.82, 1);
    const holeR = R * 0.8 * outBack(seg(t, 0.12, 0.4));
    // Трещины
    const cp = outCubic(seg(t, 0, 0.16));
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba([22, 15, 9], 0.85 * out * seg(t, 0, 0.06));
    ctx.lineWidth = Math.max(1.2, cell * 0.022);
    ctx.beginPath();
    for (const c of s.cracks) {
      const len = R * c.len * cp;
      const mx = cx + Math.cos(c.a + c.bend) * len * 0.5;
      const my = cy + Math.sin(c.a + c.bend) * len * 0.5;
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(mx, my, cx + Math.cos(c.a) * len, cy + Math.sin(c.a) * len);
    }
    ctx.stroke();
    // Провал
    if (holeR > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, holeR);
      g.addColorStop(0, rgba([0, 0, 0], 0.97 * out));
      g.addColorStop(0.65, rgba([8, 6, 4], 0.92 * out));
      g.addColorStop(1, rgba([40, 30, 20], 0.75 * out));
      ctx.fillStyle = g;
      blobPath(ctx, cx, cy, holeR, s.hole);
      ctx.fill();
      ctx.strokeStyle = rgba([92, 72, 50], 0.9 * out);
      ctx.lineWidth = Math.max(1.5, cell * 0.035);
      ctx.stroke();
    }
    // Камешки срываются вниз
    for (const st of s.stones) {
      const p = seg(t, st.delay, st.delay + 0.32);
      if (p <= 0 || p >= 1) continue;
      const d = lerp(st.d, 0.05, inCubic(p)) * R * 0.85;
      stone(ctx, cx + Math.cos(st.a) * d, cy + Math.sin(st.a) * d, st.s * (1 - 0.75 * p), st.pts, st.rot + p * 4, st.col, 1 - p * 0.6);
    }
    // Кольцо пыли
    const dp = seg(t, 0.14, 0.8);
    if (dp > 0 && dp < 1) {
      ring(ctx, cx, cy, R * (0.85 + 0.75 * outCubic(dp)), cell * 0.28 * (1 - dp), [158, 138, 110], 0.38 * (1 - dp));
      ring(ctx, cx, cy, R * (0.8 + 0.5 * outCubic(dp)), cell * 0.16 * (1 - dp), [190, 172, 145], 0.25 * (1 - dp));
    }
  },
};

const spikes = {
  duration: 1900,
  pad: 0.6,
  init(env) {
    const { rand, cell, size } = env;
    const cells = Math.max(1, Math.round(size / cell));
    const list = [];
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const n = 5;
        for (let k = 0; k < n; k++) {
          list.push({
            x: env.cx - size / 2 + (i + between(rand, 0.15, 0.85)) * cell,
            y: env.cy - size / 2 + (j + between(rand, 0.25, 0.95)) * cell,
            h: between(rand, 0.34, 0.55) * cell,
            w: between(rand, 0.08, 0.12) * cell,
            delay: between(rand, 0, 0.07),
          });
        }
      }
    }
    list.sort((a, b) => a.y - b.y);
    return {
      spikes: list,
      puffs: makeParticles(rand, 10, (r) => ({ x: between(r, -0.45, 0.45) * size, y: between(r, -0.4, 0.45) * size, s: between(r, 0.2, 0.4) * cell })),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const out = 1 - seg(t, 0.9, 1);
    for (const sp of s.spikes) {
      const up = outBack(seg(t, 0.08 + sp.delay, 0.2 + sp.delay));
      const down = inCubic(seg(t, 0.74, 0.94));
      const h = sp.h * up * (1 - down);
      // Отверстие в полу
      ctx.fillStyle = rgba([10, 8, 6], 0.75 * fade(t, 0, 0.08, 0.9, 1));
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.w * 0.75, sp.w * 0.32, 0, 0, TAU);
      ctx.fill();
      if (h <= 0.5) continue;
      ctx.fillStyle = rgba([0, 0, 0], 0.3 * out);
      ctx.beginPath();
      ctx.ellipse(sp.x + h * 0.25, sp.y + sp.w * 0.1, h * 0.35, sp.w * 0.35, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createLinearGradient(sp.x - sp.w / 2, 0, sp.x + sp.w / 2, 0);
      g.addColorStop(0, rgba([70, 70, 78], out));
      g.addColorStop(0.45, rgba([235, 235, 240], out));
      g.addColorStop(1, rgba([55, 55, 62], out));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sp.x - sp.w / 2, sp.y);
      ctx.lineTo(sp.x, sp.y - h);
      ctx.lineTo(sp.x + sp.w / 2, sp.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba([25, 25, 30], 0.7 * out);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const dp = seg(t, 0.08, 0.45);
    if (dp > 0 && dp < 1) for (const p of s.puffs) dust(ctx, cx + p.x, cy + p.y, p.s * (0.6 + dp), 0.35 * (1 - dp));
  },
};

const jaws = {
  duration: 1700,
  pad: 0.6,
  init(env) {
    const { rand } = env;
    return { rays: makeParticles(rand, 12, (r) => between(r, 0, TAU)) };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const r = Math.min(env.R * 0.8, cell * 0.42);
    const close = inCubic(seg(t, 0.12, 0.22));
    const shake = t > 0.22 ? Math.sin(t * 160) * (1 - seg(t, 0.22, 0.42)) * cell * 0.04 : 0;
    const alpha = 1 - seg(t, 0.86, 1);
    const ry = lerp(r, r * 0.12, close);
    ctx.save();
    ctx.translate(cx + shake, cy);
    // Цепь
    ctx.strokeStyle = rgba([70, 66, 60], alpha);
    ctx.lineWidth = Math.max(1.5, cell * 0.025);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(r + cell * (0.08 + i * 0.09), 0, cell * 0.055, cell * 0.035, 0, 0, TAU);
      ctx.stroke();
    }
    // Тень и дуги
    ctx.fillStyle = rgba([0, 0, 0], 0.28 * alpha);
    ctx.beginPath();
    ctx.ellipse(cell * 0.03, cell * 0.04, r * 1.08, ry * 1.08 + cell * 0.04, 0, 0, TAU);
    ctx.fill();
    const iron = ctx.createLinearGradient(0, -r, 0, r);
    iron.addColorStop(0, rgba([150, 146, 140], alpha));
    iron.addColorStop(0.5, rgba([90, 86, 80], alpha));
    iron.addColorStop(1, rgba([45, 42, 40], alpha));
    ctx.strokeStyle = iron;
    ctx.lineWidth = Math.max(3, cell * 0.07);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, ry, 0, 0, TAU);
    ctx.stroke();
    // Зубья смотрят внутрь
    ctx.fillStyle = rgba([205, 202, 196], alpha);
    const teeth = 14;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * ry;
      const inward = Math.atan2(-y, -x);
      const len = cell * 0.11 * (1 - close * 0.4);
      const half = cell * 0.035;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(inward + Math.PI / 2) * half, y + Math.sin(inward + Math.PI / 2) * half);
      ctx.lineTo(x + Math.cos(inward) * len, y + Math.sin(inward) * len);
      ctx.lineTo(x + Math.cos(inward - Math.PI / 2) * half, y + Math.sin(inward - Math.PI / 2) * half);
      ctx.fill();
    }
    // Пластина-спуск
    ctx.fillStyle = rgba([110, 96, 70], alpha * (1 - close));
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
    sparks(ctx, cx, cy, seg(t, 0.21, 0.4), s.rays, cell * 0.45, [255, 210, 140]);
  },
};

function makeShots(env, { count, spread, fromSide, delayMax, travel }) {
  const { rand, cx, cy, cell } = env;
  const base = between(rand, 0, TAU);
  const reach = Math.min(env.w, env.h) / 2 - cell * 0.2;
  return makeParticles(rand, count, (r, i) => {
    const tx = cx + between(r, -spread, spread);
    const ty = cy + between(r, -spread, spread);
    const a = base + between(r, -fromSide, fromSide);
    return {
      sx: tx - Math.cos(a) * reach,
      sy: ty - Math.sin(a) * reach,
      tx,
      ty,
      a,
      delay: count > 1 ? (i / (count - 1)) * delayMax + between(r, 0, 0.03) : 0,
      travel,
      rays: [a + Math.PI - 0.6, a + Math.PI, a + Math.PI + 0.6, a + Math.PI - 1.4, a + Math.PI + 1.4],
      stuck: between(r, 0.35, 0.6),
    };
  });
}

function drawShots(ctx, t, env, shots, look) {
  const { cell } = env;
  const out = 1 - seg(t, 0.85, 1);
  for (const sh of shots) {
    const p = seg(t, sh.delay, sh.delay + sh.travel);
    if (p <= 0) continue;
    if (p < 1) {
      const x = lerp(sh.sx, sh.tx, p);
      const y = lerp(sh.sy, sh.ty, p);
      projectile(ctx, x, y, sh.a, look.len, look.width, look.colors, cell * 0.7);
    } else {
      // Воткнулся: короче (под углом к полу)
      const len = look.len * sh.stuck;
      ctx.globalAlpha = out;
      projectile(ctx, sh.tx, sh.ty, sh.a, len, look.width, look.colors, 0);
      ctx.globalAlpha = 1;
      const since = (t - (sh.delay + sh.travel)) / 0.12;
      sparks(ctx, sh.tx, sh.ty, since, sh.rays, cell * 0.22, [255, 230, 190]);
      if (look.puff) {
        const pp = seg(t, sh.delay + sh.travel, sh.delay + sh.travel + 0.3);
        if (pp > 0 && pp < 1) glow(ctx, sh.tx, sh.ty, cell * (0.12 + 0.25 * pp), look.puff, 0.5 * (1 - pp));
      }
    }
  }
}

const darts = {
  duration: 1500,
  pad: 1.6,
  init(env) {
    return { shots: makeShots(env, { count: 5, spread: env.cell * 0.18, fromSide: 0.45, delayMax: 0.28, travel: 0.16 }) };
  },
  draw(ctx, t, env, s) {
    drawShots(ctx, t, env, s.shots, {
      len: env.cell * 0.28,
      width: Math.max(1.5, env.cell * 0.022),
      colors: { shaft: "#3b2f22", tip: "#d9dde2", fletch: "#b0302a" },
      puff: [120, 205, 70],
    });
  },
};

const arrows = {
  duration: 2000,
  pad: 1.8,
  init(env) {
    const cells = Math.max(1, Math.round(env.size / env.cell));
    return {
      shots: makeShots(env, { count: 6 + cells * cells * 3, spread: env.R * 0.92, fromSide: 0.12, delayMax: 0.42, travel: 0.17 }),
    };
  },
  draw(ctx, t, env, s) {
    drawShots(ctx, t, env, s.shots, {
      len: env.cell * 0.5,
      width: Math.max(1.5, env.cell * 0.022),
      colors: { shaft: "#6b4a2b", tip: "#c9ced4", fletch: "#ece6d8" },
    });
  },
};

const net = {
  duration: 2300,
  pad: 0.9,
  init(env) {
    const { rand } = env;
    const cells = Math.max(1, Math.round(env.size / env.cell));
    const n = 5 * cells + 1;
    return {
      n,
      sag: Array.from({ length: n * 2 }, () => between(rand, -0.5, 0.5)),
      skip: Array.from({ length: n * n }, () => rand() < 0.15),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const drop = outCubic(seg(t, 0, 0.32));
    const alpha = seg(t, 0, 0.12) * (1 - seg(t, 0.86, 1));
    const wob = Math.sin(t * 38) * (1 - seg(t, 0.32, 0.6)) * (t > 0.32 ? 1 : 0) * cell * 0.04;
    const scale = lerp(1.75, 1, drop);
    const S = env.size * 1.08 * scale;
    // Тень
    ctx.fillStyle = rgba([0, 0, 0], 0.22 * alpha * drop);
    const sh = S * lerp(0.7, 1, drop);
    ctx.fillRect(cx - sh / 2 + cell * 0.06, cy - sh / 2 + cell * 0.08, sh, sh);
    const x0 = cx - S / 2;
    const y0 = cy - S / 2 + wob;
    const step = S / (s.n - 1);
    const sagK = step * 0.35 * (1 - drop * 0.6) + step * 0.12;
    const lines = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        const x = x0 + i * step;
        ctx.moveTo(x, y0);
        ctx.quadraticCurveTo(x + s.sag[i] * sagK, cy + wob, x, y0 + S);
        const y = y0 + i * step;
        ctx.moveTo(x0, y);
        ctx.quadraticCurveTo(cx, y + s.sag[s.n + i] * sagK, x0 + S, y);
      }
      ctx.stroke();
    };
    ctx.lineCap = "round";
    lines(Math.max(2.5, cell * 0.04 * scale), rgba([45, 32, 18], 0.85 * alpha));
    lines(Math.max(1.2, cell * 0.02 * scale), rgba([176, 140, 88], alpha));
    // Узлы
    ctx.fillStyle = rgba([120, 90, 52], alpha);
    for (let i = 0; i < s.n; i++) {
      for (let j = 0; j < s.n; j++) {
        if (s.skip[i * s.n + j]) continue;
        ctx.beginPath();
        ctx.arc(x0 + i * step, y0 + j * step, Math.max(1.5, cell * 0.022 * scale), 0, TAU);
        ctx.fill();
      }
    }
    // Грузила по углам
    ctx.fillStyle = rgba([60, 60, 64], alpha);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(x0 + dx * S, y0 + dy * S, cell * 0.07 * scale, 0, TAU);
      ctx.fill();
    }
  },
};

const rocks = {
  duration: 2400,
  pad: 0.9,
  init(env) {
    const { rand, cell, size } = env;
    const cells = Math.max(1, Math.round(size / cell));
    return {
      rocks: makeParticles(rand, 6 + cells * cells * 3, (r) => ({
        x: env.cx + between(r, -0.45, 0.45) * size,
        y: env.cy + between(r, -0.45, 0.45) * size,
        s: between(r, 0.1, 0.26) * cell,
        delay: between(r, 0.04, 0.5),
        rot: between(r, 0, TAU),
        spin: between(r, -3, 3),
        pts: blobPoints(r, 7, 0.28),
        col: [between(r, 100, 135), between(r, 92, 118), between(r, 80, 100)],
      })).sort((a, b) => a.delay - b.delay),
      grit: makeParticles(rand, 40, (r) => ({
        x: env.cx + between(r, -0.55, 0.55) * size,
        y: env.cy + between(r, -0.55, 0.55) * size,
        delay: between(r, 0, 0.35),
      })),
      clouds: makeParticles(rand, 9, (r) => ({ x: between(r, -0.4, 0.4) * size, y: between(r, -0.4, 0.4) * size, s: between(r, 0.45, 0.8) * env.R })),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const out = 1 - seg(t, 0.85, 1);
    ctx.strokeStyle = rgba([170, 155, 130], 0.6);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.beginPath();
    for (const g of s.grit) {
      const p = seg(t, g.delay, g.delay + 0.12);
      if (p <= 0 || p >= 1) continue;
      const y = g.y - (1 - p) * cell * 0.9;
      ctx.moveTo(g.x, y);
      ctx.lineTo(g.x, y + cell * 0.08);
    }
    ctx.stroke();
    for (const rk of s.rocks) {
      const p = seg(t, rk.delay, rk.delay + 0.16);
      if (p <= 0) continue;
      const fall = inCubic(p);
      // Тень растёт, пока камень летит
      ctx.fillStyle = rgba([0, 0, 0], 0.35 * fall * out);
      ctx.beginPath();
      ctx.ellipse(rk.x + cell * 0.03, rk.y + rk.s * 0.5, rk.s * (0.5 + 0.6 * fall), rk.s * (0.25 + 0.3 * fall), 0, 0, TAU);
      ctx.fill();
      const scale = lerp(2.6, 1, fall);
      const y = rk.y - (1 - fall) * cell * 1.3;
      stone(ctx, rk.x, y, rk.s * scale, rk.pts, rk.rot + rk.spin * p, rk.col, Math.min(1, p * 3) * out);
      const since = seg(t, rk.delay + 0.16, rk.delay + 0.36);
      if (since > 0 && since < 1) dust(ctx, rk.x, rk.y, rk.s * (1.4 + 2 * since), 0.45 * (1 - since));
    }
    const cp = seg(t, 0.25, 1);
    if (cp > 0) for (const c of s.clouds) dust(ctx, cx + c.x, cy + c.y, c.s * (0.6 + 0.6 * cp), 0.3 * fade(t, 0.25, 0.45, 0.7, 1));
  },
};

const boulder = {
  duration: 2200,
  pad: 2,
  init(env) {
    const { rand, cell } = env;
    const a = Math.floor(rand() * 4) * (Math.PI / 2) + between(rand, -0.25, 0.25);
    const rb = Math.min(env.size * 0.42, cell * 1.05);
    const reach = Math.min(env.w, env.h) / 2 + rb;
    return {
      a,
      rb,
      sx: env.cx - Math.cos(a) * reach,
      sy: env.cy - Math.sin(a) * reach,
      ex: env.cx + Math.cos(a) * reach,
      ey: env.cy + Math.sin(a) * reach,
      cracks: makeParticles(rand, 6, (r) => ({ a: between(r, 0, TAU), b: between(r, 0.4, 1.2), r1: between(r, 0.2, 0.7) })),
      trail: makeParticles(rand, 50, (r) => ({ at: r(), off: between(r, -1, 1), s: between(r, 0.4, 0.8) })),
    };
  },
  draw(ctx, t, env, s) {
    const p = inOut(seg(t, 0.02, 0.8)) * 0.85 + seg(t, 0.02, 0.8) * 0.15;
    const x = lerp(s.sx, s.ex, p);
    const y = lerp(s.sy, s.ey, p);
    const dist = Math.hypot(s.ex - s.sx, s.ey - s.sy) * p;
    const rot = dist / s.rb;
    const nx = -Math.sin(s.a);
    const ny = Math.cos(s.a);
    // Пыльный след
    for (const d of s.trail) {
      if (d.at > p) continue;
      const age = (p - d.at) / 0.3;
      if (age >= 1) continue;
      const px = lerp(s.sx, s.ex, d.at) + nx * d.off * s.rb * 0.8;
      const py = lerp(s.sy, s.ey, d.at) + ny * d.off * s.rb * 0.8;
      dust(ctx, px, py, s.rb * d.s * (0.6 + age), 0.32 * (1 - age));
    }
    const alpha = 1 - seg(t, 0.92, 1);
    ctx.fillStyle = rgba([0, 0, 0], 0.35 * alpha);
    ctx.beginPath();
    ctx.ellipse(x + s.rb * 0.15, y + s.rb * 0.2, s.rb * 1.02, s.rb * 0.9, 0, 0, TAU);
    ctx.fill();
    const g = ctx.createRadialGradient(x - s.rb * 0.35, y - s.rb * 0.4, s.rb * 0.1, x, y, s.rb);
    g.addColorStop(0, rgba([176, 166, 150], alpha));
    g.addColorStop(0.6, rgba([112, 104, 92], alpha));
    g.addColorStop(1, rgba([58, 53, 46], alpha));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s.rb, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, s.rb, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = rgba([40, 36, 30], 0.7 * alpha);
    ctx.lineWidth = Math.max(1.5, s.rb * 0.05);
    for (const c of s.cracks) {
      ctx.beginPath();
      ctx.arc(x + Math.cos(c.a + rot) * s.rb * c.r1, y + Math.sin(c.a + rot) * s.rb * c.r1, s.rb * 0.6, c.a + rot, c.a + rot + c.b);
      ctx.stroke();
    }
    ctx.restore();
  },
};

const FIRE = [
  [0, [255, 246, 214]],
  [0.25, [255, 196, 70]],
  [0.55, [240, 98, 24]],
  [1, [110, 26, 8]],
];

const fire = {
  duration: 1800,
  pad: 0.9,
  init(env) {
    const { rand, R, cell } = env;
    const reach = Math.max(R, cell * 0.6);
    return {
      flames: makeParticles(rand, 150, (r) => ({
        delay: between(r, 0, 0.55),
        life: between(r, 0.22, 0.42),
        a: between(r, 0, TAU),
        v: between(r, 0.15, 1.15) * reach,
        s: between(r, 0.14, 0.34) * Math.max(cell, R * 0.8),
        rise: between(r, 0.2, 0.6) * cell,
      })),
      embers: makeParticles(rand, 40, (r) => ({
        delay: between(r, 0.05, 0.6),
        life: between(r, 0.25, 0.4),
        a: between(r, 0, TAU),
        v: between(r, 0.8, 1.6) * reach,
        s: between(r, 0.015, 0.03) * cell,
      })),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, R, cell } = env;
    const reach = Math.max(R, cell * 0.6);
    // Подпалина
    glow(ctx, cx, cy, reach * 1.05, [24, 12, 6], 0.55 * fade(t, 0.15, 0.4, 0.8, 1), 0.3);
    // Дым поверх подпалины
    for (const f of s.flames) {
      const lp = (t - f.delay) / f.life;
      if (lp < 0.45 || lp > 1.6) continue;
      const k = (lp - 0.45) / 1.15;
      const d = f.v * outCubic(Math.min(1, lp));
      glow(ctx, cx + Math.cos(f.a) * d, cy + Math.sin(f.a) * d - f.rise * lp * 1.3, f.s * (1 + k), [55, 48, 44], 0.16 * (1 - k));
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const flash = seg(t, 0, 0.14);
    if (flash < 1) glow(ctx, cx, cy, reach * (0.5 + 1.2 * flash), [255, 220, 160], 0.85 * (1 - flash));
    for (const f of s.flames) {
      const lp = (t - f.delay) / f.life;
      if (lp <= 0 || lp >= 1) continue;
      const d = f.v * outCubic(lp);
      const x = cx + Math.cos(f.a) * d;
      const y = cy + Math.sin(f.a) * d - f.rise * lp;
      glow(ctx, x, y, f.s * (0.7 + 0.6 * lp) * (1 - 0.35 * lp), ramp(FIRE, lp), 0.7 * (1 - lp) ** 1.1);
    }
    for (const e of s.embers) {
      const lp = (t - e.delay) / e.life;
      if (lp <= 0 || lp >= 1) continue;
      const d = e.v * outCubic(lp);
      glow(ctx, cx + Math.cos(e.a) * d, cy + Math.sin(e.a) * d - cell * 0.3 * lp, e.s * 3, [255, 200, 90], 1 - lp);
    }
    ctx.restore();
  },
};

function makeCloud(env, count) {
  const { rand, R, cell } = env;
  const reach = Math.max(R, cell * 0.6);
  return {
    blobs: makeParticles(rand, count, (r) => ({
      a: between(r, 0, TAU),
      d: between(r, 0.1, 1.0) * reach,
      s: between(r, 0.5, 0.9) * reach,
      delay: between(r, 0, 0.35),
      phase: between(r, 0, TAU),
      dark: r() < 0.35,
    })),
    jets: makeParticles(rand, 5, (r) => ({ a: between(r, 0, TAU), d: between(r, 0, 0.3) * reach })),
    bits: makeParticles(rand, 26, (r) => ({
      x: between(r, -0.8, 0.8) * reach,
      y: between(r, -0.8, 0.8) * reach,
      t0: between(r, 0.2, 0.75),
      life: between(r, 0.1, 0.2),
      s: between(r, 0.02, 0.05) * cell,
    })),
  };
}

function drawCloud(ctx, t, env, s, light, dark) {
  const { cx, cy, cell } = env;
  // Струи из отверстий
  const jp = seg(t, 0, 0.3);
  if (jp > 0 && jp < 1) {
    for (const j of s.jets) {
      const x = cx + Math.cos(j.a) * j.d;
      const y = cy + Math.sin(j.a) * j.d;
      for (let k = 0; k < 4; k++) glow(ctx, x, y - cell * 0.15 * k * jp, cell * (0.08 + 0.06 * k), light, 0.45 * (1 - jp));
    }
  }
  for (const b of s.blobs) {
    const p = outCubic(seg(t, b.delay, b.delay + 0.45));
    if (p <= 0) continue;
    const a = 0.34 * seg(t, b.delay, b.delay + 0.15) * (1 - seg(t, 0.7, 1));
    const sw = Math.sin(t * 5 + b.phase) * cell * 0.12;
    const x = cx + Math.cos(b.a) * b.d * p + sw;
    const y = cy + Math.sin(b.a) * b.d * p + Math.cos(t * 4 + b.phase) * cell * 0.08;
    const r = b.s * (0.35 + 0.65 * p);
    const color = b.dark ? dark : light;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.55, rgba(color, a * 0.6));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

const gas = {
  duration: 2800,
  pad: 0.8,
  init: (env) => makeCloud(env, 22),
  draw(ctx, t, env, s) {
    drawCloud(ctx, t, env, s, [150, 214, 70], [70, 128, 34]);
    // Пузырьки яда
    ctx.lineWidth = 1;
    for (const b of s.bits) {
      const p = (t - b.t0) / b.life;
      if (p <= 0 || p >= 1) continue;
      ring(ctx, env.cx + b.x, env.cy + b.y, b.s * (0.5 + p), Math.max(1, b.s * 0.3), [200, 245, 130], 0.8 * (1 - p));
    }
  },
};

const sleep = {
  duration: 2800,
  pad: 0.8,
  init: (env) => makeCloud(env, 20),
  draw(ctx, t, env, s) {
    drawCloud(ctx, t, env, s, [236, 170, 236], [160, 140, 250]);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of s.bits) {
      const p = (t - b.t0) / (b.life * 3);
      if (p <= 0 || p >= 1) continue;
      const x = env.cx + b.x;
      const y = env.cy + b.y - p * env.cell * 0.6;
      const a = Math.sin(p * Math.PI);
      if (b.s > env.cell * 0.035) {
        ctx.fillStyle = rgba([255, 235, 255], a);
        ctx.font = `600 ${Math.round(env.cell * 0.2)}px serif`;
        ctx.fillText("z", x, y);
      } else {
        const r = b.s * 2.2;
        ctx.fillStyle = rgba([255, 240, 255], a);
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y);
        ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

function bolt(rand, x1, y1, x2, y2, jitter, steps) {
  const pts = [[x1, y1]];
  const nx = -(y2 - y1);
  const ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  for (let i = 1; i < steps; i++) {
    const p = i / steps;
    const off = (rand() - 0.5) * 2 * jitter * Math.sin(p * Math.PI);
    pts.push([lerp(x1, x2, p) + (nx / len) * off, lerp(y1, y2, p) + (ny / len) * off]);
  }
  pts.push([x2, y2]);
  return pts;
}

function strokePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

const lightning = {
  duration: 1800,
  pad: 0.9,
  init(env) {
    const { rand } = env;
    return {
      rune: makeRune(rand),
      bolts: makeParticles(rand, 7, (r, i) => ({ a: (i / 7) * TAU + between(r, -0.3, 0.3), d: between(r, 0.85, 1.25) })),
      rays: makeParticles(rand, 14, (r) => between(r, 0, TAU)),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell, seed } = env;
    const color = [140, 190, 255];
    const reach = Math.max(env.R, cell * 0.7);
    drawRune(ctx, env, s.rune, t, color, fade(t, 0, 0.18, 0.6, 0.85));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const at of [0.18, 0.38]) {
      const f = seg(t, at, at + 0.12);
      if (f > 0 && f < 1) glow(ctx, cx, cy, reach * 1.6, [190, 220, 255], 0.6 * (1 - f));
    }
    if (t > 0.16 && t < 0.64) {
      const frame = Math.floor(t * 40);
      const fr = mulberry32(seed * 31 + frame);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const b of s.bolts) {
        if (fr() < 0.35) continue;
        const x2 = cx + Math.cos(b.a) * reach * b.d;
        const y2 = cy + Math.sin(b.a) * reach * b.d;
        const pts = bolt(fr, cx, cy, x2, y2, cell * 0.22, 9);
        for (const [w, a, c] of [[0.13, 0.22, color], [0.05, 0.75, color], [0.018, 1, [255, 255, 255]]]) {
          ctx.strokeStyle = rgba(c, a);
          ctx.lineWidth = Math.max(1, cell * w);
          strokePath(ctx, pts);
        }
        // Ответвление
        const k = 3 + Math.floor(fr() * 4);
        const [bx, by] = pts[k];
        const ba = b.a + (fr() - 0.5) * 1.6;
        const branch = bolt(fr, bx, by, bx + Math.cos(ba) * reach * 0.45, by + Math.sin(ba) * reach * 0.45, cell * 0.1, 5);
        ctx.strokeStyle = rgba(color, 0.7);
        ctx.lineWidth = Math.max(1, cell * 0.02);
        strokePath(ctx, branch);
        glow(ctx, x2, y2, cell * 0.25, color, 0.6);
      }
      glow(ctx, cx, cy, cell * 0.5, [220, 235, 255], 0.8);
    }
    ctx.restore();
    sparks(ctx, cx, cy, seg(t, 0.55, 0.85), s.rays, reach * 0.7, color);
  },
};

const frost = {
  duration: 2000,
  pad: 0.9,
  init(env) {
    const { rand, cell } = env;
    const reach = Math.max(env.R, cell * 0.6);
    return {
      rune: makeRune(rand),
      shards: makeParticles(rand, 20, (r, i) => ({
        a: (i / 20) * TAU + between(r, -0.15, 0.15),
        d: between(r, 0.45, 1.05) * reach,
        len: between(r, 0.22, 0.5) * cell,
        w: between(r, 0.05, 0.09) * cell,
        delay: between(r, 0, 0.05),
      })),
      veins: makeParticles(rand, 16, (r, i) => ({ a: (i / 16) * TAU + between(r, -0.2, 0.2), l: between(r, 0.6, 1.1) * reach })),
      glints: makeParticles(rand, 30, (r) => ({ x: between(r, -1, 1) * reach, y: between(r, -1, 1) * reach, t0: between(r, 0.25, 0.85), s: between(r, 0.03, 0.06) * cell })),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const reach = Math.max(env.R, cell * 0.6);
    const ice = [190, 230, 255];
    drawRune(ctx, env, s.rune, t, [150, 210, 255], fade(t, 0, 0.15, 0.4, 0.6));
    // Иней на полу
    const fp = fade(t, 0.2, 0.4, 0.8, 1);
    glow(ctx, cx, cy, reach * 1.1, [210, 240, 255], 0.38 * fp, 0.2);
    ctx.strokeStyle = rgba([240, 250, 255], 0.6 * fp);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.beginPath();
    for (const v of s.veins) {
      const l = v.l * outCubic(seg(t, 0.2, 0.45));
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(v.a) * l, cy + Math.sin(v.a) * l);
      ctx.moveTo(cx + Math.cos(v.a) * l * 0.6, cy + Math.sin(v.a) * l * 0.6);
      ctx.lineTo(cx + Math.cos(v.a + 0.35) * l * 0.85, cy + Math.sin(v.a + 0.35) * l * 0.85);
    }
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const rp = seg(t, 0.14, 0.48);
    if (rp > 0 && rp < 1) ring(ctx, cx, cy, reach * 1.1 * outCubic(rp), cell * 0.2 * (1 - rp) + 1, ice, 0.8 * (1 - rp));
    ctx.restore();
    const out = 1 - seg(t, 0.84, 1);
    for (const sh of s.shards) {
      const p = outBack(seg(t, 0.16 + sh.delay, 0.34 + sh.delay));
      if (p <= 0) continue;
      const d = sh.d * p;
      const x = cx + Math.cos(sh.a) * d;
      const y = cy + Math.sin(sh.a) * d;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sh.a);
      const g = ctx.createLinearGradient(-sh.len / 2, 0, sh.len / 2, 0);
      g.addColorStop(0, rgba([120, 180, 230], 0.5 * out));
      g.addColorStop(0.6, rgba([225, 245, 255], 0.95 * out));
      g.addColorStop(1, rgba([255, 255, 255], out));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-sh.len / 2, 0);
      ctx.lineTo(0, -sh.w / 2);
      ctx.lineTo(sh.len / 2, 0);
      ctx.lineTo(0, sh.w / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba([255, 255, 255], 0.8 * out);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const g of s.glints) {
      const p = (t - g.t0) / 0.15;
      if (p <= 0 || p >= 1) continue;
      const a = Math.sin(p * Math.PI);
      const x = cx + g.x;
      const y = cy + g.y;
      ctx.strokeStyle = rgba([255, 255, 255], a);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - g.s * 2, y);
      ctx.lineTo(x + g.s * 2, y);
      ctx.moveTo(x, y - g.s * 2);
      ctx.lineTo(x, y + g.s * 2);
      ctx.stroke();
    }
    ctx.restore();
  },
};

const acid = {
  duration: 2200,
  pad: 1.2,
  init(env) {
    const { rand, cell } = env;
    const a = between(rand, 0, TAU);
    const reach = Math.min(env.w, env.h) / 2 - cell * 0.2;
    const pool = Math.max(env.R * 0.8, cell * 0.42);
    return {
      pool,
      drops: makeParticles(rand, 50, (r) => {
        const tx = env.cx + between(r, -0.7, 0.7) * pool;
        const ty = env.cy + between(r, -0.7, 0.7) * pool;
        const aa = a + between(r, -0.18, 0.18);
        return {
          sx: env.cx - Math.cos(aa) * reach,
          sy: env.cy - Math.sin(aa) * reach,
          tx,
          ty,
          delay: between(r, 0, 0.24),
          s: between(r, 0.025, 0.05) * cell,
          arc: between(r, 0.2, 0.5) * cell,
        };
      }),
      edge: blobPoints(rand, 18, 0.18),
      bubbles: makeParticles(rand, 26, (r) => {
        const ang = between(r, 0, TAU);
        const d = Math.sqrt(r()) * pool * 0.75;
        return { x: Math.cos(ang) * d, y: Math.sin(ang) * d, t0: between(r, 0.3, 0.85), life: between(r, 0.06, 0.14), s: between(r, 0.03, 0.07) * cell };
      }),
      fumes: makeParticles(rand, 8, (r) => ({ x: between(r, -0.6, 0.6) * pool, y: between(r, -0.5, 0.5) * pool, delay: between(r, 0.3, 0.6) })),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const green = [150, 225, 40];
    const pp = outCubic(seg(t, 0.18, 0.45));
    const out = 1 - seg(t, 0.84, 1);
    if (pp > 0) {
      const r = s.pool * pp;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgba([120, 190, 20], 0.7 * out));
      g.addColorStop(0.8, rgba([90, 150, 10], 0.55 * out));
      g.addColorStop(1, rgba([60, 100, 5], 0.35 * out));
      ctx.fillStyle = g;
      blobPath(ctx, cx, cy, r, s.edge);
      ctx.fill();
      ctx.strokeStyle = rgba([205, 255, 120], 0.8 * out);
      ctx.lineWidth = Math.max(1.5, cell * 0.025);
      ctx.stroke();
    }
    for (const d of s.drops) {
      const p = seg(t, d.delay, d.delay + 0.2);
      if (p <= 0 || p >= 1) continue;
      const x = lerp(d.sx, d.tx, p);
      const y = lerp(d.sy, d.ty, p) - Math.sin(p * Math.PI) * d.arc;
      glow(ctx, x, y, d.s * 2.2, green, 0.9);
      ctx.fillStyle = rgba([230, 255, 170], 0.9);
      ctx.beginPath();
      ctx.arc(x, y, d.s * 0.7, 0, TAU);
      ctx.fill();
    }
    for (const b of s.bubbles) {
      const p = (t - b.t0) / b.life;
      if (p <= 0 || p >= 1) continue;
      ring(ctx, cx + b.x, cy + b.y, b.s * (0.4 + p), Math.max(1, b.s * 0.35), [220, 255, 150], (1 - p) * out);
    }
    for (const f of s.fumes) {
      const p = seg(t, f.delay, f.delay + 0.4);
      if (p <= 0 || p >= 1) continue;
      glow(ctx, cx + f.x, cy + f.y - p * cell * 0.5, cell * (0.15 + 0.2 * p), [190, 230, 140], 0.25 * Math.sin(p * Math.PI));
    }
  },
};

const thunder = {
  duration: 1700,
  pad: 1.2,
  init(env) {
    const { rand, cell } = env;
    const reach = Math.max(env.R, cell * 0.7);
    return {
      rune: makeRune(rand),
      lines: makeParticles(rand, 26, (r) => ({ a: between(r, 0, TAU), d: between(r, 0.2, 0.5) * reach, l: between(r, 0.2, 0.45) * reach })),
      chips: makeParticles(rand, 22, (r) => ({ a: between(r, 0, TAU), v: between(r, 0.6, 1.3) * reach, s: between(r, 0.03, 0.06) * cell, pts: blobPoints(r, 5, 0.3) })),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const reach = Math.max(env.R, cell * 0.7);
    const color = [205, 222, 255];
    drawRune(ctx, env, s.rune, t, [170, 200, 255], fade(t, 0, 0.1, 0.16, 0.3));
    for (const c of s.chips) {
      const p = seg(t, 0.12, 0.6);
      if (p <= 0 || p >= 1) continue;
      const d = c.v * outCubic(p);
      stone(ctx, cx + Math.cos(c.a) * d, cy + Math.sin(c.a) * d, c.s, c.pts, p * 6, [120, 112, 100], 1 - p);
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const f = seg(t, 0.12, 0.26);
    if (f > 0 && f < 1) glow(ctx, cx, cy, reach * 1.3, [235, 240, 255], 0.8 * (1 - f));
    for (const start of [0.12, 0.2, 0.28]) {
      const p = seg(t, start, start + 0.45);
      if (p <= 0 || p >= 1) continue;
      const r = reach * 1.55 * outCubic(p);
      ring(ctx, cx, cy, r, cell * 0.32 * (1 - p) + 1, color, 0.65 * (1 - p));
      ring(ctx, cx, cy, r * 0.94, cell * 0.08 * (1 - p) + 1, [255, 255, 255], 0.5 * (1 - p));
    }
    const lp = seg(t, 0.12, 0.42);
    if (lp > 0 && lp < 1) {
      ctx.strokeStyle = rgba([255, 255, 255], 0.55 * (1 - lp));
      ctx.lineWidth = Math.max(1, cell * 0.018);
      ctx.beginPath();
      for (const l of s.lines) {
        const d = l.d + reach * 1.1 * outCubic(lp);
        ctx.moveTo(cx + Math.cos(l.a) * d, cy + Math.sin(l.a) * d);
        ctx.lineTo(cx + Math.cos(l.a) * (d + l.l), cy + Math.sin(l.a) * (d + l.l));
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

const necrotic = {
  duration: 2200,
  pad: 1,
  init(env) {
    const { rand, cell } = env;
    const reach = Math.max(env.R, cell * 0.7);
    return {
      rune: makeRune(rand),
      tendrils: makeParticles(rand, 9, (r, i) => ({ a: (i / 9) * TAU + between(r, -0.2, 0.2), w: between(r, 1.5, 3), ph: between(r, 0, TAU), d: between(r, 1.05, 1.35) * reach })),
      motes: makeParticles(rand, 60, (r) => ({ a: between(r, 0, TAU), d: between(r, 0.9, 1.4) * reach, delay: between(r, 0.05, 0.5), life: between(r, 0.15, 0.3), s: between(r, 0.03, 0.07) * cell })),
    };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const reach = Math.max(env.R, cell * 0.7);
    const purple = [168, 80, 230];
    glow(ctx, cx, cy, reach * 1.15, [20, 0, 30], 0.6 * fade(t, 0.05, 0.3, 0.8, 1), 0.25);
    drawRune(ctx, env, s.rune, t, purple, fade(t, 0, 0.15, 0.6, 0.8));
    // Щупальца тянутся к центру
    const grow = outCubic(seg(t, 0.12, 0.45)) * (1 - inCubic(seg(t, 0.58, 0.75)));
    if (grow > 0) {
      ctx.lineCap = "round";
      for (const tn of s.tendrils) {
        const steps = 18;
        const pts = [];
        for (let i = 0; i <= steps * grow; i++) {
          const p = i / steps;
          const d = tn.d * (1 - p * 0.92);
          const a = tn.a + Math.sin(p * tn.w * Math.PI + tn.ph + t * 6) * 0.25 * (1 - p);
          pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
        }
        if (pts.length < 2) continue;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = rgba(purple, 0.35);
        ctx.lineWidth = cell * 0.1;
        strokePath(ctx, pts);
        ctx.restore();
        ctx.strokeStyle = rgba([25, 0, 35], 0.9);
        ctx.lineWidth = cell * 0.035;
        strokePath(ctx, pts);
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const m of s.motes) {
      const p = (t - m.delay) / m.life;
      if (p <= 0 || p >= 1) continue;
      const d = m.d * (1 - inCubic(p));
      glow(ctx, cx + Math.cos(m.a + p) * d, cy + Math.sin(m.a + p) * d, m.s * 2.5, purple, 0.8 * (1 - p));
    }
    const bp = seg(t, 0.6, 0.9);
    if (bp > 0 && bp < 1) {
      ring(ctx, cx, cy, reach * 1.3 * outCubic(bp), cell * 0.25 * (1 - bp) + 1, purple, 0.7 * (1 - bp));
      glow(ctx, cx, cy, reach * 0.9, [200, 120, 255], 0.5 * (1 - bp));
    }
    ctx.restore();
  },
};

const blade = {
  duration: 1800,
  pad: 1.6,
  init(env) {
    const { rand } = env;
    return { rays: makeParticles(rand, 10, (r) => between(r, -Math.PI, 0)), flip: rand() < 0.5 ? 1 : -1 };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const L = cell * 1.6;
    const px = cx;
    const py = cy - L;
    const max = 0.95;
    // Маятник: туда (0.08–0.4) и обратно (0.48–0.8), потом исчезает
    let theta;
    let trailFrom;
    if (t < 0.44) {
      theta = lerp(-max, max, inOut(seg(t, 0.08, 0.4)));
      trailFrom = -max;
    } else {
      theta = lerp(max, -max * 0.6, inOut(seg(t, 0.48, 0.8)));
      trailFrom = max;
    }
    theta *= s.flip;
    trailFrom *= s.flip;
    const alpha = fade(t, 0, 0.06, 0.86, 1);
    // Шлейф взмаха
    const span = theta - trailFrom;
    if (Math.abs(span) > 0.01) {
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const a0 = trailFrom + (span * i) / steps;
        const a1 = trailFrom + (span * (i + 1)) / steps;
        const k = (i + 1) / steps;
        ctx.strokeStyle = rgba([235, 240, 248], 0.32 * k * alpha);
        ctx.lineWidth = cell * 0.26;
        ctx.beginPath();
        ctx.arc(px, py, L, Math.PI / 2 - a0, Math.PI / 2 - a1, span > 0);
        ctx.stroke();
      }
    }
    // Штанга и лезвие
    const bx = px + Math.sin(theta) * L;
    const by = py + Math.cos(theta) * L;
    ctx.strokeStyle = rgba([60, 55, 50], 0.8 * alpha);
    ctx.lineWidth = Math.max(2, cell * 0.04);
    ctx.beginPath();
    ctx.moveTo(lerp(px, bx, 0.45), lerp(py, by, 0.45));
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-theta);
    const w = cell * 0.62;
    const g = ctx.createLinearGradient(0, -cell * 0.1, 0, cell * 0.16);
    g.addColorStop(0, rgba([110, 112, 120], alpha));
    g.addColorStop(0.7, rgba([235, 238, 244], alpha));
    g.addColorStop(1, rgba([255, 255, 255], alpha));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -cell * 0.02);
    ctx.quadraticCurveTo(0, cell * 0.34, w / 2, -cell * 0.02);
    ctx.quadraticCurveTo(0, cell * 0.12, -w / 2, -cell * 0.02);
    ctx.fill();
    ctx.strokeStyle = rgba([40, 40, 45], 0.7 * alpha);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    // Искры и след удара в момент прохода через центр
    for (const [at, dir] of [[0.24, 1], [0.64, -1]]) {
      const p = seg(t, at, at + 0.16);
      if (p > 0 && p < 1) sparks(ctx, cx, cy, p, s.rays.map((a) => a * dir), cell * 0.4, [255, 220, 160]);
    }
    const sl = fade(t, 0.24, 0.3, 0.7, 0.95);
    if (sl > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g2 = ctx.createLinearGradient(cx - cell * 0.4, cy, cx + cell * 0.4, cy);
      g2.addColorStop(0, "rgba(255,80,60,0)");
      g2.addColorStop(0.5, rgba([255, 120, 100], 0.7 * sl));
      g2.addColorStop(1, "rgba(255,80,60,0)");
      ctx.strokeStyle = g2;
      ctx.lineWidth = cell * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx - cell * 0.4, cy - cell * 0.12 * s.flip);
      ctx.lineTo(cx + cell * 0.4, cy + cell * 0.12 * s.flip);
      ctx.stroke();
      ctx.restore();
    }
  },
};

const alarm = {
  duration: 2000,
  pad: 1,
  init: () => ({}),
  draw(ctx, t, env) {
    const { cx, cy, cell } = env;
    const reach = Math.max(env.R, cell * 0.6);
    const red = [255, 70, 55];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const start of [0, 0.25, 0.5]) {
      const p = seg(t, start, start + 0.45);
      if (p <= 0 || p >= 1) continue;
      ring(ctx, cx, cy, reach * (0.3 + 1.4 * outCubic(p)), cell * 0.12 * (1 - p) + 1, red, 0.85 * (1 - p));
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 8);
    const a = fade(t, 0, 0.08, 0.82, 1);
    glow(ctx, cx, cy, cell * 0.6, red, (0.35 + 0.3 * pulse) * a);
    ctx.restore();
    const bob = Math.sin(t * Math.PI * 6) * cell * 0.03;
    ctx.save();
    ctx.font = `900 ${Math.round(cell * 0.55)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = rgba(red, a);
    ctx.shadowBlur = cell * 0.25;
    ctx.fillStyle = rgba([255, 235, 225], a);
    ctx.fillText("!", cx, cy + bob);
    ctx.restore();
  },
};

/** Запасной эффект: вспышка и кольцо заданного цвета. */
const burst = {
  duration: 1400,
  pad: 0.8,
  init(env) {
    const { rand, cell } = env;
    return { rays: makeParticles(rand, 16, (r) => between(r, 0, TAU)), parts: makeParticles(rand, 40, (r) => ({ a: between(r, 0, TAU), v: between(r, 0.4, 1.2), s: between(r, 0.04, 0.1) * cell })) };
  },
  draw(ctx, t, env, s) {
    const { cx, cy, cell } = env;
    const color = env.color ?? [255, 200, 120];
    const reach = Math.max(env.R, cell * 0.6);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const f = seg(t, 0, 0.3);
    glow(ctx, cx, cy, reach * (0.6 + f), color, 0.8 * (1 - f));
    const p = seg(t, 0.05, 0.7);
    if (p > 0 && p < 1) ring(ctx, cx, cy, reach * 1.2 * outCubic(p), cell * 0.18 * (1 - p) + 1, color, 0.8 * (1 - p));
    for (const q of s.parts) {
      const lp = seg(t, 0.05, 0.85);
      if (lp <= 0 || lp >= 1) continue;
      const d = q.v * reach * outCubic(lp);
      glow(ctx, cx + Math.cos(q.a) * d, cy + Math.sin(q.a) * d, q.s * 2, color, 1 - lp);
    }
    ctx.restore();
  },
};

export const PAINTERS = { pit, spikes, jaws, darts, arrows, net, rocks, boulder, fire, gas, sleep, lightning, frost, acid, thunder, necrotic, blade, alarm, burst };

/**
 * Готовый к показу эффект.
 * area — сторона области в px, cell — клетка в px. → { duration, pad, side, frame(ctx, t) }
 * side — сторона холста (область + поля), центр области — в центре холста.
 */
export function createEffect(name, { area, cell, seed = 1, color } = {}) {
  const painter = PAINTERS[name] ?? PAINTERS.burst;
  const side = Math.ceil(area + painter.pad * 2 * cell);
  const env = {
    w: side,
    h: side,
    cx: side / 2,
    cy: side / 2,
    cell,
    size: area,
    R: area / 2,
    seed,
    color,
    rand: mulberry32(seed),
  };
  const state = painter.init(env);
  return {
    name: PAINTERS[name] ? name : "burst",
    duration: painter.duration,
    side,
    frame(ctx, t) {
      ctx.save();
      painter.draw(ctx, Math.max(0, Math.min(1, t)), env, state);
      ctx.restore();
    },
  };
}

export const EFFECT_NAMES = Object.keys(PAINTERS);

/** Кисти для неподвижных рисунков ловушек (core/tells.mjs): та же манера, что у анимаций. */
export { between, blobPath, blobPoints, clamp01, drawRune, dust, glow, lerp, makeRune, mix, projectile, rgba, ring, stone };
