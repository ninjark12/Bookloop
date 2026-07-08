import "server-only";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Features } from "@/lib/features";

const client = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-2" });

export type TaggingJob = {
  entryId: string;
  content: string;
};

/**
 * Fire-and-forget enqueue of a journal entry for async taxonomy tagging +
 * embedding by the tagger Lambda. No-op when the pipeline isn't configured
 * (Features.tagging false). Never throws — tagging is best-effort and must not
 * block or fail an entry write.
 */
export function enqueueForTagging(entryId: string, content: string): void {
  if (!Features.tagging) return;
  const QueueUrl = process.env.BOOKLOOP_TAGGING_QUEUE_URL;
  if (!QueueUrl) return;

  void client
    .send(
      new SendMessageCommand({
        QueueUrl,
        MessageBody: JSON.stringify({ entryId, content } satisfies TaggingJob),
      })
    )
    .catch((e) => console.error("[tagging] enqueue failed:", e));
}
