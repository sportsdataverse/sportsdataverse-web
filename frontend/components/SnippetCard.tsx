import { Snippet } from "@lib/types";
import { snippetsImages } from "@utils/utils";
import Image from "next/image";
import Link from "next/link";

// Language snippets get a styled monogram tile (matching the home-page
// language chips); anything else falls back to the legacy icon images.
const LANG_TILES: Record<string, string> = {
  r: "R",
  python: "PY",
  node: "JS",
};

export default function SnippetCard({ snippet }: { snippet: Snippet }) {
  const tile = LANG_TILES[snippet.image];
  return (
    <Link
      href={"/snippets/" + snippet.slug}
      className="group w-full p-4 ring-1 ring-border hover:ring-primary/40 bg-card flex flex-col gap-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      {tile ? (
        <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 font-display text-base font-bold text-primary transition-transform duration-200 group-hover:scale-110">
          {tile}
        </span>
      ) : (
        <div className="p-1 overflow-hidden w-fit">
          <Image
            src={snippetsImages[`${snippet.image}`]}
            alt={snippet.image}
            width={40}
            height={40}
            className="transition-transform duration-200 group-hover:scale-110"
          ></Image>
        </div>
      )}
      <h2 className="text-lg font-bold text-foreground transition-colors group-hover:text-primary">
        {snippet.title}
      </h2>
      <p className="-mt-1 text-muted-foreground ">{snippet.excerpt}</p>
    </Link>
  );
}
