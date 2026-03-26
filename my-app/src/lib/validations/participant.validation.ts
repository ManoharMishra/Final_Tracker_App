// lib/validations/participant.validation.ts

import { z } from "zod";

// ─── Shared param schemas ───────────────────────────────────────────────────

export const threadIdParamSchema = z.object({
  threadId: z.string().uuid("threadId must be a valid UUID"),
});

export const participantParamsSchema = z.object({
  threadId: z.string().uuid("threadId must be a valid UUID"),
  userId: z.string().uuid("userId must be a valid UUID"),
});

// ─── Add Participant ────────────────────────────────────────────────────────

export const addParticipantSchema = z.object({
  user_id: z.string().uuid("user_id must be a valid UUID"),
  role: z.enum(["owner", "member"]).default("member"),
});

export type AddParticipantInput = z.infer<typeof addParticipantSchema>;

// ─── Get Participants (query params) ────────────────────────────────────────

export const getParticipantsQuerySchema = z.object({
  // Identity is sourced from x-user-id header.
});

export type GetParticipantsQuery = z.infer<typeof getParticipantsQuerySchema>;

// ─── Remove Participant ─────────────────────────────────────────────────────

export const removeParticipantSchema = z.object({
  // Identity is sourced from x-user-id header.
});

export type RemoveParticipantInput = z.infer<typeof removeParticipantSchema>;

// ─── Update Last Read ───────────────────────────────────────────────────────

export const updateLastReadSchema = z.object({
  // Identity is sourced from x-user-id header.
});

export type UpdateLastReadInput = z.infer<typeof updateLastReadSchema>;
