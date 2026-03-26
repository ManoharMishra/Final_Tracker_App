import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  getSessionFromRequest,
  isProtectedAppPath,
  isPublicApiRoute,
  withSessionHeaders,
} from "@/lib/auth/session";

function unauthorizedApiResponse() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "No active session",
        details: [],
      },
    },
    { status: 401 }
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSessionFromRequest(request);

  if (pathname.startsWith("/api")) {
    if (isPublicApiRoute(pathname, request.method)) {
      if (!session) {
        return NextResponse.next();
      }

      return NextResponse.next({
        request: {
          headers: withSessionHeaders(request, session),
        },
      });
    }

    if (!session) {
      return unauthorizedApiResponse();
    }

    return NextResponse.next({
      request: {
        headers: withSessionHeaders(request, session),
      },
    });
  }

  if (isProtectedAppPath(pathname) && !session) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    clearSessionCookie(response);
    return response;
  }

  if (!session) {
    return NextResponse.next();
  }

  return NextResponse.next({
    request: {
      headers: withSessionHeaders(request, session),
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};