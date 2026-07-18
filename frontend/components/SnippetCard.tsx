import { Snippet } from "@lib/types";
import { snippetsImages } from "@utils/utils";
import Image from "next/image";
import Link from "next/link";

export default function SnippetCard({ snippet }: { snippet: Snippet }) {
  return (
    <Link
      href={"/snippets/" + snippet.slug}
      className="group w-full p-4 ring-1 ring-border hover:ring-primary/40 bg-card flex flex-col gap-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="p-1 overflow-hidden w-fit">
        <Image
          src={snippetsImages[`${snippet.image}`]}
          alt={snippet.image}
          width={40}
          height={40}
          className="transition-transform duration-200 group-hover:scale-110"
        ></Image>
      </div>
      <h2 className="text-lg font-bold text-foreground transition-colors group-hover:text-primary">
        {snippet.title}
      </h2>
      <p className="-mt-1 text-muted-foreground ">{snippet.excerpt}</p>
    </Link>
  );
}
