import { auth } from "@lib/auth";
import AdminTabs from "./AdminTabs";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.role !== "admin") {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <p className="font-display text-sm font-bold uppercase tracking-wide">Admins only</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This area needs the org admin role.
        </p>
      </div>
    );
  }
  return (
    <>
      <AdminTabs />
      {children}
    </>
  );
}
