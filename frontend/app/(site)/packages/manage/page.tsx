import type { Metadata } from "next";
import { auth } from "@lib/auth";
import { connectToDatabase } from "@lib/mongodb";
import ManagePackagesClient from "./ManagePackagesClient";

export const metadata: Metadata = { title: "Manage Packages" };
export const dynamic = "force-dynamic";

export default async function ManagePackagesPage() {
  const session = await auth();
  const signedIn = Boolean(session);
  const authorized = Boolean(session?.isOrgMember);

  if (!authorized) {
    return (
      <ManagePackagesClient
        authorized={false}
        signedIn={signedIn}
        login={null}
        packages={[]}
      />
    );
  }

  let packages: any[] = [];
  try {
    const { db } = await connectToDatabase();
    packages = JSON.parse(
      JSON.stringify(
        await db.collection("packages").find({}).sort({ published: -1 }).toArray()
      )
    );
  } catch {
    packages = [];
  }

  return (
    <ManagePackagesClient
      authorized={true}
      signedIn={signedIn}
      login={session?.login ?? null}
      packages={packages}
    />
  );
}
