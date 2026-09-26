"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="页面出现异常" message="页面运行时发生错误，你可以重试；本地保存的数据不会因此被删除。" actionLabel="重试" onAction={reset}/>;
}
