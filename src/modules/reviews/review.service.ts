import { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateReviewBody } from "./review.schemas.js";

const studentPublicSelect = {
  id: true,
  name: true,
  image: true,
} as const;

export type ReviewStudentApi = {
  id: string;
  name: string;
  image: string | null;
};

export type ReviewApi = {
  id: string;
  bookingId: string;
  studentId: string;
  tutorProfileId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  student: ReviewStudentApi;
};

export type PaginatedReviewsApi = {
  data: ReviewApi[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function toReviewApi(row: {
  id: string;
  bookingId: string;
  studentId: string;
  tutorProfileId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  student: ReviewStudentApi;
}): ReviewApi {
  return {
    id: row.id,
    bookingId: row.bookingId,
    studentId: row.studentId,
    tutorProfileId: row.tutorProfileId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    student: row.student,
  };
}

export async function refreshTutorReviewStats(
  tx: Prisma.TransactionClient,
  tutorProfileId: string,
): Promise<void> {
  const agg = await tx.review.aggregate({
    where: { tutorProfileId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const n = agg._count._all;
  const avg = agg._avg.rating;
  await tx.tutorProfile.update({
    where: { id: tutorProfileId },
    data: {
      totalReviews: n,
      rating:
        n > 0 && avg != null
          ? Number(avg).toFixed(2)
          : null,
    },
  });
}

const reviewWithStudentInclude = {
  student: { select: studentPublicSelect },
} as const;

export const createReviewService = async (
  studentId: string,
  input: CreateReviewBody,
): Promise<ReviewApi> => {
  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, role: true },
  });
  if (!user) throw new Error("User not found");
  if (user.role !== "MEMBER") throw new Error("Only members can submit reviews");

  const comment =
    input.comment !== undefined && input.comment.trim() !== ""
      ? input.comment.trim()
      : null;

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: {
        id: input.bookingId,
        studentId,
        status: "COMPLETED",
      },
      select: { id: true, tutorProfileId: true },
    });
    if (!booking) {
      throw new Error("Booking not found or not eligible for review");
    }

    const dup = await tx.review.findUnique({
      where: { bookingId: booking.id },
      select: { id: true },
    });
    if (dup) {
      throw new Error("Review already submitted for this booking");
    }

    const row = await tx.review.create({
      data: {
        bookingId: booking.id,
        studentId,
        tutorProfileId: booking.tutorProfileId,
        rating: input.rating,
        comment,
      },
      include: reviewWithStudentInclude,
    });

    await refreshTutorReviewStats(tx, booking.tutorProfileId);

    return toReviewApi(row);
  });
};

export const getReviewByIdService = async (
  reviewId: string,
): Promise<ReviewApi | null> => {
  const row = await prisma.review.findUnique({
    where: { id: reviewId },
    include: reviewWithStudentInclude,
  });
  return row ? toReviewApi(row) : null;
};

export const listReviewsForTutorUserIdService = async (
  tutorUserId: string,
  page: number,
  limit: number,
): Promise<PaginatedReviewsApi> => {
  const profile = await prisma.tutorProfile.findUnique({
    where: { userId: tutorUserId },
    select: { id: true },
  });
  if (!profile) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  const skip = (page - 1) * limit;
  const [total, rows] = await prisma.$transaction([
    prisma.review.count({ where: { tutorProfileId: profile.id } }),
    prisma.review.findMany({
      where: { tutorProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: reviewWithStudentInclude,
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    data: rows.map(toReviewApi),
    total,
    page,
    limit,
    totalPages,
  };
};

export type TutorDashboardReviewRowApi = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  student: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  booking: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    slotName: string;
  };
};

export type PaginatedTutorDashboardReviewsApi = {
  data: TutorDashboardReviewRowApi[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/** Reviews for the signed-in tutor, with student + booking/slot context (dashboard table). */
export const listReviewsForLoggedInTutorDashboardService = async (
  tutorUserId: string,
  page: number,
  limit: number,
): Promise<PaginatedTutorDashboardReviewsApi> => {
  const tutor = await prisma.user.findUnique({
    where: { id: tutorUserId },
    select: { id: true, role: true },
  });
  if (!tutor || tutor.role !== "COACH") {
    throw new Error("Only tutors can view their reviews");
  }

  const profile = await prisma.tutorProfile.findUnique({
    where: { userId: tutorUserId },
    select: { id: true },
  });
  if (!profile) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  const skip = (page - 1) * limit;
  const where = { tutorProfileId: profile.id };

  const [total, rows] = await prisma.$transaction([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        student: {
          select: { id: true, name: true, image: true, email: true },
        },
        booking: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            availabilitySlot: {
              select: { name: true },
            },
          },
        },
      },
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  const data: TutorDashboardReviewRowApi[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    student: {
      id: r.student.id,
      name: r.student.name,
      email: r.student.email,
      image: r.student.image,
    },
    booking: {
      id: r.booking.id,
      date: r.booking.date.toISOString().slice(0, 10),
      startTime: r.booking.startTime,
      endTime: r.booking.endTime,
      slotName: r.booking.availabilitySlot.name,
    },
  }));

  return {
    data,
    total,
    page,
    limit,
    totalPages,
  };
};

export const deleteReviewAdminService = async (
  reviewId: string,
): Promise<void> => {
  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, tutorProfileId: true },
  });
  if (!existing) {
    throw new Error("Review not found");
  }

  const tutorProfileId = existing.tutorProfileId;

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });
    await refreshTutorReviewStats(tx, tutorProfileId);
  });
};
