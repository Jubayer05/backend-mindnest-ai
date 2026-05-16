import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import { authClient } from "./lib/auth.js";
import router from "./routes/index.js";

const app: Application = express();

app.use(express.json());

const frontendOrigin = (
  process.env.FRONTEND_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (origin === frontendOrigin) {
        callback(null, true);
        return;
      }
      if (
        process.env.NODE_ENV !== "production" &&
        (origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:"))
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);

// Mount the Better Auth handler before other middleware that parses bodies
app.all("/api/auth/*splat", toNodeHandler(authClient));

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.status(200).json({
    service: "MindNest API",
    health: "/api/v1/health",
  });
});

// Routes

app.use("/api/v1", router);

// Health check routes
app.get("/api/v1/health", (req, res) => {
  console.log("Health check endpoint called - /api/v1/health");
  res.status(200).json({ message: "OK", timestamp: new Date().toISOString() });
});

// Express 5 compatible catch-all pattern
// app.use(notFoundHandler);

export default app;
