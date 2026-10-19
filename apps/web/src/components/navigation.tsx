"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();
  return <nav className="workflow-nav" aria-label="Main navigation">
    <div className="content-width workflow-links">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>All collections</Link>
      <Link href="/studios" aria-current={pathname.startsWith("/studios") ? "page" : undefined}>Explore Studios</Link>
    </div>
  </nav>;
}
