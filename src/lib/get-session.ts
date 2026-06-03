import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * Safe wrapper around auth.api.getSession for use in Server Components and
 * Route Handlers. Returns null instead of throwing when the session cookie
 * references a DB row that no longer exists (expired + purged), or when the
 * database is momentarily unreachable.
 *
 * Usage (replaces the raw auth.api.getSession call on every page):
 *
 *   import { getSession } from "@/lib/get-session";
 *   const session = await getSession();
 *   if (!session) redirect("/sign-in");
 */
export async function getSession() {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    console.error("[getSession] session lookup failed  treating as unauthenticated:", e);
    return null;
  }
}
