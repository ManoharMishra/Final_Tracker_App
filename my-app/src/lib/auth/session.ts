import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "karya_session";
export const SESSION_USER_HEADER = "x-user-id";
export const SESSION_ORG_HEADER = "x-org-id";
export const SESSION_EXPIRES_HEADER = "x-session-expires-at";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type SessionTokenPayload = {
  sub: string;
  orgId: string;
  iat: number;
  exp: number;
  v: 1;
};

type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

export type SessionData = {
  userId: string;
  orgId: string;
  expiresAt: string;
};

function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (process.env.NODE_ENV !== "production") {
    return "dev-only-session-secret-change-me";
  }

  throw new Error("SESSION_SECRET is required in production");
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeJson(value: object) {
  return toBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string) {
  return JSON.parse(decoder.decode(fromBase64Url(value))) as T;
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

async function signValue(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function toSessionData(payload: SessionTokenPayload): SessionData {
  return {
    userId: payload.sub,
    orgId: payload.orgId,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export async function createSessionToken(session: {
  userId: string;
  orgId: string;
  ttlSeconds?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = {
    sub: session.userId,
    orgId: session.orgId,
    iat: now,
    exp: now + (session.ttlSeconds ?? SESSION_TTL_SECONDS),
    v: 1,
  };

  const header: JwtHeader = {
    alg: "HS256",
    typ: "JWT",
  };

  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signValue(signingInput);

  return {
    token: `${signingInput}.${signature}`,
    session: toSessionData(payload),
  };
}

export async function verifySessionToken(token: string): Promise<SessionData | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = await signValue(`${encodedHeader}.${encodedPayload}`);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const header = decodeJson<JwtHeader>(encodedHeader);
    const payload = decodeJson<SessionTokenPayload>(encodedPayload);

    if (header.alg !== "HS256" || header.typ !== "JWT" || payload.v !== 1) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return toSessionData(payload);
  } catch {
    return null;
  }
}

export function applySessionCookie(response: NextResponse, token: string, expiresAt: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function getSessionFromRequest(request: NextRequest) {
  const userId = request.headers.get(SESSION_USER_HEADER);
  const orgId = request.headers.get(SESSION_ORG_HEADER);
  const expiresAt = request.headers.get(SESSION_EXPIRES_HEADER);

  if (userId && orgId && expiresAt) {
    return { userId, orgId, expiresAt } satisfies SessionData;
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export async function getServerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function withSessionHeaders(request: NextRequest, session: SessionData) {
  const headers = new Headers(request.headers);
  headers.set(SESSION_USER_HEADER, session.userId);
  headers.set(SESSION_ORG_HEADER, session.orgId);
  headers.set(SESSION_EXPIRES_HEADER, session.expiresAt);
  return headers;
}

export function isPublicApiRoute(pathname: string, method: string) {
  if (pathname === "/api/auth/login" && method === "POST") {
    return true;
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    return true;
  }

  if (pathname === "/api/auth/session" && method === "GET") {
    return true;
  }

  if (pathname === "/api/setup/status" && method === "GET") {
    return true;
  }

  if (pathname === "/api/users" && method === "POST") {
    return true;
  }

  if (pathname.startsWith("/api/invite/") && method === "GET") {
    return true;
  }

  if (pathname === "/api/invite/register" && method === "POST") {
    return true;
  }

  return false;
}

export function isProtectedAppPath(pathname: string) {
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return false;
  }

  if (pathname === "/" || pathname === "/login" || pathname === "/setup") {
    return false;
  }

  if (pathname.startsWith("/api")) {
    return false;
  }

  return true;
}