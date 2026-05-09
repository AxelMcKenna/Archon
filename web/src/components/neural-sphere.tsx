"use client";

import { useEffect, useRef } from "react";

type Node = {
  x: number;
  y: number;
  z: number;
  phase: number;
  freq: number;
  amp: number;
  sizeMul: number;
  alphaMul: number;
  ox: number;
  oy: number;
};

type Edge = { a: number; b: number };

export type SphereSize = "sm" | "md" | "lg" | "hero";
export type SphereIntent = "calm" | "active" | "alert" | "thinking";

export interface NeuralSphereProps {
  className?: string;
  size?: SphereSize;
  intent?: SphereIntent;
  badge?: number;
  onClick?: () => void;
  ariaLabel?: string;
}

const SIZE_PX: Record<SphereSize, number> = {
  sm: 36,
  md: 56,
  lg: 120,
  hero: 0, // 0 = fill container
};

const NODE_COUNT_BY_SIZE: Record<SphereSize, number> = {
  sm: 160,
  md: 240,
  lg: 360,
  hero: 520,
};

const EDGE_NEIGHBORS = 2;

interface IntentParams {
  spin: number;            // base radians/sec
  breathBoost: number;     // multiplier on per-node breath amp
  edgeAlphaBoost: number;  // additive on edge alpha
  ink: [number, number, number];
  pulse: number;           // 0–1, drives global outward shimmer
}

function paramsForIntent(intent: SphereIntent): IntentParams {
  switch (intent) {
    case "active":
      return { spin: 0.32, breathBoost: 1.4, edgeAlphaBoost: 0.04, ink: [11, 14, 20], pulse: 0.25 };
    case "alert":
      // desaturated brand-warning red — same ink density, just hue shift
      return { spin: 0.22, breathBoost: 1.6, edgeAlphaBoost: 0.06, ink: [180, 50, 50], pulse: 0.5 };
    case "thinking":
      return { spin: 0.5, breathBoost: 2.2, edgeAlphaBoost: 0.12, ink: [11, 14, 20], pulse: 0.9 };
    case "calm":
    default:
      return { spin: 0.14, breathBoost: 1, edgeAlphaBoost: 0, ink: [11, 14, 20], pulse: 0 };
  }
}

function buildEdges(nodes: Node[], k: number): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dz = nodes[i].z - nodes[j].z;
      dists.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let m = 0; m < k; m++) {
      const j = dists[m].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: i, b: j });
    }
  }
  return edges;
}

function fibonacciSphere(n: number): Node[] {
  const nodes: Node[] = [];
  const phi = Math.PI * (Math.sqrt(5) - 1);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    const jitterTheta = (Math.random() - 0.5) * 0.18;
    const jitterY = (Math.random() - 0.5) * 0.06;
    const yj = Math.max(-1, Math.min(1, y + jitterY));
    const rj = Math.sqrt(1 - yj * yj);
    const th = theta + jitterTheta;
    const sizeRoll = Math.random();
    const sizeMul = 0.55 + Math.pow(sizeRoll, 2.2) * 1.7;
    nodes.push({
      x: Math.cos(th) * rj,
      y: yj,
      z: Math.sin(th) * rj,
      phase: Math.random() * Math.PI * 2,
      freq: 0.6 + Math.random() * 1.2,
      amp: 0.012 + Math.random() * 0.02,
      sizeMul,
      alphaMul: 0.55 + Math.random() * 0.5,
      ox: 0,
      oy: 0,
    });
  }
  return nodes;
}

export function NeuralSphere({
  className,
  size = "hero",
  intent = "calm",
  badge,
  onClick,
  ariaLabel,
}: NeuralSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0, active: false });
  // Refs avoid re-creating the RAF loop when intent changes — fluid swap.
  const intentRef = useRef<SphereIntent>(intent);
  intentRef.current = intent;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodeCount = NODE_COUNT_BY_SIZE[size];
    const nodes = fibonacciSphere(nodeCount);
    const edges = buildEdges(nodes, EDGE_NEIGHBORS);

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = r.width;
      h = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      pointer.current.x = e.clientX - r.left;
      pointer.current.y = e.clientY - r.top;
      pointer.current.active = true;
    };
    const onLeave = () => {
      pointer.current.active = false;
    };
    window.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);

    const rotX = -0.22;
    let rotY = 0;
    let raf = 0;
    let last = performance.now();
    // Smoothed intent params so changes ease rather than snap.
    const live: IntentParams = { ...paramsForIntent(intentRef.current) };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const render = (now: number) => {
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      const target = paramsForIntent(intentRef.current);
      const k = 1 - Math.pow(0.04, dt);
      live.spin = lerp(live.spin, target.spin, k);
      live.breathBoost = lerp(live.breathBoost, target.breathBoost, k);
      live.edgeAlphaBoost = lerp(live.edgeAlphaBoost, target.edgeAlphaBoost, k);
      live.pulse = lerp(live.pulse, target.pulse, k);
      live.ink[0] = lerp(live.ink[0], target.ink[0], k);
      live.ink[1] = lerp(live.ink[1], target.ink[1], k);
      live.ink[2] = lerp(live.ink[2], target.ink[2], k);

      rotY += live.spin * dt;

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.56;

      ctx.clearRect(0, 0, w, h);

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const mx = pointer.current.x;
      const my = pointer.current.y;
      const active = pointer.current.active;
      const INFLUENCE = Math.min(w, h) * 0.28;
      const PULL =
        32 * (size === "hero" ? 1 : size === "lg" ? 0.7 : 0.4);
      const ease = 1 - Math.pow(0.08, dt);

      // Global pulse: outward shimmer that breathes with intent
      const pulseT = (Math.sin(now * 0.0035) * 0.5 + 0.5) * live.pulse;

      const proj: {
        sx: number;
        sy: number;
        depth: number;
        lift: number;
        sizeMul: number;
        alphaMul: number;
      }[] = new Array(nodes.length);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const breath =
          1 + Math.sin(now * 0.001 * n.freq + n.phase) * n.amp * live.breathBoost +
          pulseT * 0.04;
        const x = n.x * breath;
        const y = n.y * breath;
        const z = n.z * breath;
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const persp = 1 / (1.6 - z2 * 0.6);
        const baseSx = cx + x1 * radius * persp;
        const baseSy = cy + y2 * radius * persp;

        let tx = 0;
        let ty = 0;
        let lift = 0;
        if (active) {
          const dx = mx - baseSx;
          const dy = my - baseSy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < INFLUENCE && d > 0.01) {
            const f = 1 - d / INFLUENCE;
            const fall = f * f * (3 - 2 * f);
            const mag = PULL * fall;
            tx = (dx / d) * mag;
            ty = (dy / d) * mag;
            lift = fall;
          }
        }

        n.ox += (tx - n.ox) * ease;
        n.oy += (ty - n.oy) * ease;

        proj[i] = {
          sx: baseSx + n.ox,
          sy: baseSy + n.oy,
          depth: z2,
          lift,
          sizeMul: n.sizeMul,
          alphaMul: n.alphaMul,
        };
      }

      const inkR = Math.round(live.ink[0]);
      const inkG = Math.round(live.ink[1]);
      const inkB = Math.round(live.ink[2]);

      ctx.lineWidth = size === "hero" ? 0.5 : 0.4;
      for (const e of edges) {
        const a = proj[e.a];
        const b = proj[e.b];
        const meanZ = (a.depth + b.depth) / 2;
        const t = (meanZ + 1) / 2;
        const alpha = 0.04 + t * 0.16 + live.edgeAlphaBoost;
        ctx.strokeStyle = `rgba(${inkR}, ${inkG}, ${inkB}, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      const order = proj
        .map((p, i) => ({ p, i }))
        .sort((a, b) => a.p.depth - b.p.depth);
      ctx.fillStyle = `rgba(${inkR}, ${inkG}, ${inkB}, 1)`;
      const sizeScale = size === "sm" ? 0.55 : size === "md" ? 0.7 : size === "lg" ? 0.95 : 1;
      for (const { p } of order) {
        const t = (p.depth + 1) / 2;
        const r = ((0.7 + t * 1.6) * p.sizeMul + p.lift * 1.6 + pulseT * 0.6) * sizeScale;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, [size]);

  const px = SIZE_PX[size];
  const isHero = size === "hero";
  const interactive = !!onClick;

  const sphereInner = (
    <>
      <div ref={wrapRef} className={isHero ? "h-full w-full" : "absolute inset-0"} aria-hidden>
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
      {badge !== undefined && badge > 0 && (
        <span
          className="pointer-events-none absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm"
          aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </>
  );

  if (isHero) {
    return (
      <div className={className} aria-hidden={!ariaLabel} aria-label={ariaLabel}>
        <div ref={wrapRef} className="h-full w-full">
          <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
      </div>
    );
  }

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? "Ask the project assistant"}
        className={
          (className ?? "") +
          " relative inline-flex shrink-0 items-center justify-center rounded-full transition hover:scale-[1.06] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        }
        style={{ width: px, height: px }}
      >
        {sphereInner}
      </button>
    );
  }

  return (
    <span
      className={(className ?? "") + " relative inline-flex shrink-0"}
      style={{ width: px, height: px }}
      aria-hidden
    >
      {sphereInner}
    </span>
  );
}
