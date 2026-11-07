// apps/web/src/components/legal-layout.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_CONFIG, type LegalConfig } from "@/content/legal/config";
import { Icon } from "./icon";

export function LegalPlaceholder({
  name,
  label,
  fallback,
}: {
  name: keyof LegalConfig;
  label: string;
  fallback?: string;
}) {
  const value = LEGAL_CONFIG[name];
  if (typeof value === "string" && value.trim().length > 0) {
    return <span>{value}</span>;
  }
  if (fallback && fallback.trim().length > 0) {
    return <span>{fallback}</span>;
  }
  return (
    <span
      className="legal-placeholder"
      title={`To be completed: ${label}`}
      data-placeholder={name}
    >
      [To be completed: {label}]
    </span>
  );
}

export function LegalDraftBanner() {
  if (!LEGAL_CONFIG.legalDraft) return null;
  return (
    <div className="legal-draft-banner" role="status">
      <span className="draft-tag">Draft</span>
      <span>These terms are being finalized.</span>
    </div>
  );
}

export interface TocItem {
  id: string;
  label: string;
}

export interface LegalLayoutProps {
  title: string;
  subtitle?: string;
  version?: string;
  effectiveDate?: ReactNode;
  lastUpdated?: string;
  toc: TocItem[];
  children: ReactNode;
}

export function LegalLayout({
  title,
  subtitle,
  version,
  effectiveDate,
  lastUpdated,
  toc,
  children,
}: LegalLayoutProps) {
  return (
    <div className="page-width legal-page">
      <LegalDraftBanner />

      <header className="legal-header">
        <div className="legal-breadcrumbs">
          <Link href="/">Home</Link>
          <Icon name="chevron" />
          <Link href="/support">Legal & Help</Link>
          <Icon name="chevron" />
          <span aria-current="page">{title}</span>
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="legal-subtitle">{subtitle}</p>}
        <div className="legal-meta">
          {effectiveDate && (
            <div className="legal-meta-item">
              <span className="meta-label">Effective:</span>
              <span className="meta-value">{effectiveDate}</span>
            </div>
          )}
          {lastUpdated && (
            <div className="legal-meta-item">
              <span className="meta-label">Last updated:</span>
              <span className="meta-value">{lastUpdated}</span>
            </div>
          )}
          {version && (
            <div className="legal-meta-item">
              <span className="meta-label">Version:</span>
              <span className="meta-value">{version}</span>
            </div>
          )}
        </div>
      </header>

      <div className="legal-container">
        {toc.length > 0 && (
          <aside className="legal-sidebar" aria-label="Table of contents">
            <div className="legal-toc-wrapper">
              <h3>On this page</h3>
              <nav className="legal-toc">
                <ol>
                  {toc.map((item) => (
                    <li key={item.id}>
                      <a href={`#${item.id}`}>{item.label}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          </aside>
        )}

        <article className="legal-content">{children}</article>
      </div>
    </div>
  );
}
