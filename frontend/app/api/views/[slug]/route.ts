import { NextResponse } from "next/server";

/**
 * This function handles HTTP requests made to a specific route. It takes in a "slug" parameter from the request query.
 *
 * If the request method is GET, it calls the getViewBySlug(slug) function, which retrieves the view count of the specified blog post by its slug value.
 * If the view count is not found, it sends a response with a status code of 404 and a JSON object with a message of "Slug not found"
 * If the view count is found, it sends a response with a status code of 200 and the data in JSON format.
 *
 * If the request method is POST and the app is running in production environment, it calls the addView(slug) function,
 * which adds a view to the specified blog post. It sends a response with the status code and data returned from the addView function.
 *
 * If the request method is POST and the app is running in development environment, it sends a response with a status code of 401 and a JSON object with a message of "In Development, Can't add views"
 */

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  // Imported lazily so the module-scope Supabase client in @lib/supabase is
  // only created at request time, never during `next build` page-data collection.
  const { getViewBySlug } = await import("@lib/supabase");
  const { slug } = await ctx.params;
  const data = await getViewBySlug(slug);
  if (data === undefined) {
    return NextResponse.json(
      {
        message:
          "Sorry, the slug you're looking for has gone for a coffee break. Please try again later or make a cup of tea while you wait.",
      },
      { status: 404 }
    );
  } else {
    return NextResponse.json(data, { status: 200 });
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  // Imported lazily so the module-scope Supabase client in @lib/supabase is
  // only created at request time, never during `next build` page-data collection.
  const { addView } = await import("@lib/supabase");
  const { slug } = await ctx.params;
  // check if the app in the production and req method is post only then add the view to the database
  if (process.env.NODE_ENV === "production") {
    const supabaseResponse = await addView(slug);
    // Supabase returns status 0 on a failed request (and addView can return
    // undefined if it threw). `res.status(0)` / `res.status(undefined)` crash
    // with ERR_HTTP_INVALID_STATUS_CODE, so clamp to a valid HTTP status:
    // pass through a real 1xx–5xx code, otherwise treat it as a 500.
    const status = supabaseResponse?.status;
    const httpStatus =
      typeof status === "number" && status >= 100 && status <= 599
        ? status
        : 500;
    return NextResponse.json(
      supabaseResponse ?? { message: "View could not be recorded." },
      { status: httpStatus }
    );
  } else {
    return NextResponse.json(
      {
        message: "In Development, Can't add views",
      },
      { status: 401 }
    );
  }
}
