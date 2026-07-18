import { NextResponse } from "next/server";

/**
 * This function handles HTTP requests made to a specific route.
 * If the request method is GET, it calls the getAllViews() function, which retrieves all views count and all blog post from the database
 * and sends the result as a JSON object in the response with a status code of 200.
 * If the request method is not GET, it sends a response with a status code of 405 and a JSON object with a message of "Invalid method use GET"
 */
export async function GET() {
  // Imported lazily so the module-scope Supabase client in @lib/supabase is
  // only created at request time, never during `next build` page-data collection.
  const { getAllViews } = await import("@lib/supabase");
  return NextResponse.json(await getAllViews(), { status: 200 });
}
