import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ data: { logged_out: true } });
  clearSessionCookie(response);
  return response;
}