import { IoIosArrowUp } from "react-icons/io";
import { useEffect, useState } from "react";
import useScrollPercentage from "@hooks/useScrollPercentage";

export default function ScrollToTopButton() {
  const [showButton, setShowButton] = useState(false);
  const scrollPercentage = useScrollPercentage();

  useEffect(() => {
    if (scrollPercentage < 95 && scrollPercentage > 10) {
      setShowButton(true);
    } else {
      setShowButton(false);
    }
  }, [scrollPercentage]);

  // This function will scroll the window to the top
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth", // for smoothly scrolling
    });
  };

  return (
    <>
      {showButton && (
        <button
          onClick={scrollToTop}
          aria-label="Scroll To Top"
          className="group fixed bottom-20 right-8 z-40 print:hidden md:bottom-[50px] md:right-[20px] md:mr-10"
        >
          <IoIosArrowUp className="rounded-xl bg-primary p-1 text-[45px] text-primary-foreground shadow-lg transition-all duration-200 hover:bg-accent group-hover:-translate-y-0.5 group-hover:shadow-xl" />
        </button>
      )}
    </>
  );
}
