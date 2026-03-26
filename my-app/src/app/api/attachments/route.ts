import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listAttachments, saveAttachment } from "../../../services/attachment.service";

const createAttachmentSchema = z
  .object({
    org_id: z.string().uuid("org_id must be a valid UUID"),
    file_name: z.string().trim().min(1, "file_name is required"),
    file_type: z.string().trim().min(1, "file_type is required"),
    file_size: z.coerce.number().int().positive("file_size must be a positive integer"),
    file_url: z
      .string()
      .trim()
      .min(1, "file_url is required")
      .refine(
        (value) => /^https?:\/\//i.test(value) || value.startsWith("/"),
        "file_url must be a valid URL"
      ),
    entity_type: z.enum(["thread", "message", "task"]),
    entity_id: z.string().uuid("entity_id must be a valid UUID"),
    thread_id: z.string().uuid("thread_id must be a valid UUID").optional(),
    message_id: z.string().uuid("message_id must be a valid UUID").optional(),
    task_id: z.string().uuid("task_id must be a valid UUID").optional(),
  })
  .strict();

const listAttachmentsSchema = z
  .object({
    org_id: z.string().uuid("org_id must be a valid UUID"),
    entity_type: z.enum(["thread", "message", "task"]).optional(),
    entity_id: z.string().uuid("entity_id must be a valid UUID").optional(),
    thread_id: z.string().uuid("thread_id must be a valid UUID").optional(),
    message_id: z.string().uuid("message_id must be a valid UUID").optional(),
    task_id: z.string().uuid("task_id must be a valid UUID").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).default(20),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const org_id = await requireOrgContext(request);

    const body = await request.json();

    console.log("API HIT:", "/api/attachments");
    console.log("USER:", session.userId);
    console.log("ORG:", org_id);

    if (!body?.file_url) {
      throw new ApiError("BAD_REQUEST", "file_url is required");
    }

    if (!body?.entity_type) {
      throw new ApiError("BAD_REQUEST", "entity_type is required");
    }

    const parsed = createAttachmentSchema.safeParse({
      ...body,
      org_id,
    });

    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const data = await saveAttachment(parsed.data, session.userId);
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const org_id = await requireOrgContext(request);

    const { searchParams } = new URL(request.url);
    console.log("API HIT:", "/api/attachments");
    console.log("USER:", session.userId);
    console.log("ORG:", org_id);

    const parsed = listAttachmentsSchema.safeParse({
      org_id,
      entity_type: searchParams.get("entity_type"),
      entity_id: searchParams.get("entity_id"),
      thread_id: searchParams.get("thread_id") ?? undefined,
      message_id: searchParams.get("message_id") ?? undefined,
      task_id: searchParams.get("task_id") ?? undefined,
      page: searchParams.get("page") ?? "1",
      limit: searchParams.get("limit") ?? "20",
    });

    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid query parameters",
        parsed.error.issues
      );
    }

    const result = await listAttachments(parsed.data, session.userId);
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
