"use client";
import { ErrorState } from "@/components/ui/primitives";
export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  return <main id="main-content" className="content-width"><ErrorState message="This page could not be displayed. Please try again." retry={retry} /></main>;
}
