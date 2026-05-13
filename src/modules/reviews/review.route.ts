import { Router, type RequestHandler } from "express";

import { authenticate, authorize } from "../auth/auth.middleware.js";
import { createReview, getReviewById } from "./review.controller.js";

const reviewRoutes: Router = Router();

reviewRoutes.post(
  "/",
  authenticate as RequestHandler,
  authorize("MEMBER") as RequestHandler,
  createReview as RequestHandler,
);

reviewRoutes.get("/:id", getReviewById as RequestHandler);

export default reviewRoutes;
