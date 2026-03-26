import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    void request;
    throw new ApiError(
      "FORBIDDEN",
      "Organization creation is disabled in single-organization mode"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
