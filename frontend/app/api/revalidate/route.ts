import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/** On-demand revalidation. FROZEN contract: ?secret=&revalidateUrl= */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json(
      {
        message:
          "Invalid token alert! It looks like you're trying to sneak in without proper authorization. Please present a valid token or face rejection",
      },
      { status: 401 }
    );
  }

  const target = url.searchParams.get("revalidateUrl") ?? "/";
  try {
    revalidatePath(target);
    return NextResponse.json({ revalidated: true });
  } catch {
    return new NextResponse("Error revalidating", { status: 500 });
  }
}
