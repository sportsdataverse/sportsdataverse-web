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
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
