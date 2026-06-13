import { AnimatedTAGProps } from "@lib/types";
import { motion } from "motion/react";

export default function AnimatedText({
  variants,
  className,
  children,
  infinity,
}: AnimatedTAGProps) {
  return (
    <motion.p
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !infinity }}
      variants={variants}
      className={className}
    >
      {children}
    </motion.p>
  );
}
