/**
 * The scoreboard ticker — the site's signature element. A slim broadcast-style
 * strip under the nav carrying true facts about the ecosystem. Server
 * component; the package count comes from Mongo with a safe fallback.
 */
import { connectToDatabase } from "@lib/mongodb";

async function packageCount(): Promise<number | null> {
  try {
    const { db } = await connectToDatabase();
    return await db.collection("packages").countDocuments({});
  } catch {
    return null;
  }
}

export default async function Ticker() {
  const count = await packageCount();
  const items = [
    `${count ?? "40+"} open-source packages`,
    "R · Python · Node.js",
    "8 leagues in the warehouse",
    "120M+ rows of play-by-play",
    "EPA · win probability · ratings models",
    "free and open since 2021",
  ];
  // duplicate once so the marquee loops seamlessly (translateX(-50%))
  const strip = [...items, ...items];
  return (
    <div className="overflow-hidden border-b border-border bg-card">
      <p className="sr-only">{items.join(" · ")}</p>
      <div
        aria-hidden="true"
        className="flex w-max animate-ticker gap-0 whitespace-nowrap py-1.5 motion-reduce:animate-none"
      >
        {strip.map((item, i) => (
          <span
            key={i}
            className="flex items-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
          >
            <span className="px-5">{item}</span>
            <span className="text-score">▪</span>
          </span>
        ))}
      </div>
    </div>
  );
}
