import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PhotoQualityScreen } from "@/components/ai-quality/PhotoQualityScreen";
import { photoQualityLocalAllowed } from "@/lib/ai-quality/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Overhead Photo Quality Screening (Dev) · DziRent",
  description: "Internal developer screening tool for lender garment photos",
  robots: { index: false, follow: false },
};

export default function PhotoQualityDevPage() {
  // Only server-controlled runtime values decide access. No URL/header overrides.
  if (!photoQualityLocalAllowed(
    process.env.DZIRENT_ENVIRONMENT,
    process.env.NODE_ENV,
    process.env.VERCEL_ENV,
  )) {
    notFound();
  }
  return <PhotoQualityScreen />;
}
