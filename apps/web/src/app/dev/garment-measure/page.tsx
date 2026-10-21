import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GarmentMeasureScreen } from "@/components/ai-measure/GarmentMeasureScreen";
import { photoQualityLocalAllowed } from "@/lib/ai-quality/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Garment Fit & Geometry Measurement (Dev) · DziRent",
  description:
    "Internal developer prototype for US Letter reference and garment landmark measurement",
  robots: { index: false, follow: false },
};

export default function GarmentMeasureDevPage() {
  // Server-controlled runtime gate only. Denied when VERCEL_ENV is set; allowed when
  // DZIRENT_ENVIRONMENT is local/test or NODE_ENV === 'development'. No URL/header overrides.
  if (
    !photoQualityLocalAllowed(
      process.env.DZIRENT_ENVIRONMENT,
      process.env.NODE_ENV,
      process.env.VERCEL_ENV,
    )
  ) {
    notFound();
  }

  return <GarmentMeasureScreen />;
}

