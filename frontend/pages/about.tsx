import MDXContent from "@lib/MDXContent";
import pageMeta from "@content/meta";
import { PostType } from "@lib/types";
import StaticPage from "@components/StaticPage";
import Contact from "@components/Contact";
import { motion } from "framer-motion";
import { FadeContainer, opacityVariant } from "@content/FramerMotionVariants";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";

export default function About({
  about,
}: {
  about: PostType;
}) {
  return (
    <>
      <StaticPage metadata={pageMeta.about} page={about} />

      <div className="relative max-w-4xl mx-auto dark:bg-darkPrimary dark:text-gray-100 2xl:max-w-5xl 3xl:max-w-7xl">
        <Contact />
      </div>
    </>
  );
}

export async function getStaticProps() {
  const { post: about } = await new MDXContent("static_pages").getPostFromSlug(
    "about"
  );

  return {
    props: {
      about,
    },
  };
}
