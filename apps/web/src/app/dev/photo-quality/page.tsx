import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { PhotoQualityScreen } from "@/components/ai-quality/PhotoQualityScreen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overhead Photo Quality Screening (Dev) · DziRent",
  description: "Internal developer screening tool for lender garment photos",
  robots: { index: false, follow: false },
};

interface PhotoQualityPageProps {
  searchParams?: Promise<{
    env?: string;
    allow_dev?: string;
  }>;
}

export default async function PhotoQualityDevPage({ searchParams }: PhotoQualityPageProps) {
  // Production gate:
  // This experimental test page must never become a public production route.
  // It is absent (returns 404) in production unless explicitly authorized for staging/preview verification.
  const params = await searchParams;
  const headerList = await headers();
  const simulatedEnv = params?.env ?? headerList.get("x-dzirent-environment");

  const isProduction =
    simulatedEnv === "production" ||
    process.env.DZIRENT_ENVIRONMENT === "production" ||
    process.env.NEXT_PUBLIC_DZIRENT_ENVIRONMENT === "production" ||
    process.env.VERCEL_ENV === "production";

  const allowDevRoutes =
    params?.allow_dev === "1" ||
    headerList.get("x-dzirent-allow-dev-routes") === "1" ||
    process.env.NEXT_PUBLIC_DZIRENT_ALLOW_DEV_ROUTES === "1";

  if (isProduction && !allowDevRoutes) {
    notFound();
  }

  return <PhotoQualityScreen />;
}

