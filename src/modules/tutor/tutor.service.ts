import { prisma } from "../../lib/prisma.js";

const tutorProfileSelect = {
  id: true,
  userId: true,
  headline: true,
  bio: true,
  hourlyRate: true,
  experience: true,
  education: true,
  languages: true,
  rating: true,
  totalReviews: true,
  profileImageUrl: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      image: true,
      role: true,
    },
  },
} as const;

export interface UpsertTutorProfileInput {
  headline: string;
  bio: string;
  hourlyRate: string | number;
  experience: number;
  education: string;
  languages: string[];
  profileImageUrl?: string | null;
}

export const upsertTutorProfileService = async (
  userId: string,
  data: UpsertTutorProfileInput,
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.role !== "COACH") {
    throw new Error("Only tutors can create or update tutor profiles");
  }

  return prisma.tutorProfile.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      ...data,
    },
    select: tutorProfileSelect,
  });
};

export const getTutorProfileByUserIdService = (userId: string) =>
  prisma.tutorProfile.findUnique({
    where: { userId },
    select: tutorProfileSelect,
  });

export type FeaturedTutorApi = {
  id: string;
  userId: string;
  headline: string;
  bio: string;
  hourlyRate: string;
  rating: string | null;
  totalReviews: number;
  profileImageUrl: string | null;
  isVerified: boolean;
  subjectsCount: number;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
};

function toSyntheticFeaturedTutor(row: {
  userId: string;
  user: { id: string; name: string; image: string | null };
  subjectsCount: number;
}): FeaturedTutorApi {
  return {
    id: `synthetic-profile-${row.userId}`,
    userId: row.userId,
    headline: "Coach",
    bio: "Available for tutoring sessions.",
    hourlyRate: "0.00",
    rating: null,
    totalReviews: 0,
    profileImageUrl: null,
    isVerified: false,
    subjectsCount: row.subjectsCount,
    user: row.user,
  };
}

export const listFeaturedTutorsService = async (
  limit: number,
): Promise<FeaturedTutorApi[]> => {
  const take = Math.min(Math.max(limit, 1), 24);
  const profileRows = await prisma.tutorProfile.findMany({
    take,
    orderBy: [
      { isVerified: "desc" },
      { totalReviews: "desc" },
      { createdAt: "desc" },
    ],
    include: {
      user: {
        select: { id: true, name: true, image: true },
      },
      _count: {
        select: { subjects: true },
      },
    },
  });

  const profiled = profileRows.map((row) => ({
    id: row.id,
    userId: row.userId,
    headline: row.headline,
    bio: row.bio,
    hourlyRate: row.hourlyRate.toString(),
    rating: row.rating === null ? null : row.rating.toString(),
    totalReviews: row.totalReviews,
    profileImageUrl: row.profileImageUrl,
    isVerified: row.isVerified,
    subjectsCount: row._count.subjects,
    user: row.user,
  }));

  if (profiled.length >= take) {
    return profiled;
  }

  const slotRows = await prisma.availabilitySlot.findMany({
    where: { subjectId: { not: null } },
    select: { tutorId: true, subjectId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const missingByUserId = new Map<
    string,
    { subjectIds: Set<string>; latest: number }
  >();
  const alreadyIncluded = new Set(profiled.map((p) => p.userId));

  for (const row of slotRows) {
    if (alreadyIncluded.has(row.tutorId)) continue;
    if (!row.subjectId) continue;
    let entry = missingByUserId.get(row.tutorId);
    if (!entry) {
      entry = { subjectIds: new Set(), latest: row.createdAt.getTime() };
      missingByUserId.set(row.tutorId, entry);
    }
    entry.subjectIds.add(row.subjectId);
    if (row.createdAt.getTime() > entry.latest) {
      entry.latest = row.createdAt.getTime();
    }
  }

  if (missingByUserId.size === 0) {
    return profiled;
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...missingByUserId.keys()] }, role: "COACH" },
    select: { id: true, name: true, image: true },
  });

  const synthetic = users
    .map((u) =>
      toSyntheticFeaturedTutor({
        userId: u.id,
        user: u,
        subjectsCount: missingByUserId.get(u.id)?.subjectIds.size ?? 0,
      }),
    )
    .sort(
      (a, b) =>
        (missingByUserId.get(b.userId)?.latest ?? 0) -
        (missingByUserId.get(a.userId)?.latest ?? 0),
    );

  return [...profiled, ...synthetic].slice(0, take);
};
