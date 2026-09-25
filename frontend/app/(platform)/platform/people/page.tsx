import type { Metadata } from "next";
import PeopleClient from "./PeopleClient";

export const metadata: Metadata = { title: "People" };

export default function PlatformAdminPeoplePage() {
  return <PeopleClient />;
}
