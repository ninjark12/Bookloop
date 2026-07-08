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

1. **Bedrock model access** — in the AWS console (region `us-east-2` by default),
   Bedrock → Model access, enable:
   - Anthropic Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`)
   - Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`)
2. **Provisioning credentials** — Terraform needs an AWS identity that can create
   IAM/Lambda/SQS. Your app's Bedrock-only user is not enough; use an admin
   profile (`AWS_PROFILE=...`) for the apply.
3. **Tooling** — Terraform ≥ 1.5 and Node ≥ 20.

## Deploy

```bash
cd tagger

# 1. Build the Lambda package (index.mjs + prod deps -> tagger.zip)
npm run package

# 2. Provision SQS + Lambda + IAM. Pass the Supabase pooler URL.
terraform init
terraform apply -var "database_url=postgresql://postgres:...@...pooler.supabase.com:6543/postgres"

# 3. Wire the app to the queue. Copy the output:
#    queue_url = "https://sqs.us-east-2.amazonaws.com/<acct>/bookloop-tagging"
#    Set it as BOOKLOOP_TAGGING_QUEUE_URL in .env.local AND in Vercel, then redeploy.
```

Once `BOOKLOOP_TAGGING_QUEUE_URL` is set, `Features.tagging` flips on and new
entries (>= 20 chars) are enqueued automatically on save.

## Redeploying just the code

After editing `index.mjs`:

```bash
npm run package && terraform apply -var "database_url=..."
```

Terraform re-uploads because `source_code_hash` changes.

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
