# Bookloop tagger

SQS-triggered Lambda that tags + embeds journal entries via Bedrock, writing
`journal_entry_tags` and `journal_entries.embedding` (+ `processing_status`).

```
app: POST /api/journal  --enqueueForTagging-->  SQS  -->  Lambda (this)
                                                           |-- Bedrock Claude Haiku -> tags
                                                           |-- Bedrock Titan        -> embedding
                                                           `-- Postgres (Supabase)  -> write
```

Taxonomy + prompt design live in `../booklooptag.md`. The `0003` migration must
already be applied (it is).

## One-time prerequisites

1. **Bedrock model access** — AWS console, region `us-east-2`, Bedrock → Model
   access, enable (this is NOT created by Terraform — it's an account-level grant):
   - Anthropic Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`)
     — likely already on, since the spoiler feature uses it.
   - **Amazon Titan Text Embeddings V2** (`amazon.titan-embed-text-v2:0`) — the
     new one the tagger needs for embeddings; enable it.
2. **Provisioning credentials** — Terraform needs an AWS identity that can create
   IAM/Lambda/SQS. Your app's Bedrock-only user is not enough; use an admin
   profile (`AWS_PROFILE=...`) for the apply.
3. **Tooling** — Terraform ≥ 1.5 and Node ≥ 20. (No `zip` CLI needed — Terraform
   builds the package via the `archive_file` data source.)

## Deploy

```bash
cd tagger

# 1. Install the Lambda's prod deps so Terraform can zip them in.
(cd function && npm install --omit=dev)

# 2. Provision SQS + Lambda + IAM. Terraform zips function/ -> build/tagger.zip.
#    Pass the Supabase pooler URL. Region defaults to us-east-2.
terraform init
terraform apply -var "database_url=postgresql://postgres:...@...pooler.supabase.com:6543/postgres"

# 3. Wire the app to the queue. Copy the output:
#    queue_url = "https://sqs.us-east-2.amazonaws.com/<acct>/bookloop-tagging"
#    Set it as BOOKLOOP_TAGGING_QUEUE_URL in .env.local AND in Vercel, then redeploy.
```

Once `BOOKLOOP_TAGGING_QUEUE_URL` is set, `Features.tagging` flips on and new
entries (>= 20 chars) are enqueued automatically on save.

## Redeploying just the code

After editing `function/index.mjs`:

```bash
terraform apply -var "database_url=..."
```

The `archive_file` re-zips and `source_code_hash` changes, so Terraform
re-uploads automatically.

## Backfilling existing entries

Entries created before the pipeline have `processing_status='pending'` and no
tags/embedding. Enqueue them by selecting their `id` + `content` and sending one
SQS message each (a small script against the queue), or re-save them.

## Notes

- **Retries / DLQ:** failures return `ReportBatchItemFailures`; SQS retries up to
  3× then routes to `bookloop-tagging-dlq`. Failed entries are marked
  `processing_status='failed'`.
- **Connection:** uses the Supabase transaction pooler (`prepare:false`), which
  is the right choice for Lambda concurrency.
- **Cost:** one Haiku call + one Titan call per entry, only on save.
