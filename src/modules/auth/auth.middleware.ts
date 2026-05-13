import type {
  NextFunction as ExpressNextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { authClient } from "../../lib/auth.js";

// ─── Request type augmentation ────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
      session?: {
        id: string;
        userId: string;
      };
    }
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildWebHeaders(req: ExpressRequest): globalThis.Headers {
  const headers = new globalThis.Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
  }

  // Reconstruct cookie header from cookie-parser output when the raw header is absent
  if (
    !headers.get("cookie") &&
    "cookies" in req &&
    req.cookies &&
    Object.keys(req.cookies as Record<string, string>).length > 0
  ) {
    const cookieString = Object.entries(req.cookies as Record<string, string>)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers.set("cookie", cookieString);
  }

  return headers;
}

// ─── Authentication middleware ────────────────────────────────────────────────

export const authenticate = async (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction,
): Promise<void> => {
  try {
    const session = await authClient.api.getSession({
      headers: buildWebHeaders(req),
      query: { disableCookieCache: true },
    });

    if (!session?.session || !session?.user) {
      res
        .status(401)
        .json({ error: "Unauthorized", message: "Invalid or expired session" });
      return;
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string }).role ?? "MEMBER",
    };

    req.session = {
      id: session.session.id,
      userId: session.session.userId,
    };

    next();
  } catch (error: unknown) {
    console.error("Authentication error:", error);
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    res.status(401).json({ error: "Unauthorized", message });
  }
};

// ─── Authorization middleware ─────────────────────────────────────────────────

/** Attaches `req.user` when a valid session exists; never returns 401 (for optional AI/personalization). */
export const tryAuthenticate = async (
  req: ExpressRequest,
  _res: ExpressResponse,
  next: ExpressNextFunction,
): Promise<void> => {
  try {
    const session = await authClient.api.getSession({
      headers: buildWebHeaders(req),
      query: { disableCookieCache: true },
    });

    if (session?.session && session?.user) {
      req.user = {
        id: session.user.id,
        email: session.user.email,
        role: (session.user as { role?: string }).role ?? "MEMBER",
      };
      req.session = {
        id: session.session.id,
        userId: session.session.userId,
      };
    }
  } catch {
    /* ignore */
  }
  next();
};

export const authorize = (...allowedRoles: string[]) => {
  return (
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNextFunction,
  ): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Access restricted to: ${allowedRoles.join(", ")}`,
      });
      return;
    }

    next();
  };
};
