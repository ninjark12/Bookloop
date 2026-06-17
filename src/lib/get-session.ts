import { cache } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// React cache() dedupes calls within a single render — layout + page + nested
// server components all share one lookup. secondaryStorage in auth.ts handles
// the cross-request Redis layer.
export const getSession = cache(async () => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    console.error("[getSession] session lookup failed, treating as unauthenticated:", e);
    return null;
  }
});
