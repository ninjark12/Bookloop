import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { ValidationError } from "@/lib/db/validate";
import { VALID_NAMESPACES } from "@/lib/search/parser";
import {
  entryBelongsToUser,
  getEntryTags,
  addEntryTag,
  removeEntryTag,
} from "@/lib/db/journal";

export const dynamic = "force-dynamic";

const NAMESPACES = new Set<string>(VALID_NAMESPACES);

/** Normalize + validate a "namespace:name" tag against the taxonomy namespaces. */
function normalizeTag(raw: unknown): string {
  if (typeof raw !== "string") throw new ValidationError("tag is required");
  const tag = raw.trim().toLowerCase();
  const colonIdx = tag.indexOf(":");
  if (colonIdx <= 0) throw new ValidationError("tag must be 'namespace:name'");
  const namespace = tag.slice(0, colonIdx);
  const name = tag.slice(colonIdx + 1).replace(/\s+/g, "-");
  if (!NAMESPACES.has(namespace)) throw new ValidationError(`Unknown namespace: ${namespace}`);
  if (!name) throw new ValidationError("tag name is required");
  return `${namespace}:${name}`;
}

// Owner-only for phase 1 (refactor.md note). 404 hides existence from non-owners.
async function requireOwnEntry(entryId: string, userId: string) {
  if (!(await entryBelongsToUser(entryId, userId))) {
    throw new NotFound();
  }
}

class NotFound extends Error {}

export const GET = withAuth(async (_req, session, params) => {
  try {
    await requireOwnEntry(params.entryId, session.user.id);
  } catch (e) {
    if (e instanceof NotFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
  const tags = await getEntryTags(params.entryId);
  return NextResponse.json({ tags });
});

export const POST = withAuth(async (req, session, params) => {
  try {
    await requireOwnEntry(params.entryId, session.user.id);
  } catch (e) {
    if (e instanceof NotFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
  const body = await req.json().catch(() => ({}));
  const tag = normalizeTag(body.tag);
  await addEntryTag(params.entryId, tag);
  const tags = await getEntryTags(params.entryId);
  return NextResponse.json({ tags });
});

export const DELETE = withAuth(async (req, session, params) => {
  try {
    await requireOwnEntry(params.entryId, session.user.id);
  } catch (e) {
    if (e instanceof NotFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
  const url = new URL(req.url);
  const tag = url.searchParams.get("tag");
  if (!tag) throw new ValidationError("tag query param is required");
  await removeEntryTag(params.entryId, tag.toLowerCase());
  const tags = await getEntryTags(params.entryId);
  return NextResponse.json({ tags });
});
