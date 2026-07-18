import {
  fromLeftVariant,
  opacityVariant,
} from "@content/FramerMotionVariants";
import AnimatedHeading from "./FramerMotion/AnimatedHeading";
import AnimatedText from "./FramerMotion/AnimatedText";

export default function PageTop({
  pageTitle,
  headingClass,
  containerClass,
  children,
}: {
  pageTitle: string;
  headingClass?: string;
  containerClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`w-full flex flex-col gap-3 py-5 select-none mb-10 ${containerClass}`}
    >
      <AnimatedHeading
        as="h1"
        variants={fromLeftVariant}
        className={`text-4xl  md:text-5xl font-bold text-foreground ${headingClass}`}
      >
        {pageTitle}
      </AnimatedHeading>
      <span
        aria-hidden
        className="block h-1 w-16 rounded-full bg-score"
      />
      <AnimatedText
        variants={opacityVariant}
        className="text-lg text-muted-foreground"
      >
        {children}
      </AnimatedText>
    </div>
  );
}
