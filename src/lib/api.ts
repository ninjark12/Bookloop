import { NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { ValidationError } from "@/lib/db/validate";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

type AuthedHandler = (
  req: Request,
  session: Session,
  params: Record<string, string>
) => Promise<Response>;

type PublicHandler = (
  req: Request,
  session: Session | null,
  params: Record<string, string>
) => Promise<Response>;

/**
 * Wraps a route handler with session check + error boundary.
 * Returns 401 if no session. Returns 400 on ValidationError, 500 on
 * uncaught errors.
 */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, context?: { params: Promise<Record<string, string>> }) => {
    try {
      const session = await getSession();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const params = context?.params ? await context.params : {};
      return await handler(req, session, params);
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      console.error(`[API ERROR] ${req.method} ${req.url}:`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/**
 * Same error boundary but session is optional (for public/anonymous routes).
 */
export function withOptionalAuth(handler: PublicHandler) {
  return async (req: Request, context?: { params: Promise<Record<string, string>> }) => {
    try {
      const session = await getSession();
      const params = context?.params ? await context.params : {};
      return await handler(req, session, params);
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      console.error(`[API ERROR] ${req.method} ${req.url}:`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
