import { GoogleGenAI } from "@google/genai";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const groq = process.env.GROQ_API_KEY
  ? createGroq({ apiKey: process.env.GROQ_API_KEY }) : null;

export async function generateReply({ message, provider = "auto" }) {
  const selected = provider === "auto" ? (gemini ? "gemini" : groq ? "groq" : null) : provider;
  if (!selected || (selected === "gemini" && !gemini) || (selected === "groq" && !groq)) {
    const error = new Error("The selected AI provider is not configured on the server.");
    error.status = 503;
    throw error;
  }
  try {
    if (selected === "gemini") {
      const response = await gemini.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: message,
      });
      return { provider: "gemini", text: response.text || "" };
    }
    const { text } = await generateText({
      model: groq(process.env.GROQ_MODEL || "llama-3.3-70b-versatile"),
      prompt: message,
    });
    return { provider: "groq", text };
  } catch (cause) {
    console.error(`${selected} provider error:`, cause?.message || cause);
    const error = new Error("The AI provider could not complete the request.");
    error.status = 502;
    throw error;
  }
}