import { type Router, Router as ExpressRouter } from "express";
import type { RequestHandler } from "express";

import { authenticate, authorize } from "../auth/auth.middleware.js";
import {
  createSubject,
  deleteSubject,
  getSubjectById,
  getTutorsBySubject,
  listSubjects,
  updateSubject,
} from "./subject.controller.js";

const subjectRoutes: Router = ExpressRouter();

const adminOrTutor: RequestHandler[] = [
  authenticate as RequestHandler,
  authorize("ADMIN", "COACH") as RequestHandler,
];

const adminOnly: RequestHandler[] = [
  authenticate as RequestHandler,
  authorize("ADMIN") as RequestHandler,
];

subjectRoutes.get("/", listSubjects as RequestHandler);

subjectRoutes.post("/", ...adminOrTutor, createSubject as RequestHandler);

subjectRoutes.get(
  "/:subjectId/tutors",
  getTutorsBySubject as RequestHandler,
);
subjectRoutes.get(
  "/:subjectId/coaches",
  getTutorsBySubject as RequestHandler,
);

subjectRoutes.get("/:subjectId", getSubjectById as RequestHandler);

subjectRoutes.patch(
  "/:subjectId",
  ...adminOrTutor,
  updateSubject as RequestHandler,
);

subjectRoutes.delete(
  "/:subjectId",
  ...adminOnly,
  deleteSubject as RequestHandler,
);

export default subjectRoutes;
