import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatusBannerProps = {
  children: ReactNode;
  tone?: "info" | "warning" | "error" | "success";
  actions?: ReactNode;
  className?: string;
};

const toneClasses = {
  info: "border-primary/20 bg-blue-50 text-primary",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export function StatusBanner({ children, tone = "info", actions, className }: StatusBannerProps) {
  return <div role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm", toneClasses[tone], className)}><span>{children}</span>{actions&&<div className="flex gap-2">{actions}</div>}</div>;
}
