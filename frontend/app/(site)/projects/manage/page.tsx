import type { Metadata } from "next";
import { auth } from "@lib/auth";
import { connectToDatabase } from "@lib/mongodb";
import ManageProjectsClient from "./ManageProjectsClient";

export const metadata: Metadata = { title: "Manage Projects" };
export const dynamic = "force-dynamic";

export default async function ManageProjectsPage() {
  const session = await auth();
  const signedIn = Boolean(session);
  const authorized = Boolean(session?.isOrgMember);

  if (!authorized) {
    return (
      <ManageProjectsClient
        authorized={false}
        signedIn={signedIn}
        login={null}
        isAdmin={false}
        projects={[]}
      />
    );
  }

  let projects: any[] = [];
  try {
    const { db } = await connectToDatabase();
    projects = JSON.parse(
      JSON.stringify(
        await db.collection("projects").find({}).sort({ createdAt: -1 }).toArray()
      )
    );
  } catch {
    projects = [];
  }

  return (
    <ManageProjectsClient
      authorized={true}
      signedIn={signedIn}
      login={session?.login ?? null}
      isAdmin={session?.role === "admin"}
      projects={projects}
    />
  );
}
