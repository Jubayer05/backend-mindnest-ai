import type { Request, Response } from "express";
import { z } from "zod";
import {
  assistantChatService,
  coachRecommendationsService,
  searchSuggestionsService,
} from "./ai.service.js";

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(4000),
      }),
    )
    .max(20),
});

export const getSearchSuggestions = async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const suggestions = await searchSuggestionsService(q);
    res.status(200).json({ message: "OK", data: { suggestions } });
  } catch (e: unknown) {
    console.error(e);
    res.status(500).json({ message: "Failed to load suggestions", error: "AI_ERROR" });
  }
};

export const postAssistantChat = async (req: Request, res: Response) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid body", error: parsed.error.flatten() });
      return;
    }
    const reply = await assistantChatService(parsed.data.messages);
    res.status(200).json({ message: "OK", data: { reply } });
  } catch (e: unknown) {
    console.error(e);
    res.status(500).json({ message: "Assistant unavailable", error: "AI_ERROR" });
  }
};

export const getCoachRecommendations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const recs = await coachRecommendationsService(userId);
    res.status(200).json({ message: "OK", data: { recommendations: recs } });
  } catch (e: unknown) {
    console.error(e);
    res
      .status(500)
      .json({ message: "Failed to load recommendations", error: "AI_ERROR" });
  }
};
