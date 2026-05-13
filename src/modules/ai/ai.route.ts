import { type Router, Router as ExpressRouter } from "express";
import type { RequestHandler } from "express";
import { tryAuthenticate } from "../auth/auth.middleware.js";
import {
  getCoachRecommendations,
  getSearchSuggestions,
  postAssistantChat,
} from "./ai.controller.js";

const aiRoutes: Router = ExpressRouter();

aiRoutes.get("/search-suggestions", getSearchSuggestions as RequestHandler);
aiRoutes.post("/chat", postAssistantChat as RequestHandler);
aiRoutes.get(
  "/coach-recommendations",
  tryAuthenticate as RequestHandler,
  getCoachRecommendations as RequestHandler,
);

export default aiRoutes;
