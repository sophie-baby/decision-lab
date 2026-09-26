"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

function RouteLoading() {
  return <main className="grid min-h-[70vh] place-items-center bg-background text-sm text-muted-foreground">正在加载…</main>;
}

const StepBuilder = dynamic(() => import("./step-builder"), { loading: RouteLoading });
const DecisionResults = dynamic(() => import("@/components/results/decision-results"), { loading: RouteLoading });

export default function DecisionRoute() {
  const params = useParams<{ step: string }>();
  if (params.step === "results" || params.step === "scenario" || params.step === "sensitivity") {
    return <DecisionResults mode={params.step} />;
  }
  return <StepBuilder/>;
}
