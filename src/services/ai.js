import { GoogleGenAI } from "@google/genai";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

const GEMINI_TIMEOUT_MS = 20_000;
const GROQ_TIMEOUT_MS = 20_000;

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
const groqApiKey = process.env.GROQ_API_KEY?.trim();

const gemini = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        timeout: GEMINI_TIMEOUT_MS,
        retryOptions: { attempts: 1 },
      },
    })
  : null;

const groq = groqApiKey ? createGroq({ apiKey: groqApiKey }) : null;

function safeDiagnostic(cause) {
  let message = String(cause?.message || cause || "Unknown provider error");
  for (const secret of [geminiApiKey, groqApiKey].filter(Boolean)) {
    message = message.split(secret).join("[REDACTED]");
  }
  return message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]")
    .replace(/gsk_[0-9A-Za-z_-]{12,}/g, "[REDACTED]")
    .replace(/(authorization\s*[:=]\s*bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 320);
}

function getStatus(cause) {
  const direct = Number(cause?.status ?? cause?.statusCode ?? cause?.response?.status);
  if (Number.isInteger(direct) && direct >= 100 && direct <= 599) return direct;
  const match = safeDiagnostic(cause).match(/(?:http\s*)?(?:status(?:\s*code)?\s*[:=]?\s*|error\s*[:=]?\s*)([1-5]\d\d)/i);
  return match ? Number(match[1]) : null;
}

function getFailureKind(cause) {
  const status = getStatus(cause);
  const message = safeDiagnostic(cause).toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    message.includes("invalid api key") ||
    message.includes("api key not valid") ||
    message.includes("api_key_invalid") ||
    message.includes("unauthorized") ||
    message.includes("unauthenticated") ||
    message.includes("permission denied")
  ) return "auth";

  if (
    status === 429 ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted")
  ) return "quota";

  if (
    [408, 500, 502, 503, 504].includes(status) ||
    message.includes("high demand") ||
    message.includes("temporarily unavailable") ||
    message.includes("unavailable") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    cause?.name === "AbortError" ||
    cause?.name === "TimeoutError"
  ) return "temporary";

  if (
    status === 404 ||
    message.includes("model not found") ||
    message.includes("no longer available")
  ) return "model";

  return "other";
}

function providerError(provider, cause) {
  const kind = getFailureKind(cause);
  const status = getStatus(cause);
  const diagnostic = safeDiagnostic(cause);

  // Diagnostics are redacted and truncated; never log request headers or SDK objects.
  console.error(`[${provider}] request failed`, {
    kind,
    status: status ?? "unknown",
    errorName: cause?.name || "Error",
    diagnostic,
  });

  let message;
  if (provider === "groq" && kind === "auth") {
    message = "Groq rejected the configured API key. Replace GROQ_API_KEY in Vercel with a valid active key.";
  } else if (provider === "groq" && kind === "quota") {
    message = "Groq rate limit or quota was reached. Check the Groq account limits and try again.";
  } else if (provider === "gemini" && kind === "auth") {
    message = "Gemini rejected the configured API key. Check GEMINI_API_KEY in Vercel.";
  } else if (provider === "gemini" && kind === "quota") {
    message = "Gemini's API quota or rate limit was reached. Check Google AI Studio limits and try again.";
  } else if (provider === "gemini" && kind === "temporary") {
    message = "Gemini is temporarily busy. Warren AI tried its lighter fallback model, but it could not complete the request.";
  } else if (kind === "temporary") {
    message = `${provider} is temporarily unavailable. Please retry in a moment.`;
  } else {
    message = `${provider} could not complete the request. Check its API key, model, and quota.`;
  }

  const error = new Error(message);
  error.status = 502;
  error.expose = true;
  return error;
}

function canTryGeminiFallback(cause) {
  // Never retry authentication failures with another model; other failures may be model-specific.
  return getFailureKind(cause) !== "auth";
}

async function requestGeminiModel(messages, model) {
  const response = await gemini.models.generateContent({
    model,
    contents: messages.map(({ role, content }) => ({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: content }],
    })),
    config: {
      maxOutputTokens: 2048,
      automaticContinuation: false,
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  });

  const text = response.text || "";
  if (!text.trim()) throw new Error("Gemini returned an empty response.");
  return { provider: "gemini", text };
}

async function generateWithGemini(messages) {
  if (!gemini) throw new Error("Gemini is not configured.");

  const primaryModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.5-flash-lite";
  const models = [...new Set([primaryModel, fallbackModel].filter(Boolean))];
  let lastError;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      return await requestGeminiModel(messages, model);
    } catch (cause) {
      lastError = cause;
      console.warn("[gemini] model attempt failed", {
        model,
        kind: getFailureKind(cause),
        status: getStatus(cause) ?? "unknown",
      });

      const hasFallback = index < models.length - 1;
      if (!hasFallback || !canTryGeminiFallback(cause)) break;
      console.info(`[gemini] trying fallback model ${models[index + 1]}`);
    }
  }

  throw lastError || new Error("Gemini did not return a response.");
}

async function generateWithGroq(messages) {
  if (!groq) throw new Error("Groq is not configured.");

  const result = await generateText({
    model: groq(process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile"),
    messages: messages.map(({ role, content }) => ({ role, content })),
    maxOutputTokens: 2048,
    maxRetries: 0,
    timeout: { totalMs: GROQ_TIMEOUT_MS },
  });

  const text = result.text || "";
  if (!text.trim()) throw new Error("Groq returned an empty response.");
  return { provider: "groq", text };
}

export async function generateReply({ messages, provider = "auto" }) {
  const available = { gemini: Boolean(gemini), groq: Boolean(groq) };

  if (provider !== "auto") {
    if (!available[provider]) {
      const error = new Error(
        `${provider === "gemini" ? "Gemini" : "Groq"} is not configured. Add its API key in Vercel Environment Variables.`,
      );
      error.status = 503;
      error.expose = true;
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

  const candidates = ["gemini", "groq"].filter((name) => available[name]);
  if (!candidates.length) {
    const error = new Error("No AI provider is configured. Add GEMINI_API_KEY or GROQ_API_KEY in Vercel Environment Variables.");
    error.status = 503;
    error.expose = true;
    throw error;
  }

  const failures = [];
  for (const candidate of candidates) {
    try {
      return candidate === "gemini"
        ? await generateWithGemini(messages)
        : await generateWithGroq(messages);
    } catch (cause) {
      failures.push(providerError(candidate, cause).message);
      console.warn(`[${candidate}] automatic provider attempt failed`);
    }
  }

  const error = new Error(`Warren AI could not get a response. ${failures.join(" ")}`);
  error.status = 502;
  error.expose = true;
  throw error;
}
