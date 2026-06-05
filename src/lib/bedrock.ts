import "server-only";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

// Singleton — one client instance reused across requests in the same Lambda container
const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-2",
});

const MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// Returns 2-3 vague thematic tags for a spoilered journal entry.
// Never throws — returns [] on any failure so the feed always loads.
export async function getSpoilerTags(content: string): Promise<string[]> {
  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              {
                text: [
                  "A reader wrote this journal entry about a book.",
                  "Generate 2-3 very short spoiler warning tags that hint at the themes or emotions",
                  "WITHOUT revealing specific plot details — think vague mood labels a reader would",
                  "appreciate as a heads-up before deciding whether to peek.",
                  "",
                  "Good examples: \"a character faces a loss\", \"a major revelation\", \"a relationship changes\"",
                  "Bad examples: \"John dies\", \"the murderer is revealed to be Sarah\"",
                  "",
                  "Return ONLY a JSON array of strings. No explanation, no markdown.",
                  "",
                  "Entry:",
                  content.slice(0, 1200),
                ].join("\n"),
              },
            ],
          },
        ],
        inferenceConfig: { maxTokens: 120, temperature: 0.3 },
      })
    );

    const text = response.output?.message?.content?.[0]?.text ?? "[]";
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
      return parsed.slice(0, 3);
    }
    return [];
  } catch (e) {
    console.error("[getSpoilerTags] Bedrock call failed:", e);
    return [];
  }
}
