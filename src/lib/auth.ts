import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import {
  adminAc,
  defaultRoles,
  userAc,
} from "better-auth/plugins/admin/access";
import { sendResetPasswordEmail, sendVerificationEmail } from "./email.js";
import { prisma } from "./prisma.js";

/**
 * The admin plugin marks `role` as `input: false` (so clients cannot self-assign
 * admin). That merge wins over `user.additionalFields.role`, which breaks signup
 * when the API passes `role`. This plugin runs after admin and re-enables input.
 */
const allowSignupRoleField: BetterAuthPlugin = {
  id: "allow-signup-role-field",
  schema: {
    user: {
      fields: {
        role: {
          type: "string",
          required: false,
          input: true,
        },
      },
    },
  },
};

const googleCreds =
  process.env.GOOGLE_CLIENT_ID?.trim() &&
  process.env.GOOGLE_CLIENT_SECRET?.trim()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID.trim(),
          clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
        },
      }
    : {};

const facebookCreds =
  process.env.FACEBOOK_CLIENT_ID?.trim() &&
  process.env.FACEBOOK_CLIENT_SECRET?.trim()
    ? {
        facebook: {
          clientId: process.env.FACEBOOK_CLIENT_ID.trim(),
          clientSecret: process.env.FACEBOOK_CLIENT_SECRET.trim(),
        },
      }
    : {};

const socialProviders =
  Object.keys(googleCreds).length > 0 || Object.keys(facebookCreds).length > 0
    ? { ...googleCreds, ...facebookCreds }
    : undefined;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  ...(socialProviders ? { socialProviders } : {}),

  trustedOrigins: [
    (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  ],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    sendResetPassword: async (
      {
        user,
        url,
      }: {
        user: { email: string; name?: string | null };
        url: string;
        token: string;
      },
      _request?: Request,
    ) => {
      // Fire-and-forget to avoid timing attacks
      void sendResetPasswordEmail(
        user.email,
        url,
        user.name ?? undefined,
      ).catch((error: unknown) => {
        console.error("Failed to send reset password email:", error);
      });
    },
    onPasswordReset: async (
      { user }: { user: { email: string } },
      _request?: Request,
    ) => {
      console.log(`Password for user ${user.email} has been reset.`);
    },
  },

  emailVerification: {
    sendVerificationEmail: async (
      {
        user,
        token,
      }: {
        user: { email: string; name?: string | null };
        url: string;
        token: string;
      },
      _request?: Request,
    ) => {
      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
      const verificationUrl = `${frontendUrl}/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;

      await sendVerificationEmail(
        user.email,
        verificationUrl,
        user.name ?? undefined,
      );
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string" as const,
        defaultValue: "MEMBER",
        input: true,
        output: true,
      },
    },
  },

  advanced: {
    cookiePrefix: "mindnest",
    defaultCookieAttributes: {
      sameSite: "none" as const,
      secure: true,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },

  plugins: [
    admin({
      // Permission lookup is acRoles[session.user.role] (case-sensitive).
      // defaultRoles only has "admin" and "user"; our DB uses ADMIN/MEMBER/COACH.
      defaultRole: "MEMBER",
      adminRoles: ["admin", "ADMIN"],
      roles: {
        ...defaultRoles,
        ADMIN: adminAc,
        MEMBER: userAc,
        COACH: userAc,
      },
    }),
    allowSignupRoleField,
  ],
});

export const authClient = auth;

export default auth;
