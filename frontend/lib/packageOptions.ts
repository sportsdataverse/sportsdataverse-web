import { connectToDatabase } from "@lib/mongodb";
import { PUBLIC_PACKAGE_FILTER } from "@lib/packageVisibility";

/** Package names by ecosystem for the survey's follow-up questions; empty lists if the DB is unreachable. */
export async function packageOptions(): Promise<Record<"packages_r" | "packages_python", { value: string; label: string }[]>> {
  try {
    const { db } = await connectToDatabase();
    const pkgs = (await db.collection("packages").find(PUBLIC_PACKAGE_FILTER, { projection: { title: 1, repoType: 1 } }).sort({ title: 1 }).toArray()) as unknown as {
      title: string; repoType: string;
    }[];
    // unique titles: two rows sharing a title would give QuestionFlow a duplicate React key,
    // and ticking one option would tick both
    const of = (t: string) =>
      [...new Set(pkgs.filter((p) => p.repoType === t).map((p) => p.title))].map((title) => ({ value: title, label: title }));
    return { packages_r: of("R"), packages_python: of("Python") };
  } catch {
    return { packages_r: [], packages_python: [] };
  }
}
