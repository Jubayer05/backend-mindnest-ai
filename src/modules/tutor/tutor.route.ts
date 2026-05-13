import { type Router, Router as ExpressRouter } from "express";
import type { RequestHandler } from "express";
import { authenticate, authorize } from "../auth/auth.middleware.js";
import {
  getTutorProfileByUserId,
  listFeaturedTutors,
  listMyTutorReviews,
  upsertTutorProfile,
} from "./tutor.controller.js";

const tutorRoutes: Router = ExpressRouter();

// GET /tutor/featured?limit=8
tutorRoutes.get("/featured", listFeaturedTutors as RequestHandler);

// PUT /tutor/profile
tutorRoutes.put(
  "/profile",
  authenticate as RequestHandler,
  authorize("COACH") as RequestHandler,
  upsertTutorProfile as RequestHandler,
);

// GET /tutor/reviews?page=&limit= (signed-in tutor only)
tutorRoutes.get(
  "/reviews",
  authenticate as RequestHandler,
  authorize("COACH") as RequestHandler,
  listMyTutorReviews as RequestHandler,
);

// GET /tutor/profile/:userId
tutorRoutes.get("/profile/:userId", getTutorProfileByUserId as RequestHandler);

export default tutorRoutes;
