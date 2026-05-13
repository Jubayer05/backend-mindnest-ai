import type { BookingStatus, Prisma, Role } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import {
  bookingApiInclude,
  toApi,
  type BookingApi,
} from "../bookings/booking.service.js";
import { banUserService, unbanUserService } from "../user/user.service.js";
import type {
  ListAdminBookingsQuery,
  ListAdminUsersQuery,
  PatchAdminUserBody,
} from "./admin.schemas.js";

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || m === undefined || d === undefined) {
    throw new Error("Invalid date");
  }
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function mapQueryStatus(
  value: ListAdminBookingsQuery["status"],
): BookingStatus | undefined {
  if (!value) return undefined;
  if (value === "confirmed") return "CONFIRMED";
  if (value === "completed") return "COMPLETED";
  return "CANCELLED";
}

const adminBookingInclude = {
  ...bookingApiInclude,
  student: { select: { id: true, name: true, email: true } },
} as const;

export type AdminBookingApi = BookingApi & {
  student: { id: string; name: string; email: string };
};

function toAdminBookingApi(
  row: Prisma.BookingGetPayload<{ include: typeof adminBookingInclude }>,
): AdminBookingApi {
  const { student, ...rest } = row;
  return {
    ...toApi(rest),
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
    },
  };
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
};

export async function listAdminUsersService(query: ListAdminUsersQuery): Promise<{
  items: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};
  if (query.role) {
    where.role = query.role;
  }
  if (query.q && query.q.length > 0) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        banned: true,
        banReason: true,
        banExpires: true,
        emailVerified: true,
        image: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    items: rows.map((r) => ({
      ...r,
      banned: r.banned ?? false,
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function patchAdminUserService(
  adminUserId: string,
  targetUserId: string,
  body: PatchAdminUserBody,
  headers: globalThis.Headers,
): Promise<AdminUserRow> {
  if (adminUserId === targetUserId) {
    if (body.banned === true) {
      throw new Error("Cannot ban yourself");
    }
    if (body.role !== undefined && body.role !== "ADMIN") {
      throw new Error("Cannot remove your own admin role");
    }
  }

  const exists = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!exists) {
    throw new Error("User not found");
  }

  // Role / isActive: update Prisma directly. Better Auth's admin updateUser often
  // returns "No fields to update" for custom role (plugin merge), but our session
  // and DB read role from this table.
  const prismaUserPatch: { role?: Role; isActive?: boolean } = {};
  if (body.role !== undefined) prismaUserPatch.role = body.role;
  if (body.isActive !== undefined) prismaUserPatch.isActive = body.isActive;
  if (Object.keys(prismaUserPatch).length > 0) {
    await prisma.user.update({
      where: { id: targetUserId },
      data: prismaUserPatch,
    });
  }

  if (body.banned === true) {
    await banUserService(targetUserId, body.banReason, undefined, headers);
  } else if (body.banned === false) {
    await unbanUserService(targetUserId, headers);
  }

  const row = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      banned: true,
      banReason: true,
      banExpires: true,
      emailVerified: true,
      image: true,
      createdAt: true,
    },
  });
  if (!row) throw new Error("User not found");

  return {
    ...row,
    banned: row.banned ?? false,
  };
}

export async function listAdminBookingsService(
  query: ListAdminBookingsQuery,
): Promise<{
  items: AdminBookingApi[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const statusEnum = mapQueryStatus(query.status);
  const fromDate = query.from ? parseDateOnly(query.from) : undefined;
  const toDate = query.to ? parseDateOnly(query.to) : undefined;

  const dateFilter =
    fromDate || toDate
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        }
      : undefined;

  const searchFilter: Prisma.BookingWhereInput | undefined =
    query.q && query.q.length > 0
      ? {
          student: {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
            ],
          },
        }
      : undefined;

  const where: Prisma.BookingWhereInput = {
    ...(statusEnum ? { status: statusEnum } : {}),
    ...(dateFilter ? { date: dateFilter } : {}),
    ...(searchFilter ?? {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: adminBookingInclude,
    }),
  ]);

  return {
    items: rows.map(toAdminBookingApi),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export type AdminStatsActivity = {
  type: "user_registered" | "booking_created" | "booking_completed";
  at: string;
  title: string;
  description: string;
};

export async function getAdminStatsService(): Promise<{
  usersByRole: { role: Role; count: number }[];
  totalBookings: number;
  totalRevenue: string;
  recentActivities: AdminStatsActivity[];
}> {
  const [
    adminCount,
    coachCount,
    memberCount,
    totalBookings,
    revenueSum,
    recentUsers,
    recentBookings,
  ] = await prisma.$transaction([
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "COACH" } }),
    prisma.user.count({ where: { role: "MEMBER" } }),
    prisma.booking.count(),
    prisma.booking.aggregate({
      where: { status: "COMPLETED" },
      _sum: { totalPrice: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        createdAt: true,
        totalPrice: true,
        student: { select: { name: true } },
        tutorProfile: {
          select: { user: { select: { name: true } } },
        },
      },
    }),
  ]);

  const usersByRole: { role: Role; count: number }[] = [
    { role: "ADMIN", count: adminCount },
    { role: "COACH", count: coachCount },
    { role: "MEMBER", count: memberCount },
  ];

  const totalRevenue = revenueSum._sum.totalPrice?.toString() ?? "0";

  type Activity = AdminStatsActivity & { t: number };
  const activities: Activity[] = [];

  for (const u of recentUsers) {
    activities.push({
      type: "user_registered",
      at: u.createdAt.toISOString(),
      t: u.createdAt.getTime(),
      title: "New user",
      description: `${u.name} (${u.email}) registered as ${u.role}`,
    });
  }

  for (const b of recentBookings) {
    const tutorName = b.tutorProfile.user.name;
    const studentName = b.student.name;
    if (b.status === "COMPLETED") {
      activities.push({
        type: "booking_completed",
        at: b.createdAt.toISOString(),
        t: b.createdAt.getTime(),
        title: "Booking completed",
        description: `${studentName} with ${tutorName} · $${b.totalPrice.toString()}`,
      });
    } else {
      activities.push({
        type: "booking_created",
        at: b.createdAt.toISOString(),
        t: b.createdAt.getTime(),
        title: "Booking activity",
        description: `${studentName} · ${tutorName} · ${b.status}`,
      });
    }
  }

  activities.sort((a, b) => b.t - a.t);
  const recentActivities: AdminStatsActivity[] = activities
    .slice(0, 15)
    .map(({ t: _t, ...rest }) => rest);

  return {
    usersByRole,
    totalBookings,
    totalRevenue,
    recentActivities,
  };
}
