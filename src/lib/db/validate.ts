const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Better Auth user IDs are arbitrary text; book/entry IDs are UUIDs. */
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/** Throws a typed error the route wrapper converts to 400. */
export class ValidationError extends Error {
  status = 400;
}

export function assertUuid(v: string, label = "id"): void {
  if (!isUuid(v)) throw new ValidationError(`Invalid ${label}`);
}
