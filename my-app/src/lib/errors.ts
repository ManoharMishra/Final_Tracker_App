// lib/errors.ts

export type ErrorCode =
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: unknown[];

  constructor(code: ErrorCode, message: string, details: unknown[] = []) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "ApiError";

    switch (code) {
      case "UNAUTHORIZED":
        this.statusCode = 401;
        break;
      case "BAD_REQUEST":
      case "VALIDATION_ERROR":
        this.statusCode = 400;
        break;
      case "FORBIDDEN":
        this.statusCode = 403;
        break;
      case "NOT_FOUND":
        this.statusCode = 404;
        break;
      case "CONFLICT":
        this.statusCode = 409;
        break;
      default:
        this.statusCode = 500;
    }
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(error.toJSON(), { status: error.statusCode });
  }

  // Prisma known request errors (duck-typed to avoid tight coupling in this layer)
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;

    if (code === "P2002") {
      return Response.json(
        {
          error: {
            code: "CONFLICT",
            message: "Duplicate record",
            details: [],
          },
        },
        { status: 409 }
      );
    }

    if (code === "P2003") {
      return Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid related resource reference",
            details: [],
          },
        },
        { status: 400 }
      );
    }
  }

  console.error("Unhandled error:", error);

  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        details: [],
      },
    },
    { status: 500 }
  );
}
