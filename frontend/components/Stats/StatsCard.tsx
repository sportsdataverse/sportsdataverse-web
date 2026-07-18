import { motion } from "motion/react";
import { popUp } from "@content/FramerMotionVariants";

export default function StatsCard({
  title,
  value,
  error,
}: {
  title: string;
  value: string | number | null | undefined;
  error?: boolean;
}) {
  return (
    <motion.div
      className="flex-col justify-center py-4 origin-center transform bg-card border border-border/60 rounded-md shadow-sm select-none px-7 hover:border-border group"
      variants={popUp}
    >
      <p className="my-2 font-display text-4xl font-bold tracking-tight text-foreground">
        {error ? (
          <span className="text-muted-foreground">—</span>
        ) : value != null ? (
          value
        ) : (
          <span className="block h-9 w-28 animate-pulse rounded-sm bg-muted" />
        )}
      </p>
      <p className="text-base font-medium text-muted-foreground group-hover:text-foreground">
        {title}
      </p>
    </motion.div>
  );
}
