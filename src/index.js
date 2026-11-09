import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import chatRouter from "./routes/chat.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "warren-ai-app" }));

app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
}));
app.use("/api/chat", chatRouter);

app.use((err, _req, res, _next) => {
  console.error("Request error:", err.message);
  const status = Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message });
});

app.listen(port, () => console.log(`Warren AI API listening on port ${port}`));