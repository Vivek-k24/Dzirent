import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import { AppProviders } from "@/components/providers";
import { AppShell } from "@/components/shell";
import { Skeletons } from "@/components/ui/primitives";
import "./globals.css";

const sans = localFont({ src: "../fonts/Inter.ttf", variable: "--font-sans", weight: "100 900", display: "swap" });
const serif = localFont({ src: "../fonts/PlayfairDisplay.ttf", variable: "--font-serif", weight: "400 900", display: "swap" });
export const metadata: Metadata = {
  title: { default: "dzirent · A fresh look. A shared wardrobe.", template: "%s · dzirent" },
  description: "Explore a shared wardrobe for your next occasion. Presentation demo with sample outfits, prices and availability.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${serif.variable}`}><body><Suspense fallback={<main id="main-content" className="content-width boot-screen"><p className="wordmark">dzirent.</p><Skeletons /></main>}><AppProviders><AppShell>{children}</AppShell></AppProviders></Suspense></body></html>;
}
