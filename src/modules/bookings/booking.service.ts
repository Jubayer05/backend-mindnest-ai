import type { BookingStatus, AvailabilitySlotStatus } from "../../generated/prisma/index.js";
import { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateBookingBody, ListBookingsQuery } from "./booking.schemas.js";

/** Booking rows require a TutorProfile FK; create a minimal row if the tutor never completed onboarding. */
async function ensureTutorProfileIdForBookingTx(
  tx: Prisma.TransactionClient,
  tutorId: string,
  slotPrice: Prisma.Decimal,
): Promise<string> {
  const existing = await tx.tutorProfile.findUnique({
    where: { userId: tutorId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const tutorUser = await tx.user.findUnique({
    where: { id: tutorId },
    select: { id: true, role: true },
  });
  if (!tutorUser || tutorUser.role !== "COACH") {
    throw new Error("Invalid tutor for this slot");
  }

  try {
    const created = await tx.tutorProfile.create({
      data: {
        userId: tutorId,
        headline: "Tutor",
        bio: "Please complete your tutor profile in the dashboard.",
        hourlyRate: slotPrice,
        experience: 0,
        education: "Not specified",
        languages: [],
      },
      select: { id: true },
    });
    return created.id;
  } catch (e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const again = await tx.tutorProfile.findUnique({
        where: { userId: tutorId },
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw e;
  }
}

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || m === undefined || d === undefined) {
    throw new Error("Invalid date");
  }
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function mapStatusToEnum(
  value: ListBookingsQuery["status"],
): BookingStatus | undefined {
  if (!value) return undefined;
  if (value === "confirmed") return "CONFIRMED";
  if (value === "completed") return "COMPLETED";
  return "CANCELLED";
}

export type BookingApi = {
  id: string;
  studentId: string;
  tutorProfileId: string;
  availabilitySlotId: string;
  /** Label from the availability slot (may be empty for legacy rows). */
  slotName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalPrice: string;
  status: "confirmed" | "completed" | "cancelled";
  paymentMethod: "COD" | "SSLCOMMERZ";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tutor: {
    userId: string;
    name: string;
    image: string | null;
    profileImageUrl: string | null;
    headline: string;
    hourlyRate: string;
  };
  subject: {
    id: string;
    name: string;
    category: { id: string; name: string };
  } | null;
  /** Present when the student has submitted a review for this booking. */
  reviewId: string | null;
};

/** Relations required to build {@link BookingApi} via {@link toApi}. */
export const bookingApiInclude = {
  tutorProfile: {
    select: {
      userId: true,
      headline: true,
      hourlyRate: true,
      profileImageUrl: true,
      user: { select: { id: true, name: true, image: true } },
    },
  },
  availabilitySlot: {
    select: {
      name: true,
      subject: {
        select: {
          id: true,
          name: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  },
  review: { select: { id: true } },
} as const;

function mapEnumToApi(
  status: BookingStatus,
): "confirmed" | "completed" | "cancelled" {
  if (status === "CONFIRMED") return "confirmed";
  if (status === "COMPLETED") return "completed";
  return "cancelled";
}

export function toApi(row: {
  id: string;
  studentId: string;
  tutorProfileId: string;
  availabilitySlotId: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  totalPrice: { toString(): string };
  status: BookingStatus;
  paymentMethod: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  tutorProfile: {
    userId: string;
    headline: string;
    hourlyRate: { toString(): string };
    profileImageUrl: string | null;
    user: { id: string; name: string; image: string | null };
  };
  availabilitySlot: {
    name: string;
    subject: {
      id: string;
      name: string;
      category: { id: string; name: string };
    } | null;
  };
  review: { id: string } | null;
}): BookingApi {
  const paymentMethod =
    row.paymentMethod === "SSLCOMMERZ" ? "SSLCOMMERZ" : ("COD" as const);
  return {
    id: row.id,
    studentId: row.studentId,
    tutorProfileId: row.tutorProfileId,
    availabilitySlotId: row.availabilitySlotId,
    slotName: row.availabilitySlot.name,
    date: row.date.toISOString().slice(0, 10),
    startTime: row.startTime,
    endTime: row.endTime,
    duration: row.duration,
    totalPrice: row.totalPrice.toString(),
    status: mapEnumToApi(row.status),
    paymentMethod,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tutor: {
      userId: row.tutorProfile.userId,
      name: row.tutorProfile.user.name,
      image: row.tutorProfile.user.image,
      profileImageUrl: row.tutorProfile.profileImageUrl,
      headline: row.tutorProfile.headline,
      hourlyRate: row.tutorProfile.hourlyRate.toString(),
    },
    subject: row.availabilitySlot.subject,
    reviewId: row.review?.id ?? null,
  };
}

export const createBookingService = async (
  studentId: string,
  input: CreateBookingBody,
): Promise<BookingApi> => {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, role: true },
  });
  if (!student) throw new Error("User not found");
  if (student.role !== "MEMBER") throw new Error("Only members can book slots");

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: input.availabilitySlotId },
    include: {
      tutor: { select: { id: true } },
      subject: {
        select: {
          id: true,
          name: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!slot) throw new Error("Availability slot not found");
  if (slot.status !== ("AVAILABLE" as AvailabilitySlotStatus)) {
    throw new Error("Slot is not available");
  }
  if (slot.startAt.getTime() <= Date.now()) {
    throw new Error("Booking time must be in the future");
  }

  const durationMinutes = Math.max(
    1,
    Math.round((slot.endAt.getTime() - slot.startAt.getTime()) / 60000),
  );

  const totalPrice = Number(slot.price.toString()).toFixed(2);

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.availabilitySlot.findUnique({
      where: { id: slot.id },
      select: { status: true },
    });
    if (!latest) throw new Error("Availability slot not found");
    if (latest.status !== "AVAILABLE") {
      throw new Error("Slot is not available");
    }

    const existing = await tx.booking.findFirst({
      where: {
        availabilitySlotId: slot.id,
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("Slot already booked");
    }

    const tutorProfileId = await ensureTutorProfileIdForBookingTx(
      tx,
      slot.tutorId,
      slot.price,
    );

    let booking;
    try {
      booking = await tx.booking.create({
        data: {
          studentId,
          tutorProfileId,
          availabilitySlotId: slot.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          duration: durationMinutes,
          totalPrice,
          status: "CONFIRMED",
          paymentMethod: input.paymentMethod ?? "COD",
          notes:
            input.notes !== undefined && input.notes.trim() !== ""
              ? input.notes.trim()
              : null,
        },
        include: bookingApiInclude,
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new Error("Slot already booked");
      }
      throw e;
    }

    await tx.availabilitySlot.update({
      where: { id: slot.id },
      data: { status: "BOOKED" },
    });

    return booking;
  });

  return toApi(created);
};

export async function cancelBookingBySystem(
  bookingId: string,
): Promise<BookingApi | null> {
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, availabilitySlotId: true, status: true },
  });
  if (!existing) return null;
  if (existing.status === "CANCELLED") {
    const row = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: bookingApiInclude,
    });
    return row ? toApi(row) : null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
      include: bookingApiInclude,
    });

    await tx.availabilitySlot.update({
      where: { id: booking.availabilitySlotId },
      data: { status: "AVAILABLE" },
    });

    return booking;
  });

  return toApi(updated);
}

export const listBookingsService = async (
  userId: string,
  query: ListBookingsQuery,
): Promise<BookingApi[]> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new Error("User not found");

  const statusEnum = mapStatusToEnum(query.status);
  const fromDate = query.from ? parseDateOnly(query.from) : undefined;
  const toDate = query.to ? parseDateOnly(query.to) : undefined;

  const dateFilter =
    fromDate || toDate
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        }
      : undefined;

  const where =
    user.role === "MEMBER"
      ? {
          studentId: userId,
          ...(statusEnum ? { status: statusEnum } : {}),
          ...(dateFilter ? { date: dateFilter } : {}),
        }
      : user.role === "COACH"
        ? {
            tutorProfile: { userId },
            ...(statusEnum ? { status: statusEnum } : {}),
            ...(dateFilter ? { date: dateFilter } : {}),
          }
        : {
            ...(statusEnum ? { status: statusEnum } : {}),
            ...(dateFilter ? { date: dateFilter } : {}),
          };

  const rows = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: bookingApiInclude,
  });

  return rows.map(toApi);
};

export const getBookingByIdService = async (
  userId: string,
  bookingId: string,
): Promise<BookingApi | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new Error("User not found");

  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingApiInclude,
  });
  if (!row) return null;

  const canSee =
    user.role === "ADMIN" ||
    row.studentId === userId ||
    row.tutorProfile.userId === userId;
  if (!canSee) throw new Error("Forbidden");

  return toApi(row);
};

export const cancelBookingService = async (
  userId: string,
  bookingId: string,
): Promise<BookingApi> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new Error("User not found");

  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tutorProfile: { select: { userId: true } },
    },
  });
  if (!existing) throw new Error("Booking not found");

  const canCancel =
    user.role === "ADMIN" ||
    existing.studentId === userId ||
    existing.tutorProfile.userId === userId;
  if (!canCancel) throw new Error("Forbidden");
  if (existing.status === "CANCELLED") throw new Error("Booking already cancelled");

  const updated = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
      include: bookingApiInclude,
    });

    await tx.availabilitySlot.update({
      where: { id: booking.availabilitySlotId },
      data: { status: "AVAILABLE" },
    });

    return booking;
  });

  return toApi(updated);
};

export const completeBookingService = async (
  userId: string,
  bookingId: string,
): Promise<BookingApi> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new Error("User not found");
  if (user.role !== "COACH") throw new Error("Only coaches can complete bookings");

  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tutorProfile: { select: { userId: true } } },
  });
  if (!existing) throw new Error("Booking not found");
  if (existing.tutorProfile.userId !== userId) throw new Error("Forbidden");
  if (existing.status !== "CONFIRMED") throw new Error("Only confirmed bookings can be completed");

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "COMPLETED" },
    include: bookingApiInclude,
  });

  return toApi(updated);
};

