import { z } from "zod";

export const createDecisionSchema = z.object({
  thread_id: z.string().uuid("thread_id must be a valid UUID"),
  content: z.string().trim().min(1, "content is required"),
  source_message_id: z.string().uuid("source_message_id must be a valid UUID").optional(),
  is_ai_generated: z.boolean().default(false),
});

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;

export const getDecisionsSchema = z.object({
  thread_id: z.string().uuid("thread_id must be a valid UUID"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetDecisionsInput = z.infer<typeof getDecisionsSchema>;
