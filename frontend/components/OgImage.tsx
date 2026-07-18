// Project cover images are user-submitted (any domain), so we render a plain
// <img> rather than next/image — next/image throws on a non-allowlisted remote
// hostname, which would 500 the whole /projects page for one bad cover URL.
// The wrapper is a fixed-aspect (mobile) / stretch-fill (desktop) box with
// object-cover, so covers of any dimensions stay inside the card.
function OgImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-[1200/630] w-full shrink-0 self-stretch overflow-hidden rounded-xl sm:aspect-auto sm:w-2/5 sm:min-h-40 before:absolute before:inset-0 dark:before:bg-black/20 before:z-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        title={alt}
        alt={alt}
        src={src}
        loading="lazy"
        width={1200}
        height={630}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 lg:group-hover:scale-110"
      />
    </div>
  );
}

export default OgImage;
