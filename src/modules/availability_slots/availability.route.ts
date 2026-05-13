import { type Router, Router as ExpressRouter } from "express";
import type { RequestHandler } from "express";
import { authenticate, authorize } from "../auth/auth.middleware.js";
import {
  createAvailabilitySlot,
  deleteAvailabilitySlot,
  getAvailabilitySlotById,
  getPublicAvailabilitySlotById,
  listAvailabilitySlots,
  listPublicAvailabilitySlots,
  updateAvailabilitySlot,
} from "./availability.controller.js";

const availabilityRoutes: Router = ExpressRouter();

const tutorOnly: RequestHandler[] = [
  authenticate as RequestHandler,
  authorize("COACH") as RequestHandler,
];

// GET /availability/slots?tutorId=&date=
availabilityRoutes.get("/slots", listAvailabilitySlots as RequestHandler);

// GET /availability/public/slots?subjectId=&tutorId=&status=&date=
availabilityRoutes.get(
  "/public/slots",
  listPublicAvailabilitySlots as RequestHandler,
);

// GET /availability/public/slots/:slotId
availabilityRoutes.get(
  "/public/slots/:slotId",
  getPublicAvailabilitySlotById as RequestHandler,
);

// POST /availability/slots
availabilityRoutes.post("/slots", ...tutorOnly, createAvailabilitySlot as RequestHandler);

// GET /availability/slots/:slotId
availabilityRoutes.get(
  "/slots/:slotId",
  ...tutorOnly,
  getAvailabilitySlotById as RequestHandler,
);

// PATCH /availability/slots/:slotId
availabilityRoutes.patch(
  "/slots/:slotId",
  ...tutorOnly,
  updateAvailabilitySlot as RequestHandler,
);

// DELETE /availability/slots/:slotId
availabilityRoutes.delete(
  "/slots/:slotId",
  ...tutorOnly,
  deleteAvailabilitySlot as RequestHandler,
);

export default availabilityRoutes;
