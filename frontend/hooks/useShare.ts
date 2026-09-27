import { useEffect, useState } from "react";
function useShare() {
  // state for share supports
  const [isShareSupported, setIsShareSupported] = useState(false);

  // checking if that exist or not
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator is unavailable during SSR; read after mount
    setIsShareSupported(() => ("share" in navigator ? true : false));
  }, []);

  return { isShareSupported };
}

export default useShare;
