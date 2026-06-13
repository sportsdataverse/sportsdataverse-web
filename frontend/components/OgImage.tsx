// Project cover images are user-submitted (any domain), so we render a plain
// <img> rather than next/image — next/image throws on a non-allowlisted remote
// hostname, which would 500 the whole /projects page for one bad cover URL.
function OgImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative -mt-[35%] sm:-mt-0 md:-ml-[35%] w-full sm:w-1/2 md:w-8/12 shrink-0 rounded-xl overflow-hidden shadow-2xl before:absolute before:inset-0 dark:before:bg-black/20 before:z-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        title={alt}
        alt={alt}
        src={src}
        loading="lazy"
        width={1200}
        height={630}
        className="transition-all duration-300 lg:group-hover:scale-110 backdrop-blur-xl"
        style={{
          width: "100%",
          height: "auto",
          objectFit: "cover",
        }}
      />
    </div>
  );
}

export default OgImage;
