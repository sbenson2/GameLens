import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameCodex — AI Game Dev Co-Pilot",
  description: "The AI game dev co-pilot that never forgets. 150+ curated guides, 5 power tools, any engine. Describe your game, get code that runs.",
  keywords: ["game development", "AI assistant", "MCP server", "Godot", "MonoGame", "Unity", "Phaser", "game dev tools"],
  openGraph: {
    title: "GameCodex — AI Game Dev Co-Pilot",
    description: "Your AI forgets game dev mid-project. This one doesn't. 150+ curated guides, any engine, any language.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
