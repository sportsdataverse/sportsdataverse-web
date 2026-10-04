/**
 * The scoreboard ticker — the site's signature element. A slim broadcast-style
 * strip under the nav carrying true facts about the ecosystem. Server
 * component; the package count comes from Mongo and the warehouse figures from
 * the snapshot /stats reads. A figure that does not load is left out, never guessed.
 */
import { connectToDatabase } from "@lib/mongodb";
import { PUBLIC_PACKAGE_FILTER } from "@lib/packageVisibility";
import { getSiteFacts } from "@lib/siteFacts";
import { tickerFacts } from "@lib/warehouseFigures";

async function packageCount(): Promise<number | null> {
  try {
    const { db } = await connectToDatabase();
    return await db.collection("packages").countDocuments(PUBLIC_PACKAGE_FILTER);
  } catch {
    return null;
  }
}

export default async function Ticker() {
  const [count, facts] = await Promise.all([packageCount(), getSiteFacts()]);
  const items = [
    ...(count != null ? [`${count} open-source packages`] : []),
    "R · Python · Node.js",
    ...tickerFacts(facts),
    "EPA · win probability · ratings models",
    "free and open since 2021",
  ];
  // Two identical halves so the marquee loops seamlessly (translateX(-50%)). Each half must be
  // wider than the viewport or a gap shows at the loop point: four facts are ~1050px, so a half
  // repeats the facts until it holds at least eight.
  const half = Array.from({ length: Math.ceil(8 / items.length) }, () => items).flat();
  const strip = [...half, ...half];
  // The 40s cycle was tuned for six facts per half; scale it with the half so the pace stays ~40 px/s.
  const duration = `${(40 * half.length) / 6}s`;
  return (
    <div className="overflow-hidden border-b border-border bg-card">
      <p className="sr-only">{items.join(" · ")}</p>
      <div
        aria-hidden="true"
        style={{ animationDuration: duration }}
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
