"use client";

import Link from "next/link";
import Project from "@components/Project";
import PageTop from "@components/PageTop";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";
import { FadeContainer } from "@content/FramerMotionVariants";
import { ProjectType } from "@lib/types";
import CreateAnIssue from "@components/CreateAnIssue";

export default function ProjectsClient({
  projects,
  error,
}: {
  projects: ProjectType[];
  error: boolean;
}) {
  if (error) return <CreateAnIssue />;

  return (
    <section className="pageTop">
      <PageTop pageTitle="Projects">
        Projects from across the SportsDataverse community. So far there are{" "}
        <span className="font-bold text-foreground">
          {projects.length}+
        </span>{" "}
        projects on display.
      </PageTop>

      <AnimatedDiv
        variants={FadeContainer}
        className="mx-auto grid max-w-3xl grid-cols-1 gap-4"
      >
        {projects.map((project) => {
          if (project.name === "" && project.githubURL === "") return null;
          return <Project key={project._id ?? project.id} project={project} />;
        })}
      </AnimatedDiv>

      <div className="flex items-center justify-center px-5 pb-10 pt-8">
        <Link
          href="/projects/manage"
          className="font-inter text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
        >
          SportsDataverse org member? Add your project &rarr;
        </Link>
      </div>
    </section>
  );
}
