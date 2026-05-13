import { type Router, Router as ExpressRouter } from "express";
import type { RequestHandler } from "express";

import { authenticate, authorize } from "../auth/auth.middleware.js";
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  getTutorsByCategory,
  listCategories,
  updateCategory,
} from "./category.controller.js";

const categoryRoutes: Router = ExpressRouter();

const adminOrTutor: RequestHandler[] = [
  authenticate as RequestHandler,
  authorize("ADMIN", "COACH") as RequestHandler,
];

const adminOnly: RequestHandler[] = [
  authenticate as RequestHandler,
  authorize("ADMIN") as RequestHandler,
];

categoryRoutes.get("/", listCategories as RequestHandler);

categoryRoutes.post("/", ...adminOrTutor, createCategory as RequestHandler);

categoryRoutes.get(
  "/:categoryId/tutors",
  getTutorsByCategory as RequestHandler,
);
categoryRoutes.get(
  "/:categoryId/coaches",
  getTutorsByCategory as RequestHandler,
);

categoryRoutes.get("/:categoryId", getCategoryById as RequestHandler);

categoryRoutes.patch(
  "/:categoryId",
  ...adminOrTutor,
  updateCategory as RequestHandler,
);

categoryRoutes.delete(
  "/:categoryId",
  ...adminOnly,
  deleteCategory as RequestHandler,
);

export default categoryRoutes;
