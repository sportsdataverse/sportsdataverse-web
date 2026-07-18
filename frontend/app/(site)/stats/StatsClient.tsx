"use client";

import React from "react";
import useSWR from "swr";
import { FadeContainer, opacityVariant } from "@content/FramerMotionVariants";
import fetcher from "@lib/fetcher";
import PageTop from "@components/PageTop";
import StatsCard from "@components/Stats/StatsCard";
import AnimatedHeading from "@components/FramerMotion/AnimatedHeading";
import AnimatedText from "@components/FramerMotion/AnimatedText";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";

type Stats = {
  title: string;
  value: string;
};

export default function StatsClient() {
  const { data: github } = useSWR("/api/stats/github", fetcher);

  const stats: Stats[] = [
    {
      title: "Github Repos",
      value: github?.repos,
    },
    {
      title: "Github Followers",
      value: github?.followers,
    },
    {
      title: "Github Stars",
      value: github?.githubStars,
    },
    {
      title: "Repositories Forked",
      value: github?.forks,
    },
  ];

  return (
    <>

      <section className="pageTop font-inter">
        <PageTop pageTitle="Statistics">
          <p>
            These are the GitHub statistics for the SportsDataverse.
          </p>
        </PageTop>

        {/*Github stats */}
        <AnimatedDiv
          className="grid xs:grid-cols-2 sm:!grid-cols-3 xl:!grid-cols-4 gap-5 my-10"
          variants={FadeContainer}
        >
          {stats.map((stat, index) => (
            <StatsCard key={index} title={stat.title} value={stat.value} />
          ))}
        </AnimatedDiv>

      </section>
    </>
  );
}

