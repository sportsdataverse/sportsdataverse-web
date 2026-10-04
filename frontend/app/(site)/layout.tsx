import SiteNav from "@components/site/SiteNav";
import SiteFooter from "@components/site/SiteFooter";
import Ticker from "@components/site/Ticker";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <Ticker />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <SiteFooter />
    </div>
  );
}
