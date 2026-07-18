import { motion } from "motion/react";
import { AnimatedTAGProps } from "@lib/types";

/**
 * Animated heading with a configurable level. Defaults to h2 — a page gets
 * exactly one h1, owned by its title component (PageHeader / PageTop / hero).
 */
export default function AnimatedHeading({
  variants,
  className,
  children,
  infinity,
  as = "h2",
}: AnimatedTAGProps & { as?: "h1" | "h2" | "h3" }) {
  const Tag = motion[as];
  return (
    <Tag
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !infinity }}
      variants={variants}
      className={className}
    >
      {children}
    </Tag>
  );
}
