/**
 * Central feature availability. Each flag reflects whether the required
 * infrastructure is configured. Routes and components gate on these
 * instead of checking env vars inline.
 *
 * Server-only: env vars without NEXT_PUBLIC_ are not available client-side.
 * For client components that need a flag, pass it as a prop from a server
 * component or include it in an API response.
 */
export const Features = {
  /** Gator author-news microservice. */
  gator: !!process.env.GATOR_URL,
  /** Resend email (password reset, bug reports, streak reminders). */
  email: !!process.env.RESEND_API_KEY,
  /**
   * Semantic search (requires Bedrock access + tagged/embedded entries).
   * See semantic-search.md — the /api/search route gates on this.
   */
  search: !!process.env.SEARCH_EXPANSION_MODEL_ID && !!process.env.AWS_ACCESS_KEY_ID,
} as const;

// NOTE: refactor.md proposed a `tagging` flag keyed on BOOKLOOP_TAGGING_QUEUE_URL
// (an SQS pipeline). This codebase computes spoiler tags inline via Bedrock
// (see src/lib/bedrock.ts + /api/journal), so there is no such queue. Reintroduce
// a `tagging` flag here if/when the async tagging pipeline lands.
