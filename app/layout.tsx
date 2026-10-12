import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

// Same mono as DialKit's values, so code and controls match
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Creative Coding Studio",
  description: "A p5.js playground on your Mac where you shape sketches by hand or ask Claude",
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
