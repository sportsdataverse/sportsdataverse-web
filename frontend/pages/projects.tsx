import React from "react";
import Link from "next/link";
import type { GetServerSidePropsContext } from "next";
import Project from "@components/Project";
import Metadata from "@components/MetaData";
import PageTop from "@components/PageTop";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";
import { FadeContainer } from "@content/FramerMotionVariants";
import pageMeta from "@content/meta";
import { ProjectType } from "@lib/types";
import CreateAnIssue from "@components/CreateAnIssue";

export default function Projects({
  projects,
  error,
}: {
  projects: ProjectType[];
  error: boolean;
}) {
  if (error) return <CreateAnIssue />;

  return (
    <>
      <Metadata
        title={pageMeta.projects.title}
        description={pageMeta.projects.description}
        previewImage={pageMeta.projects.image}
        keywords={pageMeta.projects.keywords}
      />
      <section className="pageTop">
        <PageTop pageTitle="Projects">
          Projects from across the SportsDataverse community. So far there are{" "}
          <span className="font-bold text-gray-600 dark:text-gray-200">
            {projects.length}+
          </span>{" "}
          projects on display.
        </PageTop>

        <AnimatedDiv
          variants={FadeContainer}
          className="grid grid-cols-1 gap-4 mx-auto md:ml-[20%] xl:ml-[24%]"
        >
          {projects.map((project) => {
            if (project.name === "" && project.githubURL === "") return null;
            return <Project key={project._id ?? project.id} project={project} />;
          })}
        </AnimatedDiv>

        <div className="flex items-center justify-center px-5 pb-10 pt-8">
          <Link
            href="/projects/manage"
            className="font-inter text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline dark:text-gray-400"
          >
            SportsDataverse org member? Add your project &rarr;
          </Link>
        </div>
      </section>
    </>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  // Read the Mongo-backed projects from the public API on the same deployment.
  const host = ctx.req.headers.host;
  const proto =
    (ctx.req.headers["x-forwarded-proto"] as string | undefined) ||
    (host?.startsWith("localhost") ? "http" : "https");
  const baseUrl = host
    ? `${proto}://${host}`
    : process.env.NODE_ENV !== "production"
      ? process.env.DEV_URL
      : process.env.PROD_URL;

  let projects: ProjectType[] = [];
  let error = false;
  try {
    const response = await fetch(`${baseUrl}/api/projects`);
    if (!response.ok) throw new Error(`projects API ${response.status}`);
    const data = await response.json();
    const all: ProjectType[] = Array.isArray(data?.message) ? data.message : [];
    // Show everything except entries explicitly hidden (pinned === false).
    projects = all.filter((p) => p.pinned !== false);
  } catch {
    error = true;
  }

  return { props: { projects, error } };
}
