import { AnimatedTAGProps } from "@lib/types";
import { motion } from "motion/react";

export default function AnimatedDiv({
  variants,
  className,
  children,
  infinity,
}: AnimatedTAGProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !infinity }}
      variants={variants}
      className={className}
      // style={style}
      transition={{ staggerChildren: 0.5 }}
    >
      {children}
    </motion.div>
  );
}
