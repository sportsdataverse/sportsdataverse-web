"use client";

import { useState, useRef, useEffect, ReactNode } from "react";

const Pre = ({ children }: { children?: ReactNode }) => {
  const textInput = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = () => {
    if (textInput.current !== null) {
      navigator.clipboard
        ?.writeText(textInput.current.textContent!)
        .then(() => {
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {});
    }
  };

  return (
    <div className="group relative mb-3 -mt-2" ref={textInput}>
      {/* Always in the DOM, so touch and keyboard users get it. Where a pointer can hover it stays
          hidden until the block is hovered or the button is focused; on touch it is always shown. */}
      <button
        aria-label="Copy code"
        type="button"
        className={`!z-40 absolute right-2 bottom-[9px] h-8 w-8 rounded border-2 bg-transparent p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 ${
          copied
            ? "border-green-400 focus:border-green-400 focus:outline-none"
            : "border-gray-200/60 "
        }`}
        onClick={onCopy}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          stroke="currentColor"
          fill="none"
          className={copied ? "text-green-400" : "text-gray-200/60"}
        >
          {copied ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          )}
        </svg>
      </button>

      <pre className="blog-pre !my-0 !rounded-md  !w-full !p-0 !py-3 border border-border">
        {children}
      </pre>
    </div>
  );
};

export default Pre;
