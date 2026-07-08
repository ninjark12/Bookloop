import "server-only";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { redis } from "@/lib/redis";
import { CacheKeys } from "@/lib/cache-keys";
import { parseQuery } from "./parser";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-2" });

export type QueryExpansion = {
  tags: string[]; // taxonomy tags inferred from the NL query
  semanticQuery: string; // enriched text to embed for vector search
};

const EXPAND_TOOL = {
  toolSpec: {
    name: "expand_search_query",
    description:
      "Convert a natural language reading-journal search into tags and an enriched semantic query.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              "0-5 namespace:value tags from the controlled vocabulary that match the query intent. Empty array if none clearly apply.",
          },
          semanticQuery: {
            type: "string",
            description:
              "The query rewritten as a dense set of semantically related terms for embedding-based retrieval. 10-25 words.",
          },
        },
        required: ["tags", "semanticQuery"],
      },
    },
  },
};

const SYSTEM = `You convert reading-journal search queries into structured search parameters.

The journal contains entries about books (fiction, manga, academic papers).
Tags use namespace:value format. Only use tags from this vocabulary:

type: reflection, quote, summary, prediction, critique, connection, question, note, analysis, character-study
theme: betrayal, redemption, sacrifice, power, identity, loss, found-family, revenge, coming-of-age, war, love, mortality, freedom, justice, isolation, corruption, loyalty, hope, survival, fate, ambition, honor, truth, cycle, transformation
emotion: grief, joy, rage, dread, awe, hope, melancholy, catharsis, tension, relief, confusion, excitement, frustration, satisfaction, heartbreak, wonder, fear, nostalgia, numbness
plot: twist, revelation, death, battle, reunion, sacrifice, betrayal-event, transformation, confrontation, discovery, escape, loss
tone: dark, hopeful, bittersweet, comedic, tragic, tense, melancholic, ominous, cathartic, satirical
claim: thesis, hypothesis, counterargument, assumption, conclusion, definition, analogy, caveat
evidence: empirical, statistical, anecdotal, citation, case-study, experiment, theoretical, historical, comparative
discipline: economics, philosophy, history, cs, psychology, sociology, biology, political-science, law, anthropology, linguistics, mathematics, physics, education, medicine
concept: (open -- coin from query, lowercase-hyphenated, e.g. concept:socialism)
character: (open -- coin from query if a character is named, e.g. character:guts)

Rules:
- Only add a tag when the query CLEARLY implies it. Fewer, more confident tags beat many weak ones.
- "quotes" implies type:quote. "predictions"/"theories" imply type:prediction.
- Named concepts (socialism, opportunity cost) become concept: tags.
- The semanticQuery should expand the topic with related vocabulary likely to
  appear in journal entries about it. Do not include tag syntax in semanticQuery.`;

export async function expandQuery(naturalLanguage: string): Promise<QueryExpansion> {
  const cacheKey = CacheKeys.searchExpansion(naturalLanguage);

  // Redis cache first (graceful if Redis down)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    /* cache miss path */
  }

  const response = await client.send(
    new ConverseCommand({
      modelId: process.env.SEARCH_EXPANSION_MODEL_ID,
      system: [{ text: SYSTEM }],
      messages: [{ role: "user", content: [{ text: naturalLanguage }] }],
      toolConfig: {
        tools: [EXPAND_TOOL],
        toolChoice: { tool: { name: "expand_search_query" } },
      },
      inferenceConfig: { maxTokens: 300, temperature: 0 },
    })
  );

  const toolBlock = response.output?.message?.content?.find((b) => b.toolUse);
  if (!toolBlock?.toolUse?.input) {
    // Degrade gracefully: no tags, embed the raw query
    return { tags: [], semanticQuery: naturalLanguage };
  }

  const expansion = toolBlock.toolUse.input as QueryExpansion;

  // Validate tags against parser namespaces (defense against model drift)
  const validated = (expansion.tags ?? []).filter(
    (t) => parseQuery(t).includeTags.length === 1
  );

  const result: QueryExpansion = {
    tags: validated,
    semanticQuery: expansion.semanticQuery || naturalLanguage,
  };

  try {
    await redis.set(cacheKey, JSON.stringify(result), "EX", 60 * 60 * 24); // 24h
  } catch {
    /* non-fatal */
  }

  return result;
}
