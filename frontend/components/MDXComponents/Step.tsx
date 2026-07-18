import React from "react";

export default function Step({
  id,
  children,
}: {
  id: string;
  children?: JSX.Element;
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        children?.type === undefined && "my-5"
      }`}
    >
      <div className="flex items-center justify-center w-10 h-10 p-5 font-bold text-secondary-foreground bg-secondary rounded-full ring ring-border ">
        {id}
      </div>
      <div className="flex-grow-0 text-lg font-semibold tracking-tight text-foreground w-fit">
        {children}
      </div>
    </div>
  );
}
