import { useRef, useState } from "react";
import { ToastContainer, toast, useToast } from "react-toastify";
import { AiOutlineSend } from "react-icons/ai";
import { useDarkMode } from "@context/darkModeContext";

export default function Newsletter() {
  const { isDarkMode } = useDarkMode();
  const [email, setEmail] = useState("");

  async function subscribeNewsLetter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      fetch('/api/newsletter', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
        })
      });
    } catch (error) {
      console.log(error);
    }
    toast.success("You have been added to my mailing list.");
    setEmail("");
  }

  return (
    <>

      <iframe className="flex flex-col w-full gap-4 p-4 my-10 bg-white rounded-lg font-barlow ring-2 ring-gray-400 dark:bg-black dark:border-neutral-600 print:hidden" src="https://saiemgilani.substack.com/embed" width="480" height="320"></iframe>

      <ToastContainer
        theme={isDarkMode ? "dark" : "light"}
        style={{ zIndex: 1000 }}
        autoClose={3000}
      />
    </>
  );
}
