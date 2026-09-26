import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBanner } from "@/components/ui/status-banner";

export function ErrorState({ title = "暂时无法完成操作", message, actionLabel = "返回首页", onAction }: { title?: string; message: string; actionLabel?: string; onAction: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-background px-5"><Card className="w-full max-w-lg p-8"><h1 className="text-xl font-semibold">{title}</h1><StatusBanner tone="error" className="mt-4">{message}</StatusBanner><Button className="mt-5" variant="outline" onClick={onAction}>{actionLabel}</Button></Card></main>;
}
