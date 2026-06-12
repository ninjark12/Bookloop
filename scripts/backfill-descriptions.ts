// One-off script: fetch descriptions from OpenLibrary for every book in the
// DB that has an ol_key but no description yet, then save them back.
//
// Run with:  npm run db:backfill-descriptions

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import postgres from "postgres";

const DATABASE_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL / DIRECT_URL not set");

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1 });

const OL_TIMEOUT_MS = 5000;
const RATE_LIMIT_MS = 300; // stay polite to OL

type OLDescription = string | { value: string } | undefined | null;

async function fetchDescription(olKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OL_TIMEOUT_MS);
  try {
    const res = await fetch(`https://openlibrary.org${olKey}.json`, {
      signal: controller.signal,
      headers: { "User-Agent": "Bookloop/1.0 (bookloop.sh)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { description?: OLDescription };
    const desc = data.description;
    if (!desc) return null;
    if (typeof desc === "string") return desc;
    if (typeof desc === "object" && desc.value) return desc.value;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const rows = await sql<{ id: string; ol_key: string; title: string }[]>`
    SELECT id, ol_key, title
    FROM books
    WHERE ol_key IS NOT NULL
      AND description IS NULL
    ORDER BY created_at ASC
  `;

  if (rows.length === 0) {
    console.log("All books already have descriptions (or no ol_key). Nothing to do.");
    await sql.end();
    return;
  }

  console.log(`Found ${rows.length} book(s) to backfill.\n`);

  let filled = 0;
  let skipped = 0;

  for (const row of rows) {
    process.stdout.write(`  "${row.title}" … `);
    const desc = await fetchDescription(row.ol_key);
    if (desc) {
      await sql`UPDATE books SET description = ${desc} WHERE id = ${row.id}`;
      console.log("✓");
      filled++;
    } else {
      console.log("(no description on OL)");
      skipped++;
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`\nDone — ${filled} filled, ${skipped} skipped.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
