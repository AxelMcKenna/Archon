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
  /**
   * Bump this number to kick off a "contort" reaction — pairs with `sustain`
   * to keep the deformation held until released. Useful as a visual ack when
   * a user prompt is sent.
   */
  excite?: number;
  /**
   * While true, the contortion stays held at full intensity. Flip to false to
   * let it decay back to rest. Typically wired to a `pending` flag so the
   * sphere stays distorted until the response finishes streaming.
   */
  sustain?: boolean;
  /**
   * Cuts node count and visual size for hero-fill instances embedded in
   * smaller surfaces (e.g. side panels). Has no effect on fixed-size variants.
   */
  compact?: boolean;
}

const SIZE_PX: Record<SphereSize, number> = {
  sm: 36,
  md: 56,
  lg: 120,
  hero: 0, // 0 = fill container
};

const NODE_COUNT_BY_SIZE: Record<SphereSize, number> = {
  sm: 110,
  md: 150,
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
  wave: number;            // 0–1, drives scanning wave intensity
}

function paramsForIntent(intent: SphereIntent): IntentParams {
  switch (intent) {
    case "active":
      return { spin: 0.32, breathBoost: 1.4, edgeAlphaBoost: 0.04, ink: [11, 14, 20], pulse: 0.25, wave: 0 };
    case "alert":
      // desaturated brand-warning red — same ink density, just hue shift
      return { spin: 0.22, breathBoost: 1.6, edgeAlphaBoost: 0.06, ink: [180, 50, 50], pulse: 0.5, wave: 0 };
    case "thinking":
      return { spin: 0.12, breathBoost: 1.4, edgeAlphaBoost: 0.06, ink: [11, 14, 20], pulse: 0.35, wave: 1 };
    case "calm":
    default:
      return { spin: 0.14, breathBoost: 1, edgeAlphaBoost: 0, ink: [11, 14, 20], pulse: 0, wave: 0 };
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
  excite,
  sustain,
  compact,
}: NeuralSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0, active: false });
  // Refs avoid re-creating the RAF loop when intent changes — fluid swap.
  const intentRef = useRef<SphereIntent>(intent);
  intentRef.current = intent;
  const exciteSeenRef = useRef<number | undefined>(excite);
  const sustainRef = useRef<boolean>(!!sustain);
  sustainRef.current = !!sustain;
  // Smoothed envelope (0..1). Lerps toward 1 when sustained or kicked, toward
  // 0 once released. Read inside the render loop.
  const exciteLevelRef = useRef<number>(0);
  const forceStrikeRef = useRef<boolean>(false);

  useEffect(() => {
    if (excite === undefined) return;
    if (exciteSeenRef.current === excite) return;
    exciteSeenRef.current = excite;
    // No snap — let the render-loop lerp ramp the envelope up smoothly.
    // Just trigger an immediate lightning strike for the visual ack.
    forceStrikeRef.current = true;
  }, [excite]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodeCount =
      compact && size === "hero" ? 300 : NODE_COUNT_BY_SIZE[size];
    const nodes = fibonacciSphere(nodeCount);
    const edges = buildEdges(nodes, EDGE_NEIGHBORS);

    // Richer neighbor map for lightning random-walks (more branching options
    // than the visible edge graph, which only connects 2 nearest neighbors).
    const CHAIN_K = 6;
    const chainNeighbors: number[][] = new Array(nodes.length);
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
      chainNeighbors[i] = dists.slice(0, CHAIN_K).map((x) => x.j);
    }

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

    // Lightning-strike state: each strike picks a random start node and
    // random-walks neighbours to form a chain; nodes light in sequence.
    let nextStrikeAt = performance.now() + 600;
    let strikeStart = -1;
    let strikeChain: number[] = [];
    let strikeIntensity = 1;
    const STRIKE_DUR = 950;

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
      live.wave = lerp(live.wave, target.wave, k);
      live.ink[0] = lerp(live.ink[0], target.ink[0], k);
      live.ink[1] = lerp(live.ink[1], target.ink[1], k);
      live.ink[2] = lerp(live.ink[2], target.ink[2], k);

      // Sustained excitation envelope: ramp up fast, hold while sustained,
      // ease down once released. Independent rates so the kick feels punchy
      // and the release feels relaxed.
      const exTarget = sustainRef.current ? 1 : 0;
      const exCur = exciteLevelRef.current;
      const exRate = exTarget > exCur ? 3.5 : 0.9; // up: ~0.3s, down: ~1.1s
      exciteLevelRef.current =
        exCur + (exTarget - exCur) * (1 - Math.exp(-exRate * dt));
      const exciteEnv = exciteLevelRef.current;

      rotY += (live.spin + exciteEnv * 0.35) * dt;

      const cx = w / 2;
      const cy = h / 2;
      // Base radius shrinks while excited so the bulged side has room to
      // reach out without clipping the canvas edge.
      // Tighter base radius leaves padding around the canvas; shrinks a bit
      // more during excitation to keep bulges off the edge.
      const radius = Math.min(w, h) * (0.42 - exciteEnv * 0.06);

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
      const pulseT =
        (Math.sin(now * 0.0035) * 0.5 + 0.5) * live.pulse + exciteEnv * 0.6;
      // Asymmetric warp: a slowly drifting "yank" direction pulls one side
      // outward. Cheap to compute (4 trig calls per frame, none per-node).
      const yt = now * 0.00018;
      const yankDx = Math.cos(yt) * Math.cos(yt * 0.7);
      const yankDy = Math.sin(yt * 1.3) * 0.6;
      const yankDz = Math.sin(yt) * Math.cos(yt * 0.5);
      const yankLen =
        Math.sqrt(yankDx * yankDx + yankDy * yankDy + yankDz * yankDz) || 1;
      const ydx = yankDx / yankLen;
      const ydy = yankDy / yankLen;
      const ydz = yankDz / yankLen;

      // Force an immediate lightning strike on excitation, even if the current
      // intent is "calm" and waves are otherwise dormant.
      if (forceStrikeRef.current && strikeStart < 0) {
        forceStrikeRef.current = false;
        nextStrikeAt = now;
      }
      // Lightning strike: build a random chain through the neighbour graph,
      // then light each chain node in sequence over STRIKE_DUR.
      if ((live.wave > 0.05 || exciteEnv > 0.05) && strikeStart < 0 && now >= nextStrikeAt) {
        const len = 20 + Math.floor(Math.random() * 9); // 20–28 hops
        const chain: number[] = [Math.floor(Math.random() * nodes.length)];
        const visited = new Set<number>(chain);
        while (chain.length < len) {
          const cur = chain[chain.length - 1];
          const opts = chainNeighbors[cur].filter((j) => !visited.has(j));
          if (opts.length === 0) break;
          const next = opts[Math.floor(Math.random() * opts.length)];
          chain.push(next);
          visited.add(next);
        }
        strikeChain = chain;
        strikeStart = now;
        strikeIntensity = 0.9 + Math.random() * 0.5;
        nextStrikeAt = now + 1200 + Math.random() * 2200;
      }
      let strikeT = -1;
      let strikeFlicker = 1;
      if (strikeStart > 0) {
        const t = (now - strikeStart) / STRIKE_DUR;
        if (t > 1) {
          strikeStart = -1;
          strikeChain = [];
        } else {
          strikeT = t;
          strikeFlicker = 0.78 + 0.22 * Math.sin(now * 0.22);
        }
      }
      // Per-node lightning intensity, indexed sparsely via the chain only.
      const nodeStrike = new Float32Array(nodes.length);
      if (strikeT >= 0 && strikeChain.length > 1) {
        const head = strikeT * (strikeChain.length - 1);
        // sigma in chain-index units controls how sharp the leading flash is.
        const SIGMA = 0.7;
        const tail = 2.4; // exponential decay behind the leading edge
        for (let k = 0; k < strikeChain.length; k++) {
          const d = head - k;
          let env: number;
          if (d < 0) {
            // not yet reached
            env = Math.exp(-(d * d) / (SIGMA * SIGMA));
          } else {
            // reached: bright spark, decaying tail
            env = Math.exp(-d * tail);
          }
          nodeStrike[strikeChain[k]] =
            env * strikeFlicker * strikeIntensity * Math.max(live.wave, exciteEnv);
        }
      }

      const proj: {
        sx: number;
        sy: number;
        depth: number;
        lift: number;
        sizeMul: number;
        alphaMul: number;
        wave: number;
      }[] = new Array(nodes.length);

      // When excitation is essentially off, skip the asymmetric warp work
      // entirely — saves several trig/multiply ops per node per frame.
      const warpActive = exciteEnv > 0.01;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let breath =
          1 +
          Math.sin(now * 0.001 * n.freq + n.phase) * n.amp * live.breathBoost +
          pulseT * 0.04;
        let x: number;
        let y: number;
        let z: number;
        if (warpActive) {
          // Directional yank: nodes whose normal aligns with the yank
          // direction get pulled outward; the opposite side gets a small
          // inward pinch. One side reaches out, the other tucks in.
          const yDot = n.x * ydx + n.y * ydy + n.z * ydz;
          const yPos = yDot > 0 ? yDot : 0;
          const yankShape = yPos * yPos * 1.0 - (yDot < 0 ? -yDot : 0) * 0.18;
          // Cheap lobed pinch via dot-product folded into yPos² — avoids the
          // per-node Math.cos. Subtle but enough silhouette movement.
          const radial =
            breath + exciteEnv * yankShape * 0.32 + exciteEnv * 0.05;
          const reach = exciteEnv * 0.08 * yPos;
          x = n.x * radial + ydx * reach;
          y = n.y * radial + ydy * reach;
          z = n.z * radial + ydz * reach;
        } else {
          x = n.x * breath;
          y = n.y * breath;
          z = n.z * breath;
        }
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

        const waveK = nodeStrike[i];

        proj[i] = {
          sx: baseSx + n.ox,
          sy: baseSy + n.oy,
          depth: z2,
          lift,
          sizeMul: n.sizeMul,
          alphaMul: n.alphaMul,
          wave: waveK,
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
        const meanWave = (a.wave + b.wave) / 2;
        const alpha = 0.04 + t * 0.16 + live.edgeAlphaBoost + meanWave * 0.7;
        ctx.strokeStyle = `rgba(${inkR}, ${inkG}, ${inkB}, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      // Draw the lightning bolt itself: segments along the chain, brightness
      // following the leading flash so the arc forms then fades.
      if (strikeT >= 0 && strikeChain.length > 1) {
        ctx.lineWidth = size === "sm" ? 0.6 : size === "md" ? 0.8 : 1.1;
        for (let k = 0; k < strikeChain.length - 1; k++) {
          const a = proj[strikeChain[k]];
          const b = proj[strikeChain[k + 1]];
          const sa = nodeStrike[strikeChain[k]];
          const sb = nodeStrike[strikeChain[k + 1]];
          const segEnv = Math.max(sa, sb);
          if (segEnv < 0.02) continue;
          ctx.strokeStyle = `rgba(${inkR}, ${inkG}, ${inkB}, ${Math.min(0.85, segEnv * 0.95)})`;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
        }
      }

      const order = proj
        .map((p, i) => ({ p, i }))
        .sort((a, b) => a.p.depth - b.p.depth);
      ctx.fillStyle = `rgba(${inkR}, ${inkG}, ${inkB}, 1)`;
      const heroScale = compact ? 0.72 : 1.1;
      const sizeScale = (size === "sm" ? 0.4 : size === "md" ? 0.5 : size === "lg" ? 0.7 : heroScale);
      // Cap the largest nodes in the small variant so they don't dominate the
      // tiny canvas. fibonacciSphere skews sizeMul up to ~2.25; clamp to 1.3
      // for "sm" so the biggest particles read as accents, not blobs.
      const heroMaxMul = compact ? 1.4 : 2.0;
      const maxSizeMul = size === "sm" ? 0.85 : size === "md" ? 1 : size === "lg" ? 1.15 : heroMaxMul;
      for (const { p } of order) {
        const t = (p.depth + 1) / 2;
        const sm = Math.min(p.sizeMul, maxSizeMul);
        const rRaw =
          ((0.55 + t * 1.3) * sm + p.lift * 1.4 + pulseT * 0.5 + p.wave * 2.8) *
          sizeScale;
        // Clamp to avoid IndexSizeError if a warped node lands at extreme
        // depth and pushes the size term negative.
        const r = rRaw > 0 ? rRaw : 0;
        if (r === 0) continue;
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
  }, [size, compact]);

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
