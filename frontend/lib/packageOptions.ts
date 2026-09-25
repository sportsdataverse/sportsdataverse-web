import { connectToDatabase } from "@lib/mongodb";
import { PUBLIC_PACKAGE_FILTER } from "@lib/packageVisibility";

/** Package names by ecosystem for the survey's follow-up questions; empty lists if the DB is unreachable. */
export async function packageOptions(): Promise<Record<"packages_r" | "packages_python", { value: string; label: string }[]>> {
  try {
    const { db } = await connectToDatabase();
    const pkgs = (await db.collection("packages").find(PUBLIC_PACKAGE_FILTER, { projection: { title: 1, repoType: 1 } }).sort({ title: 1 }).toArray()) as {
      title: string; repoType: string;
    }[];
    const of = (t: string) => pkgs.filter((p) => p.repoType === t).map((p) => ({ value: p.title, label: p.title }));
    return { packages_r: of("R"), packages_python: of("Python") };
  } catch {
    return { packages_r: [], packages_python: [] };
  }
}
