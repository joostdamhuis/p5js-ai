import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

// Same mono as DialKit's values, so code and controls match
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "p5.js AI Editor",
  description: "AI-powered p5.js code editor with real-time preview and WebSocket connectivity",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${mono.variable}`}>
      <body className="bg-background text-foreground font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
