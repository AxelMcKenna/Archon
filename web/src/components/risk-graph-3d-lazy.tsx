"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { RiskGraph3D as RiskGraph3DComponent } from "./risk-graph-3d";

const RiskGraph3DInner = dynamic(
  () => import("./risk-graph-3d").then((m) => m.RiskGraph3D),
  { ssr: false, loading: () => <div className="h-[480px]" aria-hidden /> },
);

export function RiskGraph3D(props: ComponentProps<typeof RiskGraph3DComponent>) {
  return <RiskGraph3DInner {...props} />;
}
