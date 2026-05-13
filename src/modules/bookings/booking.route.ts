import { Router, type RequestHandler } from "express";

import { authenticate, authorize } from "../auth/auth.middleware.js";
import {
  cancelBooking,
  completeBooking,
  createBooking,
  getBookingById,
  listBookings,
} from "./booking.controller.js";

const bookingRoutes: Router = Router();

// POST /bookings (student only)
bookingRoutes.post(
  "/",
  authenticate as RequestHandler,
  authorize("MEMBER") as RequestHandler,
  createBooking as RequestHandler,
);

// GET /bookings (student sees own, tutor sees teaching, admin sees all)
bookingRoutes.get("/", authenticate as RequestHandler, listBookings as RequestHandler);

// GET /bookings/:id
bookingRoutes.get(
  "/:id",
  authenticate as RequestHandler,
  getBookingById as RequestHandler,
);

// PATCH /bookings/:id/cancel (student or tutor; checked in service)
bookingRoutes.patch(
  "/:id/cancel",
  authenticate as RequestHandler,
  cancelBooking as RequestHandler,
);

// PATCH /bookings/:id/complete (tutor only)
bookingRoutes.patch(
  "/:id/complete",
  authenticate as RequestHandler,
  authorize("COACH") as RequestHandler,
  completeBooking as RequestHandler,
);

export default bookingRoutes;

