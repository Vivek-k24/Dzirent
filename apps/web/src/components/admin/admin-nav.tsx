"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";


export type AdminQueueCounts = {
  open_reports: number;
  scans_in_review: number;
  open_takedowns: number;
  id_verification_reviews: number;
};

export function AdminNav({ queues }: { queues: AdminQueueCounts | null }) {
  const pathname = usePathname();

  const navItems = [
    { href: "/admin", label: "Overview", icon: "compass" },
    {
      href: "/admin/reports",
      label: "Reports",
      icon: "flag",
      count: queues?.open_reports ?? 0,
    },
    {
      href: "/admin/photo-reviews",
      label: "Photo reviews",
      icon: "sparkle",
      count: queues?.scans_in_review ?? 0,
    },
    { href: "/admin/listings", label: "Listings", icon: "hanger" },
    { href: "/admin/users", label: "Users", icon: "user" },
    {
      href: "/admin/takedowns",
      label: "Takedowns",
      icon: "document",
      count: queues?.open_takedowns ?? 0,
    },
    { href: "/admin/payments", label: "Payments", icon: "document" },
    { href: "/admin/flags", label: "Flags", icon: "filter" },
    { href: "/admin/settings", label: "Settings", icon: "filter" },
    { href: "/admin/integrations", label: "Integrations", icon: "compass" },
    { href: "/admin/jobs", label: "Background jobs", icon: "clock" },
    { href: "/admin/id-verification", label: "ID verification", icon: "user" },
    { href: "/admin/audit-log", label: "Audit log", icon: "clock" },
  ];

  return (
    <div className="admin-nav-bar">
      <div className="admin-nav-inner">
        <div className="admin-nav-brand">
          <span className="eyebrow accent">DZIRENT OPS</span>
          <h2>Admin console</h2>
        </div>
        <nav className="admin-tabs" aria-label="Admin Navigation">
          {navItems.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-tab-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span>{item.label}</span>
                {typeof item.count === "number" && item.count > 0 && (
                  <span className="admin-badge">{item.count}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
