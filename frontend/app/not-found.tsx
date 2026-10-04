import Link from "next/link";
import SiteNav from "@components/site/SiteNav";
import SiteFooter from "@components/site/SiteFooter";

// The root not-found renders above the (site) layout, so it brings its own nav and footer.
// No Ticker here: it reads Mongo, and a 404 should not.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center focus:outline-none"
      >
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Page not found
        </h1>
        <p className="max-w-md text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back home
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
