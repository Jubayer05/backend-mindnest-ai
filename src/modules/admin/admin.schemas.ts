import { z } from "zod";

const roleEnum = z.enum(["ADMIN", "COACH", "MEMBER"]);

export const listAdminUsersQuerySchema = z.object({
  role: roleEnum.optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const patchAdminUserBodySchema = z
  .object({
    role: roleEnum.optional(),
    /** When true, bans the user (Better Auth + DB ban fields). When false, unbans. */
    banned: z.boolean().optional(),
    banReason: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field is required",
  });

export const listAdminBookingsQuerySchema = z.object({
  status: z
    .enum(["confirmed", "completed", "cancelled"], {
      message: 'status must be "confirmed", "completed", or "cancelled"',
    })
    .optional(),
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")
    .optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;
export type PatchAdminUserBody = z.infer<typeof patchAdminUserBodySchema>;
export type ListAdminBookingsQuery = z.infer<typeof listAdminBookingsQuerySchema>;
