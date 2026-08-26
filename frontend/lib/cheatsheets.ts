/**
 * Static map from package-card title → bundled cheat-sheet PDF under
 * `public/cheatsheets/`. Titles are matched case-insensitively on their
 * alphanumeric characters only, so "cfbfastR", "cfbfastr" and "cfbfastR "
 * all resolve. Packages without a sheet simply render no download button —
 * add a PDF + one entry here to light one up (no DB change needed).
 */

const CHEATSHEETS: Record<string, string> = {
  cfbfastr: "cfbfastR.pdf",
  hoopr: "hoopR.pdf",
  wehoop: "wehoop.pdf",
  baseballr: "baseballr.pdf",
  fastrhockey: "fastRhockey.pdf",
  oddsapir: "oddsapiR.pdf",
  sportyr: "sportyR.pdf",
  sportypy: "sportypy.pdf",
  mlbplotr: "mlbplotR.pdf",
  cfbplotr: "cfbplotR-cfb4th-cfbseedR.pdf",
  cfb4th: "cfbplotR-cfb4th-cfbseedR.pdf",
  cfbseedr: "cfbplotR-cfb4th-cfbseedR.pdf",
};

/** Flagship metapackage sheets, one per ecosystem, keyed by card repoType. */
const FLAGSHIP_BY_REPO_TYPE: Record<string, string> = {
  R: "sportsdataverse-R.pdf",
  Python: "sportsdataverse-py.pdf",
  "Node.js": "sportsdataverse-js.pdf",
};

export function cheatsheetHref(title: unknown, repoType?: unknown): string | null {
  const key = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  // The flagship cards all title-start with "sportsdataverse" and only differ
  // by repoType, so the ecosystem — not the title — picks the sheet.
  if (key.startsWith("sportsdataverse")) {
    const flagship = FLAGSHIP_BY_REPO_TYPE[String(repoType ?? "")];
    return flagship ? `/cheatsheets/${flagship}` : null;
  }
  const file = Object.hasOwn(CHEATSHEETS, key) ? CHEATSHEETS[key] : undefined;
  return file ? `/cheatsheets/${file}` : null;
}
