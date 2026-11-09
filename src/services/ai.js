import { GoogleGenAI } from "@google/genai";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;
const groq = process.env.GROQ_API_KEY
  ? createGroq({ apiKey: process.env.GROQ_API_KEY })
  : null;

function providerError(provider, cause) {
  console.error(`[${provider}] request failed:`, cause?.message || cause);
  const error = new Error(`${provider} could not complete the request. Check its server-side API key, model, and quota.`);
  error.status = 502;
  return error;
}

async function generateWithGemini(messages) {
  const response = await gemini.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    contents: messages.map(({ role, content }) => ({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: content }],
    })),
  });
  const text = response.text || "";
  if (!text.trim()) throw new Error("Gemini returned an empty response.");
  return { provider: "gemini", text };
}

async function generateWithGroq(messages) {
  const result = await generateText({
    model: groq(process.env.GROQ_MODEL || "llama-3.3-70b-versatile"),
    messages: messages.map(({ role, content }) => ({ role, content })),
  });
  const text = result.text || "";
  if (!text.trim()) throw new Error("Groq returned an empty response.");
  return { provider: "groq", text };
}

export async function generateReply({ messages, provider = "auto" }) {
  const available = { gemini: Boolean(gemini), groq: Boolean(groq) };

  if (provider !== "auto") {
    if (!available[provider]) {
      const error = new Error(`${provider} is not configured. Add its API key in Vercel Environment Variables.`);
      error.status = 503;
      throw error;
    }

    try {
      return provider === "gemini"
        ? await generateWithGemini(messages)
        : await generateWithGroq(messages);
    } catch (cause) {
      throw providerError(provider, cause);
    }
  }

  // Auto mode prefers Gemini, then tries Groq if Gemini is unavailable or fails.
  const candidates = ["gemini", "groq"].filter((name) => available[name]);
  if (!candidates.length) {
    const error = new Error("No AI provider is configured. Add GEMINI_API_KEY in Vercel Environment Variables.");
    error.status = 503;
    throw error;
  }

  const failures = [];
  for (const candidate of candidates) {
    try {
      return candidate === "gemini"
        ? await generateWithGemini(messages)
        : await generateWithGroq(messages);
    } catch (cause) {
      console.error(`[${candidate}] auto-provider attempt failed:`, cause?.message || cause);
      failures.push(candidate);
    }
  }

  const error = new Error(`All configured AI providers failed (${failures.join(", ")}). Check Vercel Function Runtime Logs and provider API configuration.`);
  error.status = 502;
  throw error;
}
