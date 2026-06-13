import { ToastContainer } from "react-toastify";
import { useDarkMode } from "@context/darkModeContext";

export default function Newsletter() {
  const { isDarkMode } = useDarkMode();

  return (
    <>
      <iframe
        title="SportsDataverse newsletter"
        className="my-10 flex w-full flex-col gap-4 rounded-lg bg-white p-4 font-barlow ring-1 ring-primary/20 dark:bg-black dark:ring-primary/30 print:hidden"
        src="https://saiemgilani.substack.com/embed"
        width="480"
        height="320"
      ></iframe>

      <ToastContainer
        theme={isDarkMode ? "dark" : "light"}
        style={{ zIndex: 1000 }}
        autoClose={3000}
      />
    </>
  );
}
