import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { requireOrgContext } from "@/lib/auth/org-context";
import { generateUploadUrl } from "../../../../services/attachment.service";

const uploadUrlSchema = z
  .object({
    org_id: z.string().uuid("org_id must be a valid UUID"),
    file_name: z.string().trim().min(1, "file_name is required"),
    file_type: z.string().trim().min(1, "file_type is required"),
    file_size: z.coerce.number().int().positive("file_size must be a positive integer"),
    entity_type: z.enum(["thread", "message", "task"]),
    entity_id: z.string().uuid("entity_id must be a valid UUID"),
    thread_id: z.string().uuid("thread_id must be a valid UUID").optional(),
    message_id: z.string().uuid("message_id must be a valid UUID").optional(),
    task_id: z.string().uuid("task_id must be a valid UUID").optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    await requireApiSession(request);
    const org_id = await requireOrgContext(request);

    const body = await request.json();
    const parsed = uploadUrlSchema.safeParse({
      ...body,
      org_id,
    });

    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const data = await generateUploadUrl(parsed.data);
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
