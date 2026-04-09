import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameCodex — AI Game Dev Assistant",
  description: "The AI game dev assistant that never forgets. 950+ curated guides, 5 power tools, 29 engines. Describe your game, get code that runs.",
  keywords: ["game development", "AI assistant", "MCP server", "Godot", "MonoGame", "Unity", "Unreal", "Bevy", "Phaser", "game dev tools"],
  openGraph: {
    title: "GameCodex — AI Game Dev Assistant",
    description: "Your AI forgets game dev mid-project. This one doesn't. 950+ curated guides, 29 engines, any language.",
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
