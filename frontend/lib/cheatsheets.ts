/**
 * Static map from package-card title → bundled cheat-sheet PDF under
 * `public/cheatsheets/`. Titles are matched case-insensitively on their
 * alphanumeric characters only, so "cfbfastR", "cfbfastr" and "cfbfastR "
 * all resolve. Packages without a sheet simply render no download button —
 * add a PDF + one entry here to light one up (no DB change needed).
 */

const CHEATSHEETS: Record<string, string> = {
  sportsdataversepy: "sportsdataverse-py.pdf",
  sportsdataversejs: "sportsdataverse-js.pdf",
  sportsdataverse: "sportsdataverse-R.pdf",
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

export function cheatsheetHref(title: unknown): string | null {
  const key = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const file = CHEATSHEETS[key];
  return file ? `/cheatsheets/${file}` : null;
}
