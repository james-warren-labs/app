import { Router } from "express";
import { z } from "zod";
import { generateReply } from "../services/ai.js";

const router = Router();
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8000),
}).strict();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(8000).optional(),
  messages: z.array(messageSchema).min(1).max(20).optional(),
  provider: z.enum(["auto", "gemini", "groq"]).default("auto"),
}).strict().refine((data) => data.message || data.messages?.length, {
  message: "Provide a message or conversation history.",
});

router.post("/", async (req, res, next) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.issues.map(({ path, message }) => ({
        path: path.join("."), message,
      })),
    });
  }

  const messages = parsed.data.messages || [{ role: "user", content: parsed.data.message }];
  if (!messages.some((item) => item.role === "user")) {
    return res.status(400).json({ error: "Conversation must include a user message." });
  }

  try {
    return res.json(await generateReply({ messages, provider: parsed.data.provider }));
  } catch (error) {
    return next(error);
  }
});

export default router;