"use client";

import useSWR from "swr";
import { FadeContainer } from "@content/FramerMotionVariants";
import fetcher from "@lib/fetcher";
import StatsCard from "@components/Stats/StatsCard";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";

/** GitHub org stats — the secondary section under the warehouse numbers. */
export default function StatsClient() {
  const { data: github, error } = useSWR("/api/stats/github", fetcher);
  const failed = Boolean(error);

  const stats = [
    { title: "GitHub repos", value: github?.repos },
    { title: "GitHub followers", value: github?.followers },
    { title: "GitHub stars", value: github?.githubStars },
    { title: "Forks of our repos", value: github?.forks },
  ];

  return (
    <section className="mt-14">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">
          GitHub
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          live from the org
        </p>
      </div>
      {failed ? (
        <p className="py-6 text-sm text-muted-foreground">
          GitHub stats are unavailable right now — try again in a minute.
        </p>
      ) : null}
      <AnimatedDiv
        className="my-6 grid gap-5 xs:grid-cols-2 sm:!grid-cols-3 xl:!grid-cols-4"
        variants={FadeContainer}
      >
        {stats.map((stat) => (
          <StatsCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            error={failed}
          />
        ))}
      </AnimatedDiv>
    </section>
  );
}
