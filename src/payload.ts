import { z } from "zod";

export const webhookPayloadSchema = z.object({
  push_data: z.object({
    tag: z.string().min(1)
  }),
  repository: z.object({
    repo_name: z.string().min(1)
  })
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
