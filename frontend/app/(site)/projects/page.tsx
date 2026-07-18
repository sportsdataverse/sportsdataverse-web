import type { Metadata } from "next";
import { connectToDatabase } from "@lib/mongodb";
import pageMeta from "@content/meta";
import type { ProjectType } from "@lib/types";
import ProjectsClient from "./ProjectsClient";

export const metadata: Metadata = {
  title: pageMeta.projects.title,
  description: pageMeta.projects.description,
  keywords: pageMeta.projects.keywords,
  openGraph: { images: [{ url: pageMeta.projects.image }] },
};

// Mongo-backed, per-request (was getServerSideProps).
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let projects: ProjectType[] = [];
  let error = false;
  try {
    const { db } = await connectToDatabase();
    const all = (JSON.parse(
      JSON.stringify(
        await db
          .collection("projects")
          .find({})
          .sort({ createdAt: -1 })
          .toArray()
      )
    ) as ProjectType[]);
    // Show everything except entries explicitly hidden (pinned === false).
    projects = all.filter((p) => p.pinned !== false);
  } catch {
    error = true;
  }
  return <ProjectsClient projects={projects} error={error} />;
}
