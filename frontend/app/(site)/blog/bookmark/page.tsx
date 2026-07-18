import type { Metadata } from "next";
import BookmarkList from "./BookmarkList";

export const metadata: Metadata = {
  title: "Bookmarked Blog Posts",
  description: "Your bookmarked blog posts from The SDV Blog",
};

export default function BookmarkPage() {
  return <BookmarkList />;
}
