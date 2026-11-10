import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

// P5C link preview images (1200 x 630 PNG): white card, thin grey frame, black text, the maroon
// accent, the Dzirent wordmark. Drawn on the server from data URIs, so the page's
// Content-Security-Policy never applies to anything here.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

const INK = "#111111";
const MUTED = "#666666";
const LINE = "#e6e6e6";
const ACCENT = "#8e1538";
const ROSE = "#f8eff2";

// public/logo-wordmark.svg, inlined so the image route needs no file from disk.
const WORDMARK =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 563.4 100"><path fill="#111111" fill-rule="evenodd" d="M0,0H38.3A30,30 0 0 1 68.3,30V70A30,30 0 0 1 38.3,100H0ZM20,20V80H38.3A10,10 0 0 0 48.3,70V30A10,10 0 0 0 38.3,20ZM95.1,0L156.1,0L156.1,20L119.1,80L156.1,80L156.1,100L95.1,100L95.1,80L132.1,20L95.1,20ZM187.8,0H207.8V100H187.8ZM236.6,0H270.6A24,24 0 0 1 294.6,24V34A24,24 0 0 1 270.6,58H236.6ZM256.6,20V38H270.6A4,4 0 0 0 274.6,34V24A4,4 0 0 0 270.6,20ZM236.6,57H256.6V100H236.6ZM260.6,56L282.6,56L297.6,100L275.6,100ZM324.4,0H344.4V100H324.4ZM324.4,0H378.1V20H324.4ZM324.4,40H374.1V60H324.4ZM324.4,80H378.1V100H324.4ZM395.1,78V43.9A43.9,43.9 0 0 1 482.9,43.9V78H459.9V43.9A20.9,20.9 0 0 0 418.1,43.9V78ZM395.1,82H418.1V100H395.1ZM459.9,82H482.9V100H459.9ZM500,0H563.4V20H500ZM521.7,19H541.7V100H521.7Z"/></svg>',
  ).toString("base64");

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function frame(left: ReactNode, right: ReactNode) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", padding: 32 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            border: `2px solid ${LINE}`,
            borderRadius: 24,
            overflow: "hidden",
            background: "#ffffff",
          }}
        >
          {left}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "48px 48px 40px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={WORDMARK} width={225} height={40} />
            <div style={{ display: "flex", width: 56, height: 6, background: ACCENT, borderRadius: 3, marginTop: 28 }} />
            {right}
            <div style={{ display: "flex", marginTop: "auto", fontSize: 26, color: MUTED }}>dzirent.com</div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

function photoPanel(photo: string | null) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={photo} width={480} height={566} style={{ objectFit: "cover", width: 480, height: 566 }} />
  ) : (
    <div style={{ width: 480, height: 566, display: "flex", background: ROSE }} />
  );
}

/** A listing: its first photo, title, "$price · City, ST" and the studio handle. */
export function listingImage(p: { photo: string | null; title: string; line: string; handle: string | null }) {
  return frame(
    photoPanel(p.photo),
    <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
      <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: INK, lineHeight: 1.12 }}>
        {clip(p.title, 70)}
      </div>
      <div style={{ display: "flex", fontSize: 36, color: ACCENT, marginTop: 24, fontWeight: 600 }}>{p.line}</div>
      {p.handle && (
        <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 18 }}>@{clip(p.handle, 40)}</div>
      )}
    </div>,
  );
}

/** A studio: up to 4 of its photos in a grid, its name and handle. */
export function studioImage(p: { photos: (string | null)[]; name: string; handle: string }) {
  const shown = p.photos.filter((x): x is string => Boolean(x)).slice(0, 4);
  // One photo fills the panel, two sit side by side, three or four make a 2 x 2 grid.
  const [w, h] = shown.length <= 1 ? [480, 566] : shown.length === 2 ? [240, 566] : [240, 283];
  const cells: (string | null)[] = shown.length >= 3 ? [0, 1, 2, 3].map((i) => shown[i] ?? null) : shown;
  return frame(
    <div style={{ width: 480, height: 566, display: "flex", flexWrap: "wrap", background: ROSE }}>
      {cells.map((photo, i) =>
        photo ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img key={i} src={photo} width={w} height={h} style={{ objectFit: "cover", width: w, height: h }} />
        ) : (
          <div key={i} style={{ width: w, height: h, display: "flex", background: ROSE }} />
        ),
      )}
    </div>,
    <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
      <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: INK, lineHeight: 1.12 }}>
        {clip(p.name, 50)}
      </div>
      <div style={{ display: "flex", fontSize: 34, color: ACCENT, marginTop: 22, fontWeight: 600 }}>
        @{clip(p.handle, 40)}
      </div>
      <div style={{ display: "flex", fontSize: 28, color: MUTED, marginTop: 18 }}>Pieces to rent from a local closet</div>
    </div>,
  );
}

/** Dzirent itself: for pieces that are no longer available and studios with nothing to show. */
export function genericImage(heading = "Your neighborhood wardrobe") {
  return frame(
    <div style={{ width: 480, height: 566, display: "flex", background: ACCENT }} />,
    <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
      <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: INK, lineHeight: 1.12 }}>{heading}</div>
      <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 22 }}>
        Rent clothes from closets near you
      </div>
    </div>,
  );
}
