import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DecisionLab 决策实验室",
  description: "把复杂选择拆开比较，看清每个方案的优势与取舍。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
