import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type URL = string;

// next/navigation (not next/router) so the hook works under both routers
// during the App Router migration.
export default function useWindowLocation() {
  const [currentURL, setCurrentURL] = useState<URL>("");
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window is unavailable during SSR; read after mount
    setCurrentURL(window.location.href);
  }, [pathname]);

  return { currentURL };
}
