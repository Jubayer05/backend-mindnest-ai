import { Router } from "express";
import adminRoutes from "../modules/admin/admin.route.js";
import availabilityRoutes from "../modules/availability_slots/availability.route.js";
import adminReviewRoutes from "../modules/reviews/admin-review.route.js";
import reviewRoutes from "../modules/reviews/review.route.js";
import { authRouter } from "../modules/auth/auth.route.js";
import categoryRoutes from "../modules/category/category.routes.js";
import subjectRoutes from "../modules/subject/subject.routes.js";
import profileRoutes from "../modules/profile/profile.route.js";
import tutorRoutes from "../modules/tutor/tutor.route.js";
import tutorsRoutes from "../modules/tutors/tutors.routes.js";
import uploadRouter from "../modules/upload/upload.route.js";
import userRoutes from "../modules/user/user.route.js";
import bookingRoutes from "../modules/bookings/booking.route.js";
import sslcommerzRoutes from "../modules/payments/sslcommerz/sslcommerz.route.js";
import aiRoutes from "../modules/ai/ai.route.js";

const router: Router = Router();

router.use("/auth", authRouter);
router.use("/categories", categoryRoutes);
router.use("/subjects", subjectRoutes);
router.use("/availability", availabilityRoutes);
router.use("/bookings", bookingRoutes);
router.use("/payments/sslcommerz", sslcommerzRoutes);
router.use("/profile", profileRoutes);
router.use("/tutor", tutorRoutes);
router.use("/coach", tutorRoutes);
router.use("/tutors", tutorsRoutes);
router.use("/coaches", tutorsRoutes);
router.use("/reviews", reviewRoutes);
router.use("/admin", adminRoutes);
router.use("/admin/reviews", adminReviewRoutes);
router.use("/users", userRoutes);
router.use("/upload", uploadRouter);
router.use("/ai", aiRoutes);

export default router;
