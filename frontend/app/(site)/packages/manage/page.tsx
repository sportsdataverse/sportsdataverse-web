import type { Metadata } from "next";
import type { Document, WithId } from "mongodb";
import { auth } from "@lib/auth";
import { connectToDatabase } from "@lib/mongodb";
import ManagePackagesClient from "./ManagePackagesClient";
import { isPubliclyVisible } from "@lib/packageVisibility";
import type { PackageDoc } from "@lib/packageSchema";

/** The raw driver shape before the JSON round-trip below turns it into a
 *  `PackageDoc` — same editable + metadata fields, but `_id` is still a real
 *  `ObjectId` (not yet the plain string `PackageDoc` promises). */
type RawPackageDoc = Omit<PackageDoc, "_id"> & WithId<Document>;

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

  let packages: PackageDoc[] = [];
  try {
    const { db } = await connectToDatabase();
    const docs = (await db.collection("packages").find({}).toArray()) as unknown as RawPackageDoc[];
    packages = JSON.parse(
      JSON.stringify(
        docs.sort((a, b) => {
          // awaiting review == not publicly visible: the same rule the public site uses
          const pa = isPubliclyVisible(a) ? 1 : 0;
          const pb = isPubliclyVisible(b) ? 1 : 0;
          if (pa !== pb) return pa - pb;
          if (pa === 0) return +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0);
          return String(a.title).localeCompare(String(b.title));
        })
      )
    ) as PackageDoc[];
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
