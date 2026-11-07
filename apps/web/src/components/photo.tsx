"use client";
import Image from "next/image";
import { useState } from "react";
import { Icon } from "./icon";
export function Photo({
  src,
  alt,
  priority = false,
  sizes = "(max-width: 600px) 50vw, 25vw",
}: {
  src: string | null;
  alt: string;
  priority?: boolean;
  sizes?: string;
}) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setBroken(true)}
    />
  ) : (
    <div
      className="photo-fallback"
      role="img"
      aria-label={alt + " - photo unavailable"}
    >
      <Icon name="hanger" />
      <span>Photo coming soon</span>
    </div>
  );
}
export function Gallery({
  photos,
  title,
}: {
  photos: string[];
  title: string;
}) {
  const [selected, setSelected] = useState(0);
  return (
    <div className="gallery">
      <div className="gallery-main">
        <Photo
          key={photos[selected]}
          src={photos[selected] || null}
          alt={title}
          priority
          sizes="(max-width: 760px) 100vw, 58vw"
        />
        <span className="photo-counter">
          {photos.length ? selected + 1 : 0} / {photos.length}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="thumbnails" aria-label="All listing photos">
          {photos.map((src, i) => (
            <button
              key={src + "-" + i}
              type="button"
              aria-label={"View " + (i + 1) + " of " + photos.length}
              aria-pressed={selected === i}
              className={selected === i ? "selected" : ""}
              onClick={() => setSelected(i)}
            >
              <Photo
                src={src}
                alt={`${title} - view ${i + 1}`}
                sizes="80px"
              />
            </button>

          ))}
        </div>
      )}
    </div>
  );
}
