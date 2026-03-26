import { z } from "zod";

export const metadataSchema = z.object({
  mentions: z.array(z.string().uuid("mentions must contain valid UUIDs")).default([]),
  attachments: z.array(z.string().uuid("attachments must contain valid UUIDs")).default([]),
});

export const createMessageSchema = z.object({
  thread_id: z.string().uuid("thread_id must be a valid UUID"),
  content: z.string().trim().min(1, "content is required"),
  metadata: metadataSchema.optional().default({
    mentions: [],
    attachments: [],
  }),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const getMessagesSchema = z.object({
  thread_id: z.string().uuid("thread_id must be a valid UUID"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
