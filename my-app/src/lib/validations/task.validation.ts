import { z } from "zod";

export const taskStatusSchema = z.enum(["open", "in_progress", "done"]);

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "title is required").max(200),
    thread_id: z.string().uuid("thread_id must be a valid UUID").optional(),
    source_message_id: z
      .string()
      .uuid("source_message_id must be a valid UUID")
      .optional(),
    assigned_to: z
      .string()
      .uuid("assigned_to must be a valid UUID")
      .optional(),
  })
  .refine(
    (data) =>
      data.thread_id !== undefined || data.source_message_id !== undefined,
    { message: "At least one of thread_id or source_message_id is required" }
  );

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const getTasksSchema = z.object({
  thread_id: z.string().uuid("thread_id must be a valid UUID"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetTasksInput = z.infer<typeof getTasksSchema>;

export const updateTaskStatusSchema = z.object({
  task_id: z.string().uuid("task_id must be a valid UUID"),
  status: taskStatusSchema,
});

export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
