"use client";

import { usePlausible } from "next-plausible";
import type { ComponentProps } from "react";

type Props = ComponentProps<"a"> & {
  event: "follow_click" | "support_click";
  platform: string;
  placement: string;
};

/** External link that reports { platform, placement } to Plausible on click. */
export default function TrackedLink({ event, platform, placement, children, onClick, ...rest }: Props) {
  const plausible = usePlausible();
  return (
    <a
      {...rest}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        onClick?.(e);
        plausible(event, { props: { platform, placement } });
      }}
    >
      {children}
    </a>
  );
}
