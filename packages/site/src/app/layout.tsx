import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sbenson2.github.io/GameCodex"),
  title: "GameCodex — Free & Open Source AI Game Dev Assistant",
  description: "Free and open source. 950+ curated guides, 5 power tools, 29 engines. Give your AI permanent game dev knowledge through MCP.",
  keywords: ["game development", "AI assistant", "MCP server", "Godot", "MonoGame", "Unity", "Unreal", "Bevy", "Phaser", "Raylib", "Love2D", "GameMaker", "Pygame", "game dev tools"],
  openGraph: {
    title: "GameCodex — AI Game Dev Assistant",
    description: "Free and open source. Your AI forgets game dev mid-project — this one doesn't. 950+ curated guides, 29 engines, any language.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "GameCodex — 950+ curated game dev docs, 29 engines, 5 power tools",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GameCodex — AI Game Dev Assistant",
    description: "Free and open source. Your AI forgets game dev mid-project — this one doesn't. 950+ curated guides, 29 engines, any language.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <Script
          defer
          data-domain="gamecodex.dev"
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
