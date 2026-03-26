// lib/validations/thread.validation.ts

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const ThreadTypeEnum = z.enum(["private", "team", "org"]);
export const ThreadStatusEnum = z.enum(["open", "dormant", "converted"]);

// ─── Create Thread ──────────────────────────────────────────────────────────

export const createThreadSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must not exceed 200 characters"),
  type: ThreadTypeEnum,
  goal: z
    .string()
    .max(500, "Goal must not exceed 500 characters")
    .nullish()
    .transform((v) => v ?? null),
  org_id: z.string().uuid("org_id must be a valid UUID"),
  created_by: z.string().uuid("created_by must be a valid UUID"),
  // For team threads: the team this thread is shared with
  team_id: z.string().uuid("team_id must be a valid UUID").optional(),
  // For private threads: additional member IDs to share with
  participant_ids: z.array(z.string().uuid()).optional(),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;

// ─── List Threads ───────────────────────────────────────────────────────────

export const listThreadsSchema = z.object({
  org_id: z.string().uuid("org_id is required and must be a valid UUID"),
  user_id: z.string().uuid("user_id is required and must be a valid UUID"),
  status: ThreadStatusEnum.optional(),
  type: ThreadTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListThreadsInput = z.infer<typeof listThreadsSchema>;

// ─── Get Thread By ID ───────────────────────────────────────────────────────

export const threadIdParamSchema = z.object({
  threadId: z.string().uuid("threadId must be a valid UUID"),
});

// ─── Update Thread ──────────────────────────────────────────────────────────

export const updateThreadSchema = z
  .object({
    title: z
      .string()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must not exceed 200 characters")
      .optional(),
    goal: z
      .string()
      .max(500, "Goal must not exceed 500 characters")
      .nullable()
      .optional(),
    status: ThreadStatusEnum.optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.goal !== undefined ||
      data.status !== undefined,
    { message: "At least one field (title, goal, status) must be provided" }
  );

export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;

// ─── Update context (includes actor for event creation) ─────────────────────

export const updateThreadRequestSchema = z.object({
  title: z
    .string()
    .min(3)
    .max(200)
    .optional(),
  goal: z
    .string()
    .max(500)
    .nullable()
    .optional(),
  status: ThreadStatusEnum.optional(),
  updated_by: z.string().uuid("updated_by must be a valid UUID"),
});

export type UpdateThreadRequestInput = z.infer<typeof updateThreadRequestSchema>;

// ─── Delete Thread context ──────────────────────────────────────────────────

export const deleteThreadRequestSchema = z.object({
  deleted_by: z.string().uuid("deleted_by must be a valid UUID"),
});

export type DeleteThreadRequestInput = z.infer<typeof deleteThreadRequestSchema>;
