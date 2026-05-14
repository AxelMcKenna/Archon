"use client";

import dynamic from "next/dynamic";
import type { NeuralSphereProps } from "./neural-sphere";

const NeuralSphereInner = dynamic(
  () => import("./neural-sphere").then((m) => m.NeuralSphere),
  { ssr: false, loading: () => <div aria-hidden /> },
);

export function NeuralSphere(props: NeuralSphereProps) {
  return <NeuralSphereInner {...props} />;
}
