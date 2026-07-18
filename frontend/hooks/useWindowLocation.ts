import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type URL = string;

// next/navigation (not next/router) so the hook works under both routers
// during the App Router migration.
export default function useWindowLocation() {
  const [currentURL, setCurrentURL] = useState<URL>("");
  const pathname = usePathname();

  useEffect(() => {
    setCurrentURL(window.location.href);
  }, [pathname]);

  return { currentURL };
}
