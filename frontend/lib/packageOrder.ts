// R packages currently on CRAN, checked against cloud.r-project.org/src/contrib/PACKAGES
// on 2026-09-30. Update when a package is accepted or archived.
export const CRAN_PACKAGES = new Set([
  "baseballr",
  "cfbfastR",
  "cfbseedR",
  "fastRhockey",
  "hoopR",
  "mlbplotR",
  "oddsapiR",
  "sportyR",
  "wehoop",
]);

type Listed = { title?: unknown; repoType?: unknown };

const onCran = (p: Listed) => p.repoType === "R" && CRAN_PACKAGES.has(String(p.title ?? ""));

/** CRAN's DOI for a package on CRAN (it resolves to the CRAN page), else null. */
export function cranDoiHref(p: Listed): string | null {
  return onCran(p) ? `https://doi.org/10.32614/CRAN.package.${String(p.title)}` : null;
}

/**
 * Directory order within a language section: the flagship sportsdataverse*
 * packages, then R packages on CRAN, then the rest; alphabetical within each.
 */
export function packageOrder(a: Listed, b: Listed): number {
  const tier = (p: Listed) => {
    const title = String(p.title ?? "");
    if (title.toLowerCase().startsWith("sportsdataverse")) return 0;
    return onCran(p) ? 1 : 2;
  };
  return tier(a) - tier(b) || String(a.title ?? "").localeCompare(String(b.title ?? ""));
}
