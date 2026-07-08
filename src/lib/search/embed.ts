import "server-only";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { redis } from "@/lib/redis";
import { CacheKeys } from "@/lib/cache-keys";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-2" });

/** Embed a search query via Titan. Returns 1536-dim vector. Redis-cached 24h. */
export async function embedQuery(text: string): Promise<number[]> {
  const cacheKey = CacheKeys.searchEmbedding(text);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    /* miss */
  }

  const response = await client.send(
    new InvokeModelCommand({
      modelId: process.env.SEARCH_EMBEDDING_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        // Titan Text Embeddings V2 supports 256/512/1024 (not 1536). Must match
        // the vector(1024) column + the tagger Lambda's embedding dimension.
        inputText: text.slice(0, 8000),
        dimensions: 1024,
        normalize: true,
      }),
    })
  );

  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  const embedding: number[] = parsed.embedding;

  try {
    await redis.set(cacheKey, JSON.stringify(embedding), "EX", 60 * 60 * 24);
  } catch {
    /* non-fatal */
  }

  return embedding;
}
