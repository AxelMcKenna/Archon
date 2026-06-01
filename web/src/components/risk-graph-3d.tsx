"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type RiskGraphDimension = {
  name: string;
  level: RiskLevel;
  score: number;
  summary: string;
  factors: string[];
  mitigations: string[];
};

type Node = {
  x: number;
  y: number;
  z: number;
  phase: number;
  freq: number;
  amp: number;
  sizeMul: number;
  alphaMul: number;
  riskIndex: number;
  factorIndex: number | null;
  anchor: boolean;
  ox: number;
  oy: number;
};

type Edge = { a: number; b: number; primary: boolean };

type HoveredNode = {
  key: string;
  x: number;
  y: number;
  title: string;
  level: RiskLevel;
};

const EDGE_NEIGHBORS = 2;
const SUPPORT_NODES_PER_RISK = 7;

const LEVEL_INK: Record<RiskLevel, [number, number, number]> = {
  LOW: [18, 125, 80],
  MEDIUM: [176, 102, 24],
  HIGH: [190, 75, 28],
  VERY_HIGH: [178, 43, 43],
};

const LEVEL_LABEL: Record<RiskLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  VERY_HIGH: "Very high",
};

export function RiskGraph3D({
  risks,
  className,
}: {
  risks: RiskGraphDimension[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0, active: false });
  const hoveredKey = useRef<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null);
  const graph = useMemo(() => buildRiskSphere(risks), [risks]);
  const overall = risks[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || graph.nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = graph.nodes.map((node) => ({ ...node }));
    const edges = graph.edges;
    const overallLevel = overall?.level ?? "LOW";
    const intent = paramsForLevel(overallLevel);

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let rotY = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      pointer.current.x = event.clientX - rect.left;
      pointer.current.y = event.clientY - rect.top;
      pointer.current.active = true;
    };

    const onLeave = () => {
      pointer.current.active = false;
      hoveredKey.current = null;
      setHoveredNode(null);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);

    const render = (now: number) => {
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      rotY += intent.spin * dt;

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.48;
      const rotX = -0.22;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const pulseT = (Math.sin(now * 0.0035) * 0.5 + 0.5) * intent.pulse;
      const mx = pointer.current.x;
      const my = pointer.current.y;
      const active = pointer.current.active;
      const influence = Math.min(w, h) * 0.28;
      const pull = 26;
      const ease = 1 - Math.pow(0.08, dt);

      ctx.clearRect(0, 0, w, h);

      const proj: {
        sx: number;
        sy: number;
        depth: number;
        lift: number;
        sizeMul: number;
        alphaMul: number;
        riskIndex: number;
        factorIndex: number | null;
        anchor: boolean;
        radius: number;
      }[] = new Array(nodes.length);

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const breath =
          1 +
          Math.sin(now * 0.001 * node.freq + node.phase) * node.amp * intent.breathBoost +
          pulseT * 0.04;
        const x = node.x * breath;
        const y = node.y * breath;
        const z = node.z * breath;
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
          if (d < influence && d > 0.01) {
            const f = 1 - d / influence;
            const fall = f * f * (3 - 2 * f);
            tx = (dx / d) * pull * fall;
            ty = (dy / d) * pull * fall;
            lift = fall;
          }
        }

        node.ox += (tx - node.ox) * ease;
        node.oy += (ty - node.oy) * ease;

        proj[i] = {
          sx: baseSx + node.ox,
          sy: baseSy + node.oy,
          depth: z2,
          lift,
          sizeMul: node.sizeMul,
          alphaMul: node.alphaMul,
          riskIndex: node.riskIndex,
          factorIndex: node.factorIndex,
          anchor: node.anchor,
          radius: 0,
        };
      }

      drawEdges(ctx, edges, proj, risks, intent.edgeAlphaBoost);
      drawNodes(ctx, proj, risks, pulseT);
      updateHover(proj, risks, pointer.current, hoveredKey, setHoveredNode);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, [graph, overall?.level, risks]);

  return (
    <div className={"relative h-full overflow-hidden rounded-sm bg-surface-raised p-6 shadow-depth " + (className ?? "")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink-900">Risk Graph</h2>
          {overall && (
            <p className="mt-1 text-xs text-ink-500">
              {LEVEL_LABEL[overall.level]} overall - {Math.round(overall.score)}
            </p>
          )}
        </div>
        {overall && (
          <span
            className="rounded-sm px-2 py-0.5 text-[11px] font-semibold tracking-wide"
            style={{
              backgroundColor: `rgba(${LEVEL_INK[overall.level].join(", ")}, 0.12)`,
              color: rgb(LEVEL_INK[overall.level]),
            }}
          >
            {overall.level}
          </span>
        )}
      </div>
      <div ref={wrapRef} className="relative mt-3 h-[230px] min-h-[220px] cursor-crosshair">
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          aria-label="Three-dimensional project risk graph"
        />
        {hoveredNode && (
          <div
            className="pointer-events-none absolute z-10 rounded-sm border border-ink-200/70 bg-white/95 px-2.5 py-1.5 text-xs shadow-depth backdrop-blur"
            style={{
              left: `${hoveredNode.x}px`,
              top: `${hoveredNode.y}px`,
              transform:
                hoveredNode.x > 170
                  ? "translate(calc(-100% - 12px), -50%)"
                  : "translate(12px, -50%)",
            }}
          >
            <p className="whitespace-nowrap font-medium text-ink-900">
              {hoveredNode.title}
            </p>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-500">
        <span className="h-1 w-1 rounded-full bg-accent" />
        powered by archon
      </div>
    </div>
  );
}

function paramsForLevel(level: RiskLevel) {
  if (level === "VERY_HIGH") {
    return { spin: 0.24, breathBoost: 1.65, edgeAlphaBoost: 0.055, pulse: 0.62 };
  }
  if (level === "HIGH") {
    return { spin: 0.21, breathBoost: 1.45, edgeAlphaBoost: 0.04, pulse: 0.46 };
  }
  if (level === "MEDIUM") {
    return { spin: 0.18, breathBoost: 1.22, edgeAlphaBoost: 0.025, pulse: 0.28 };
  }
  return { spin: 0.14, breathBoost: 1, edgeAlphaBoost: 0, pulse: 0.14 };
}

function buildRiskSphere(risks: RiskGraphDimension[]) {
  const nodes: Node[] = [];
  const anchors: number[] = [];
  const riskCount = Math.max(risks.length, 1);

  risks.forEach((risk, index) => {
    const anchor = spherePoint(index, riskCount);
    const anchorIndex = nodes.push({
      ...anchor,
      phase: seeded(index, 1) * Math.PI * 2,
      freq: 0.58 + seeded(index, 2) * 1.1,
      amp: 0.012 + seeded(index, 3) * 0.018,
      sizeMul: 1.65 + risk.score / 55,
      alphaMul: 0.78 + seeded(index, 4) * 0.32,
      riskIndex: index,
      factorIndex: null,
      anchor: true,
      ox: 0,
      oy: 0,
    }) - 1;
    anchors.push(anchorIndex);

    const supportCount = index === 0 ? 4 : SUPPORT_NODES_PER_RISK;
    for (let i = 0; i < supportCount; i++) {
      const seed = index * 23 + i * 7;
      const theta = seeded(seed, 1) * Math.PI * 2;
      const phi = Math.acos(2 * seeded(seed, 2) - 1);
      const spread = index === 0 ? 0.2 : 0.32;
      const x = anchor.x + Math.sin(phi) * Math.cos(theta) * spread;
      const y = anchor.y + Math.cos(phi) * spread;
      const z = anchor.z + Math.sin(phi) * Math.sin(theta) * spread;
      const normalized = normalize(x, y, z);
      nodes.push({
        ...normalized,
        phase: seeded(seed, 3) * Math.PI * 2,
        freq: 0.62 + seeded(seed, 4) * 1.2,
        amp: 0.01 + seeded(seed, 5) * 0.018,
        sizeMul: 0.62 + seeded(seed, 6) * 1.2 + risk.score / 140,
        alphaMul: 0.46 + seeded(seed, 7) * 0.46,
        riskIndex: index,
        factorIndex: risk.factors.length > 0 ? i % risk.factors.length : null,
        anchor: false,
        ox: 0,
        oy: 0,
      });
    }
  });

  const edges = buildEdges(nodes, anchors);
  return { nodes, edges };
}

function buildEdges(nodes: Node[], anchors: number[]): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < anchors.length; i++) {
    addEdge(edges, seen, anchors[0], anchors[i], true);
  }

  for (let i = 0; i < nodes.length; i++) {
    const distances: { j: number; d: number }[] = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j || nodes[i].riskIndex !== nodes[j].riskIndex) continue;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dz = nodes[i].z - nodes[j].z;
      distances.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    distances.sort((a, b) => a.d - b.d);
    for (let n = 0; n < Math.min(EDGE_NEIGHBORS, distances.length); n++) {
      addEdge(edges, seen, i, distances[n].j, false);
    }
  }

  return edges;
}

function addEdge(edges: Edge[], seen: Set<string>, a: number, b: number, primary: boolean) {
  const key = a < b ? `${a}-${b}` : `${b}-${a}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ a, b, primary });
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  edges: Edge[],
  proj: Array<{
    sx: number;
    sy: number;
    depth: number;
    riskIndex: number;
  }>,
  risks: RiskGraphDimension[],
  edgeAlphaBoost: number,
) {
  ctx.lineWidth = 0.5;
  for (const edge of edges) {
    const a = proj[edge.a];
    const b = proj[edge.b];
    if (!a || !b) continue;
    const level = risks[a.riskIndex]?.level ?? "LOW";
    const ink = edge.primary ? LEVEL_INK[level] : [11, 14, 20];
    const meanZ = (a.depth + b.depth) / 2;
    const depth = (meanZ + 1) / 2;
    const alpha = edge.primary
      ? 0.055 + depth * 0.13 + edgeAlphaBoost
      : 0.035 + depth * 0.095 + edgeAlphaBoost * 0.55;
    ctx.strokeStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  proj: Array<{
    sx: number;
    sy: number;
    depth: number;
    lift: number;
    sizeMul: number;
    alphaMul: number;
    riskIndex: number;
    factorIndex: number | null;
    anchor: boolean;
    radius: number;
  }>,
  risks: RiskGraphDimension[],
  pulseT: number,
) {
  const order = proj.map((p, i) => ({ p, i })).sort((a, b) => a.p.depth - b.p.depth);
  for (const { p } of order) {
    const level = risks[p.riskIndex]?.level ?? "LOW";
    const color = p.anchor ? LEVEL_INK[level] : [11, 14, 20];
    const depth = (p.depth + 1) / 2;
    const radius = ((0.7 + depth * 1.55) * p.sizeMul + p.lift * 1.45 + pulseT * 0.5) * 0.92;
    const alpha = p.anchor ? 0.76 + depth * 0.22 : (0.38 + depth * 0.38) * p.alphaMul;
    p.radius = radius;

    ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateHover(
  proj: Array<{
    sx: number;
    sy: number;
    depth: number;
    riskIndex: number;
    factorIndex: number | null;
    anchor: boolean;
    radius: number;
  }>,
  risks: RiskGraphDimension[],
  cursor: { x: number; y: number; active: boolean },
  hoveredKey: MutableRefObject<string | null>,
  setHoveredNode: (node: HoveredNode | null) => void,
) {
  if (!cursor.active) return;

  let hit:
    | {
        node: (typeof proj)[number];
        distance: number;
        index: number;
      }
    | null = null;

  for (let i = 0; i < proj.length; i++) {
    const node = proj[i];
    if (!node.anchor) continue;
    const dx = cursor.x - node.sx;
    const dy = cursor.y - node.sy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = Math.max(12, node.radius + 6);
    if (distance > hitRadius) continue;
    if (!hit || node.depth > hit.node.depth || distance < hit.distance) {
      hit = { node, distance, index: i };
    }
  }

  if (!hit) {
    if (hoveredKey.current !== null) {
      hoveredKey.current = null;
      setHoveredNode(null);
    }
    return;
  }

  const risk = risks[hit.node.riskIndex];
  if (!risk) return;

  const key = `${hit.index}-${hit.node.riskIndex}-${hit.node.factorIndex ?? "risk"}`;
  if (hoveredKey.current === key) return;

  hoveredKey.current = key;
  setHoveredNode({
    key,
    x: hit.node.sx,
    y: hit.node.sy,
    title: `${risk.name}: ${Math.round(risk.score)}`,
    level: risk.level,
  });
}

function spherePoint(index: number, count: number) {
  if (index === 0) return { x: 0, y: 0, z: 0.16 };
  const n = Math.max(count - 1, 1);
  const i = index - 1;
  const phi = Math.PI * (Math.sqrt(5) - 1);
  const y = 1 - (i / Math.max(n - 1, 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = phi * i + 0.62;
  return normalize(Math.cos(theta) * r, y * 0.92, Math.sin(theta) * r);
}

function normalize(x: number, y: number, z: number) {
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function seeded(a: number, b: number) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function rgb(color: [number, number, number]) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}
