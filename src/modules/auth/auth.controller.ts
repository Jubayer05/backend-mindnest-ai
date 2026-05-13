import type { Request, Response } from "express";
import { authClient } from "../../lib/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  clearMindnestUserCookie,
  forgotPasswordService,
  forwardSetCookie,
  getHeadersAsWebHeaders,
  loginService,
  logoutService,
  registerService,
  resetPasswordService,
  setMindnestUserCookie,
  updatePasswordService,
  verifyEmailService,
} from "./auth.service.js";

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    if (typeof email !== "string" || email.trim() === "") {
      res.status(400).json({
        error: "Registration failed",
        message: "Email is required",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      res.status(409).json({
        error: "Registration failed",
        message: "This email is already registered. Please sign in instead.",
      });
      return;
    }

    const allowedRoles = new Set(["ADMIN", "MEMBER", "COACH"]);
    const upper = typeof role === "string" ? role.trim().toUpperCase() : "";
    const normalizedRole = allowedRoles.has(upper) ? upper : "MEMBER";

    const result = await registerService(
      {
        name,
        email: normalizedEmail,
        password,
        role: normalizedRole,
      },
      getHeadersAsWebHeaders(req),
    );
    res.status(201).json({
      message:
        "Registration successful. Please check your email to verify your account.",
      data: result.response,
    });
  } catch (error: unknown) {
    console.error("Register error:", error);
    const message =
      error instanceof Error ? error.message : "Registration failed";
    const normalizedMessage = message.toLowerCase();

    if (
      normalizedMessage.includes("already exists") ||
      normalizedMessage.includes("already registered") ||
      normalizedMessage.includes("user already exists") ||
      normalizedMessage.includes("email already")
    ) {
      res.status(409).json({
        error: "Registration failed",
        message: "This email is already registered. Please sign in instead.",
      });
      return;
    }

    res.status(500).json({ error: "Registration failed", message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const result = await loginService(req.body, getHeadersAsWebHeaders(req));
    forwardSetCookie(res, result.headers);
    setMindnestUserCookie(res, result.response, result.headers);
    res
      .status(200)
      .json({ message: "Login successful", data: result.response });
  } catch (error: unknown) {
    console.error("Login error:", error);
    const message = error instanceof Error ? error.message : "Login failed";
    res.status(500).json({ error: "Login failed", message });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const result = await verifyEmailService(
      req.body as { email: string; callbackURL?: string },
      getHeadersAsWebHeaders(req),
    );
    forwardSetCookie(res, result.headers);
    res.status(200).json({
      message: "Verification email sent successfully",
      data: result.response,
    });
  } catch (error: unknown) {
    console.error("Verify email error:", error);
    const message =
      error instanceof Error ? error.message : "Verify email failed";
    res.status(500).json({ error: "Verify email failed", message });
  }
};

export const verifyEmailCallback = async (req: Request, res: Response) => {
  try {
    const token =
      typeof req.query.token === "string" ? req.query.token : undefined;

    if (!token) {
      res.status(400).send(
        `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px;">
          <h2>Missing token</h2>
          <p>The verification link is missing the required token.</p>
        </body></html>`,
      );
      return;
    }

    await authClient.api.verifyEmail({
      query: { token },
    });

    res.status(200).send(
      `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px;">
        <h2>Email verified successfully</h2>
        <p>You can now log in using your email and password.</p>
      </body></html>`,
    );
  } catch (error: unknown) {
    console.error("Verify email callback error:", error);
    const message =
      error instanceof Error ? error.message : "Verification failed";
    res.status(500).send(
      `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px;">
        <h2>Email verification failed</h2>
        <p>${message}</p>
      </body></html>`,
    );
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const result = await forgotPasswordService(
      req.body as { email: string },
      getHeadersAsWebHeaders(req),
    );
    res.status(200).json({
      message: "Password reset email sent successfully",
      data: result.response,
    });
  } catch (error: unknown) {
    console.error("Forgot password error:", error);
    const message =
      error instanceof Error ? error.message : "Forgot password failed";
    res.status(500).json({ error: "Forgot password failed", message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const result = await resetPasswordService(
      req.body,
      getHeadersAsWebHeaders(req),
    );
    forwardSetCookie(res, result.headers);
    res
      .status(200)
      .json({ message: "Password reset successfully", data: result.response });
  } catch (error: unknown) {
    console.error("Reset password error:", error);
    const message =
      error instanceof Error ? error.message : "Reset password failed";
    res.status(500).json({ error: "Reset password failed", message });
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res
        .status(400)
        .json({ error: "currentPassword and newPassword are required" });
      return;
    }

    const result = await updatePasswordService(
      { currentPassword, newPassword },
      getHeadersAsWebHeaders(req),
    );
    forwardSetCookie(res, result.headers);
    res.status(200).json({
      message: "Password updated successfully",
      data: result.response,
    });
  } catch (error: unknown) {
    console.error("Update password error:", error);

    const err = error as {
      statusCode?: number;
      status?: string;
      message?: string;
    };
    if (err.statusCode === 401 || err.status === "UNAUTHORIZED") {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid session or current password",
      });
      return;
    }

    res.status(500).json({
      error: "Update password failed",
      message: err.message ?? "Unknown error",
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const result = await logoutService(getHeadersAsWebHeaders(req));
    forwardSetCookie(res, result.headers);
    clearMindnestUserCookie(res);
    res
      .status(200)
      .json({ message: "Logged out successfully", data: result.response });
  } catch (error: unknown) {
    console.error("Logout error:", error);
    const message = error instanceof Error ? error.message : "Logout failed";
    res.status(500).json({ error: "Logout failed", message });
  }
};
