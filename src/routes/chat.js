import { Router } from "express";
import { z } from "zod";
import { generateReply } from "../services/ai.js";

const router = Router();
const chatSchema = z.object({
  message: z.string().trim().min(1).max(8000),
  provider: z.enum(["auto", "gemini", "groq"]).default("auto"),
}).strict();

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
  try {
    return res.json(await generateReply(parsed.data));
  } catch (error) {
    return next(error);
  }
});

export default router;