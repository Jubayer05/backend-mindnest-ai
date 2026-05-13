import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { authClient } from "../../lib/auth.js";

// ─── Header Helpers ───────────────────────────────────────────────────────────

export function getHeadersFromRequest(
  req: ExpressRequest,
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      const headerValue = Array.isArray(value) ? value[0] : value;
      if (headerValue) {
        headers[key.toLowerCase()] = headerValue;
      }
    }
  }

  // Reconstruct cookie header from parsed cookies if raw header is missing
  if (
    "cookies" in req &&
    req.cookies &&
    Object.keys(req.cookies as Record<string, string>).length > 0
  ) {
    const cookieString = Object.entries(req.cookies as Record<string, string>)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    headers["cookie"] = headers["cookie"]
      ? `${headers["cookie"]}; ${cookieString}`
      : cookieString;
  }

  return headers;
}

export function getHeadersAsWebHeaders(
  req: ExpressRequest,
): globalThis.Headers {
  return new globalThis.Headers(getHeadersFromRequest(req));
}

export function forwardSetCookie(
  res: ExpressResponse,
  headers: globalThis.Headers | undefined,
): void {
  if (!headers) return;

  // Node/undici Headers exposes getSetCookie(); fall back to get("set-cookie")
  const anyHeaders = headers as globalThis.Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies: string[] =
    (typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : null) ??
    (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);

  if (setCookies.length > 0) {
    res.setHeader("Set-Cookie", setCookies);
  }
}

const MINDNEST_USER_COOKIE = "mindnest-user";
const SESSION_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

function getSetCookieValues(
  headers: globalThis.Headers | undefined,
): string[] {
  if (!headers) return [];

  const anyHeaders = headers as globalThis.Headers & {
    getSetCookie?: () => string[];
  };

  return (
    (typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : null) ??
    (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : [])
  );
}

function sessionEndFromSetCookie(headers: globalThis.Headers | undefined): Date | null {
  const setCookies = getSetCookieValues(headers);
  const sessionCookie = setCookies.find((cookie) =>
    cookie.startsWith("mindnest.session_token="),
  );

  if (!sessionCookie) return null;

  const maxAgeMatch = sessionCookie.match(/(?:^|;\s*)Max-Age=(\d+)/i);
  if (maxAgeMatch) {
    const seconds = Number(maxAgeMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(Date.now() + seconds * 1000);
    }
  }

  const expiresMatch = sessionCookie.match(/(?:^|;\s*)Expires=([^;]+)/i);
  const expiresValue = expiresMatch?.[1];
  if (expiresValue) {
    const parsed = new Date(expiresValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function sessionEndFromLoginBody(body: unknown): Date | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const session = (body as { session?: { expiresAt?: unknown } }).session;
  if (!session || typeof session !== "object") {
    return null;
  }
  const ea = session.expiresAt;
  let d: Date;
  if (ea instanceof Date) {
    d = ea;
  } else if (typeof ea === "number") {
    const ms = ea < 1_000_000_000_000 ? ea * 1000 : ea;
    d = new Date(ms);
  } else if (typeof ea === "string") {
    d = new Date(ea);
  } else {
    return null;
  }
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

/** Mirrors the frontend middleware cookie: `{ user, sessionExpiresAt }` with Max-Age in ms (Express), aligned with Better Auth session. */
export function setMindnestUserCookie(
  res: ExpressResponse,
  loginResponseBody: unknown,
  headers?: globalThis.Headers,
): void {
  if (!loginResponseBody || typeof loginResponseBody !== "object") return;
  if (!("user" in loginResponseBody)) return;
  const user = (loginResponseBody as { user: unknown }).user;
  if (!user || typeof user !== "object") return;

  const fromSetCookie = sessionEndFromSetCookie(headers);
  const fromBody = sessionEndFromLoginBody(loginResponseBody);
  const end =
    fromSetCookie ??
    fromBody ??
    new Date(Date.now() + SESSION_FALLBACK_MS);
  const maxAgeMs = end.getTime() - Date.now();
  if (maxAgeMs <= 0) return;

  const payload = {
    user,
    sessionExpiresAt: end.toISOString(),
  };

  const secure = process.env.NODE_ENV === "production";

  res.cookie(MINDNEST_USER_COOKIE, JSON.stringify(payload), {
    path: "/",
    maxAge: maxAgeMs,
    httpOnly: false,
    sameSite: "lax",
    secure,
  });
}

export function clearMindnestUserCookie(res: ExpressResponse): void {
  const secure = process.env.NODE_ENV === "production";
  res.clearCookie(MINDNEST_USER_COOKIE, {
    path: "/",
    sameSite: "lax",
    secure,
  });
}

// ─── Auth Services ────────────────────────────────────────────────────────────

export const registerService = async (
  payload: unknown,
  headers: globalThis.Headers,
) => {
  return authClient.api.signUpEmail({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: payload as any,
    headers,
    returnHeaders: true,
  });
};

export const loginService = async (
  payload: unknown,
  headers: globalThis.Headers,
) => {
  return authClient.api.signInEmail({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: payload as any,
    headers,
    returnHeaders: true,
  });
};

export const verifyEmailService = async (
  payload: { email: string; callbackURL?: string },
  headers: globalThis.Headers,
) => {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const callbackURL = payload.callbackURL ?? `${frontendUrl}/auth/verify-email`;

  return authClient.api.sendVerificationEmail({
    body: { email: payload.email, callbackURL },
    headers,
    returnHeaders: true,
  });
};

export const forgotPasswordService = async (
  payload: { email: string },
  headers: globalThis.Headers,
) => {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const redirectTo = `${frontendUrl}/auth/reset-password`;

  return authClient.api.requestPasswordReset({
    body: { email: payload.email, redirectTo },
    headers,
    returnHeaders: true,
  });
};

export const resetPasswordService = async (
  payload: unknown,
  headers: globalThis.Headers,
) => {
  return authClient.api.resetPassword({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: payload as any,
    headers,
    returnHeaders: true,
  });
};

export const updatePasswordService = async (
  payload: { newPassword: string; currentPassword: string },
  headers: globalThis.Headers,
) => {
  if (!payload.newPassword || !payload.currentPassword) {
    throw new Error("newPassword and currentPassword are required");
  }

  // Strip authorization header – session cookie is the source of truth
  headers.delete("authorization");

  return authClient.api.changePassword({
    body: payload,
    headers,
    returnHeaders: true,
  });
};

export const logoutService = async (headers: globalThis.Headers) => {
  return authClient.api.signOut({
    headers,
    returnHeaders: true,
  });
};
