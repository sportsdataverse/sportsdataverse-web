/**
 * One linked shields.io endpoint badge. Decoration on top of real text: the
 * `alt` carries the same facts, so the badge reads without images too.
 */
export default function ShieldBadge({
  src,
  alt,
  href,
}: {
  src: string;
  alt: string;
  href: string | null;
}) {
  const img = (
    // A plain <img>, not next/image: remote SVG shields would need img.shields.io in
    // remotePatterns, and next/image can't size an SVG badge of unknown width.
    <img src={src} alt={alt} title={alt} loading="lazy" decoding="async" height={20} className="h-5 w-auto" />
  );
  if (!href) return img;
  const external = href.startsWith("https://");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {img}
    </a>
  );
}
