import { homeProfileImage } from "@utils/utils";
import { useEffect } from "react";
import BlogLayout from "@layout/BlogLayout";
import Metadata from "@components/MetaData";
import MDXComponents from "@components/MDXComponents";
import PageNotFound from "pages/404";
import MDXContent from "@lib/MDXContent";
import { MDXRemote } from "next-mdx-remote";
import { GetStaticPropsContext } from "next";
import { PostType } from "@lib/types";
import type { PostNavLink } from "@components/PostNavigation";

export default function Post({
  post,
  error,
  prev,
  next,
}: {
  post: PostType | null;
  error: boolean;
  prev: PostNavLink;
  next: PostNavLink;
}) {
  // Register a view for this post (no-op until the post is available).
  useEffect(() => {
    if (!post) return;
    fetch(`/api/views/${post.meta.slug}`, { method: "POST" });
  }, [post]);

  if (error || !post) return <PageNotFound />;

  const authorName = post.meta.author?.name  ? post.meta.author.name : "SportsDataverse Contributor";
  const authorPicture = post.meta.author?.picture ? post.meta.author.picture : homeProfileImage;
  return (
    <>
      <Metadata
        title={post.meta.title}
        suffix="Saiem Gilani"
        authorName={authorName}
        description={post.meta.excerpt}
        previewImage={post.meta.image}
        keywords={post.meta.keywords}
      />

      <BlogLayout post={post} prev={prev} next={next}>
        <MDXRemote
          {...post.source}
          frontmatter={{
            slug: post.meta.slug,
            excerpt: post.meta.excerpt,
            author: post.meta.author,
            title: post.meta.title,
            date: post.meta.date,
            keywords: post.meta.keywords,
            image: post.meta.image,
          }}
          components={MDXComponents}
        />
      </BlogLayout>
    </>
  );
}

type StaticProps = GetStaticPropsContext & {
  params: {
    slug: string;
  };
};

export async function getStaticProps({ params }: StaticProps) {
  const { slug } = params;
  const content = new MDXContent("posts");
  const { post } = await content.getPostFromSlug(slug);

  if (post != null) {
    const { prev, next } = content.getAdjacentPosts(slug);
    return {
      props: {
        error: false,
        post,
        prev,
        next,
      },
    };
  } else {
    return {
      props: {
        error: true,
        post: null,
        prev: null,
        next: null,
      },
    };
  }
}

export async function getStaticPaths() {
  const paths = new MDXContent("posts")
    .getSlugs()
    .map((slug) => ({ params: { slug } }));

  return {
    paths,
    fallback: false,
  };
}
