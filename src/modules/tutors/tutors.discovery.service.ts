import { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import {
  listReviewsForTutorUserIdService,
  type PaginatedReviewsApi,
} from "../reviews/review.service.js";
import type { ListTutorsQuery, TutorDetailQuery } from "./tutors.schemas.js";

const listInclude = {
  user: {
    select: { id: true, name: true, image: true },
  },
  categories: {
    select: { id: true, name: true },
    orderBy: { name: "asc" as const },
    take: 16,
  },
} as const;

export type TutorListItemApi = {
  id: string;
  userId: string;
  headline: string;
  bio: string;
  hourlyRate: string;
  rating: string | null;
  totalReviews: number;
  profileImageUrl: string | null;
  isVerified: boolean;
  createdAt: string;
  user: { id: string; name: string; image: string | null };
  categories: { id: string; name: string }[];
};

export type PaginatedTutorListApi = {
  items: TutorListItemApi[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type TutorPublicDetailTutorApi = {
  id: string;
  userId: string;
  headline: string;
  bio: string;
  hourlyRate: string;
  experience: number;
  education: string;
  languages: string[];
  rating: string | null;
  totalReviews: number;
  profileImageUrl: string | null;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phoneNumber: string | null;
    image: string | null;
    role: string;
  };
  categories: { id: string; name: string }[];
  subjects: {
    id: string;
    name: string;
    category: { id: string; name: string };
  }[];
};

export type TutorPublicDetailApi = {
  tutor: TutorPublicDetailTutorApi;
  reviews: PaginatedReviewsApi;
  averageRating: string | null;
};

function buildListWhere(query: ListTutorsQuery): Prisma.TutorProfileWhereInput {
  const andParts: Prisma.TutorProfileWhereInput[] = [
    {
      user: {
        role: "COACH",
        isActive: true,
        NOT: { banned: true },
      },
    },
  ];

  if (query.categoryId) {
    andParts.push({
      categories: { some: { id: query.categoryId } },
    });
  }

  if (query.minPrice != null) {
    andParts.push({
      hourlyRate: { gte: new Prisma.Decimal(query.minPrice) },
    });
  }
  if (query.maxPrice != null) {
    andParts.push({
      hourlyRate: { lte: new Prisma.Decimal(query.maxPrice) },
    });
  }

  if (query.minRating != null && query.minRating > 0) {
    andParts.push({
      rating: {
        not: null,
        gte: new Prisma.Decimal(query.minRating),
      },
    });
  }

  if (query.q && query.q.length > 0) {
    const term = query.q;
    andParts.push({
      OR: [
        { headline: { contains: term, mode: "insensitive" } },
        { user: { name: { contains: term, mode: "insensitive" } } },
      ],
    });
  }

  return { AND: andParts };
}

function buildListOrderBy(
  sort: ListTutorsQuery["sort"],
): Prisma.TutorProfileOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ hourlyRate: "asc" }];
    case "price_desc":
      return [{ hourlyRate: "desc" }];
    case "newest":
      return [{ createdAt: "desc" }];
    case "rating_desc":
    default:
      return [
        { rating: { sort: "desc", nulls: "last" } },
        { totalReviews: "desc" },
        { createdAt: "desc" },
      ];
  }
}

function mapListRow(row: {
  id: string;
  userId: string;
  headline: string;
  bio: string;
  hourlyRate: { toString(): string };
  rating: Prisma.Decimal | null;
  totalReviews: number;
  profileImageUrl: string | null;
  isVerified: boolean;
  createdAt: Date;
  user: { id: string; name: string; image: string | null };
  categories: { id: string; name: string }[];
}): TutorListItemApi {
  return {
    id: row.id,
    userId: row.userId,
    headline: row.headline,
    bio: row.bio,
    hourlyRate: row.hourlyRate.toString(),
    rating: row.rating === null ? null : row.rating.toString(),
    totalReviews: row.totalReviews,
    profileImageUrl: row.profileImageUrl,
    isVerified: row.isVerified,
    createdAt: row.createdAt.toISOString(),
    user: row.user,
    categories: row.categories,
  };
}

export async function listTutorsDiscoveryService(
  query: ListTutorsQuery,
): Promise<PaginatedTutorListApi> {
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;
  const where = buildListWhere(query);
  const orderBy = buildListOrderBy(query.sort);

  const [total, rows] = await prisma.$transaction([
    prisma.tutorProfile.count({ where }),
    prisma.tutorProfile.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: listInclude,
    }),
  ]);

  return {
    items: rows.map(mapListRow),
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

const detailInclude = {
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
  categories: {
    select: { id: true, name: true },
    orderBy: { name: "asc" as const },
  },
  subjects: {
    select: {
      id: true,
      name: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" as const },
    take: 40,
  },
} as const;

export async function getTutorPublicDetailService(
  tutorUserId: string,
  reviewQuery: TutorDetailQuery,
): Promise<TutorPublicDetailApi | null> {
  const row = await prisma.tutorProfile.findFirst({
    where: {
      userId: tutorUserId,
      user: {
        role: "COACH",
        isActive: true,
        NOT: { banned: true },
      },
    },
    include: detailInclude,
  });

  if (!row) return null;

  const reviews = await listReviewsForTutorUserIdService(
    tutorUserId,
    reviewQuery.reviewsPage,
    reviewQuery.reviewsLimit,
  );

  const ratingStr =
    row.rating === null ? null : row.rating.toString();

  const tutor: TutorPublicDetailTutorApi = {
    id: row.id,
    userId: row.userId,
    headline: row.headline,
    bio: row.bio,
    hourlyRate: row.hourlyRate.toString(),
    experience: row.experience,
    education: row.education,
    languages: row.languages,
    rating: ratingStr,
    totalReviews: row.totalReviews,
    profileImageUrl: row.profileImageUrl,
    isVerified: row.isVerified,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      phoneNumber: row.user.phoneNumber,
      image: row.user.image,
      role: row.user.role,
    },
    categories: row.categories,
    subjects: row.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
    })),
  };

  return {
    tutor,
    reviews,
    averageRating: ratingStr,
  };
}
