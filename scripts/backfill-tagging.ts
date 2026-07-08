// One-off script: enqueue existing journal entries for taxonomy tagging +
// embedding by the tagger Lambda. Targets entries that haven't been embedded
// yet, so it is safe to re-run (already-processed entries are skipped).
//
// Requires the same env the app uses: DATABASE_URL, AWS_* creds, and
// BOOKLOOP_TAGGING_QUEUE_URL. The AWS user must have sqs:SendMessage on the
// queue (same permission the app needs to enqueue).
//
// Run with:  npm run db:backfill-tagging

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import postgres from "postgres";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";

const DATABASE_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL / DIRECT_URL not set");

const QUEUE_URL = process.env.BOOKLOOP_TAGGING_QUEUE_URL;
if (!QUEUE_URL) throw new Error("BOOKLOOP_TAGGING_QUEUE_URL not set");

const MIN_CONTENT_LEN = 20;
const SQS_BATCH = 10; // SendMessageBatch hard limit
const BATCH_DELAY_MS = 200; // gentle pacing so the Lambda doesn't stampede Bedrock

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1 });
const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-2" });

type Row = { id: string; content: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  // Not-yet-embedded entries with enough content to tag. Re-running only
  // picks up whatever the Lambda hasn't finished.
  const rows = await sql<Row[]>`
    SELECT id, content
    FROM journal_entries
    WHERE embedding IS NULL
      AND char_length(trim(content)) >= ${MIN_CONTENT_LEN}
    ORDER BY created_at ASC
  `;

  if (rows.length === 0) {
    console.log("Nothing to backfill — all entries are embedded (or too short).");
    await sql.end();
    return;
  }

  console.log(`Enqueuing ${rows.length} entr${rows.length === 1 ? "y" : "ies"} for tagging…\n`);

  let sent = 0;
  let failed = 0;

  for (const batch of chunk(rows, SQS_BATCH)) {
    const res = await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: QUEUE_URL,
        Entries: batch.map((r, i) => ({
          Id: String(i),
          MessageBody: JSON.stringify({ entryId: r.id, content: r.content }),
        })),
      })
    );

    sent += res.Successful?.length ?? 0;
    for (const f of res.Failed ?? []) {
      failed++;
      console.error(`  send failed (${f.Code}): ${f.Message}`);
    }
    process.stdout.write(`  ${sent}/${rows.length} enqueued\r`);
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n\nDone — ${sent} enqueued, ${failed} failed.`);
  console.log("The Lambda will process them; watch /aws/lambda/bookloop-tagger logs.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
