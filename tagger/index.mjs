// Bookloop tagger Lambda
// -----------------------
// SQS-triggered. For each { entryId, content } message:
//   1. mark the entry processing
//   2. ask Bedrock (Claude Haiku) for taxonomy tags via a tool call
//   3. normalize (synonyms), validate against tag_taxonomy, apply implications
//   4. insert journal_entry_tags (source='bedrock', verified=false)
//   5. embed the content via Titan, write journal_entries.embedding
//   6. mark the entry done (or failed)
//
// Canonical taxonomy + prompt design: booklooptag.md.

import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import postgres from "postgres";

const REGION = process.env.AWS_REGION ?? "us-east-2";
const TAGGER_MODEL_ID = process.env.TAGGER_MODEL_ID ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const EMBEDDING_MODEL_ID = process.env.EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0";
const MAX_TAGS = 12;

const bedrock = new BedrockRuntimeClient({ region: REGION });

// One pooled connection, reused across warm invocations. Uses the Supabase
// transaction pooler URL; prepare:false is required for pgBouncer.
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const OPEN_NAMESPACES = new Set(["character", "concept"]);

// --- Taxonomy cache (loaded once per warm container) ---
let taxonomyCache = null;

async function loadTaxonomy() {
  if (taxonomyCache) return taxonomyCache;

  const [taxRows, synRows, implRows] = await Promise.all([
    sql`SELECT namespace, name, mode FROM tag_taxonomy WHERE name <> '__open__'`,
    sql`SELECT alias, canonical_tag FROM tag_synonyms`,
    sql`SELECT antecedent, consequent FROM tag_implications`,
  ]);

  const validTags = new Set(taxRows.map((r) => `${r.namespace}:${r.name}`));
  const namespaces = new Set(taxRows.map((r) => r.namespace).concat([...OPEN_NAMESPACES]));

  // Vocabulary string for the prompt, grouped by namespace.
  const byNs = new Map();
  for (const r of taxRows) {
    if (!byNs.has(r.namespace)) byNs.set(r.namespace, []);
    byNs.get(r.namespace).push(r.name);
  }
  const vocab = [...byNs.entries()]
    .map(([ns, names]) => `${ns}: ${names.join(", ")}`)
    .join("\n");

  const synonyms = new Map(synRows.map((r) => [r.alias.toLowerCase(), r.canonical_tag]));
  const implications = new Map();
  for (const r of implRows) {
    if (!implications.has(r.antecedent)) implications.set(r.antecedent, []);
    implications.get(r.antecedent).push(r.consequent);
  }

  taxonomyCache = { validTags, namespaces, vocab, synonyms, implications };
  return taxonomyCache;
}

const TAG_TOOL = {
  toolSpec: {
    name: "tag_entry",
    description: "Assign taxonomy tags to a reading-journal entry.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["narrative", "academic", "hybrid"],
            description: "Whether the entry is about fiction/narrative or academic material.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              "namespace:value tags from the controlled vocabulary. Always include one mode: tag and at least one type: tag. Max 12.",
          },
        },
        required: ["mode", "tags"],
      },
    },
  },
};

function systemPrompt(vocab) {
  return `You are a reading-journal tagger. Given a journal entry, extract structured
tags from the taxonomy below and call the tag_entry tool.

Rules:
- Always include exactly one mode: tag (narrative, academic, or hybrid).
- Always include at least one type: tag.
- Narrative entries: add theme:, emotion:, and character: tags where present.
- Academic entries: add claim:, evidence:, and concept: tags where present.
- Use only tags from the controlled vocabulary for controlled namespaces.
- For open namespaces (character:, concept:), coin values from the content,
  lowercase with hyphens, no punctuation. e.g. character:guts, concept:hegemony.
- Do not invent values for controlled namespaces.
- Maximum ${MAX_TAGS} tags. Prefer specific, confident tags over many weak ones.

Controlled vocabulary:
${vocab}`;
}

async function getTagsFromBedrock(content, tax) {
  const res = await bedrock.send(
    new ConverseCommand({
      modelId: TAGGER_MODEL_ID,
      system: [{ text: systemPrompt(tax.vocab) }],
      messages: [{ role: "user", content: [{ text: content.slice(0, 6000) }] }],
      toolConfig: { tools: [TAG_TOOL], toolChoice: { tool: { name: "tag_entry" } } },
      inferenceConfig: { maxTokens: 500, temperature: 0 },
    })
  );

  const block = res.output?.message?.content?.find((b) => b.toolUse);
  const input = block?.toolUse?.input;
  if (!input) return [];

  const raw = Array.isArray(input.tags) ? input.tags : [];
  if (input.mode) raw.push(`mode:${input.mode}`);
  return normalizeTags(raw, tax);
}

function normalizeTags(raw, tax) {
  const out = new Set();

  for (let tag of raw) {
    if (typeof tag !== "string") continue;
    tag = tag.trim().toLowerCase();

    // Synonym mapping (alias -> canonical)
    if (tax.synonyms.has(tag)) tag = tax.synonyms.get(tag);

    const idx = tag.indexOf(":");
    if (idx <= 0) continue;
    const ns = tag.slice(0, idx);
    const name = tag.slice(idx + 1).replace(/\s+/g, "-");
    if (!name || !tax.namespaces.has(ns)) continue;

    const full = `${ns}:${name}`;
    // Controlled namespaces must exist in the taxonomy; open ones are free.
    if (!OPEN_NAMESPACES.has(ns) && !tax.validTags.has(full)) continue;
    out.add(full);
  }

  // Apply implications (antecedent present -> add consequent)
  for (const tag of [...out]) {
    const consequents = tax.implications.get(tag);
    if (consequents) for (const c of consequents) out.add(c);
  }

  return [...out].slice(0, MAX_TAGS);
}

async function embed(content) {
  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: content.slice(0, 8000), dimensions: 1536, normalize: true }),
    })
  );
  const parsed = JSON.parse(new TextDecoder().decode(res.body));
  return parsed.embedding;
}

async function processEntry(entryId, content) {
  const tax = await loadTaxonomy();
  await sql`UPDATE journal_entries SET processing_status = 'processing' WHERE id = ${entryId}`;

  const tags = await getTagsFromBedrock(content, tax);

  if (tags.length > 0) {
    const rows = tags.map((t) => {
      const idx = t.indexOf(":");
      return { entry_id: entryId, tag: t, namespace: t.slice(0, idx), name: t.slice(idx + 1) };
    });
    await sql`
      INSERT INTO journal_entry_tags ${sql(rows, "entry_id", "tag", "namespace", "name")}
      ON CONFLICT (entry_id, tag) DO NOTHING
    `;
  }

  const vector = await embed(content);
  const literal = `[${vector.join(",")}]`;
  await sql`
    UPDATE journal_entries
    SET embedding = ${literal}::vector, processing_status = 'done'
    WHERE id = ${entryId}
  `;
}

export const handler = async (event) => {
  const batchItemFailures = [];

  for (const record of event.Records ?? []) {
    let entryId;
    try {
      const body = JSON.parse(record.body);
      entryId = body.entryId;
      if (!entryId || !body.content) continue;
      await processEntry(entryId, body.content);
    } catch (err) {
      console.error(`[tagger] failed for entry ${entryId ?? "?"}:`, err);
      if (entryId) {
        try {
          await sql`UPDATE journal_entries SET processing_status = 'failed' WHERE id = ${entryId}`;
        } catch {}
      }
      // Return as a batch failure so SQS retries (then routes to the DLQ).
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
