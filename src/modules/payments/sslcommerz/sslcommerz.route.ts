import { Router, type RequestHandler } from "express";

import { authenticate, authorize } from "../../auth/auth.middleware.js";
import {
  initSslcommerzPayment,
  sslcommerzCancel,
  sslcommerzFail,
  sslcommerzSuccess,
} from "./sslcommerz.controller.js";

const router = Router();

router.post(
  "/init",
  authenticate as RequestHandler,
  authorize("MEMBER") as RequestHandler,
  initSslcommerzPayment as RequestHandler,
);

// SSLCommerz can call these with POST (form-encoded) and/or redirect with query params.
router.all("/success", sslcommerzSuccess as RequestHandler);
router.all("/fail", sslcommerzFail as RequestHandler);
router.all("/cancel", sslcommerzCancel as RequestHandler);

export default router;

