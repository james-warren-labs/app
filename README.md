# Warren AI

A responsive AI chat application for desktop and mobile, powered by a Node.js API with Google Gemini and Groq.

## Features

- Responsive chat interface with dark and light themes
- New conversations and chat history saved locally in the current browser
- Conversation context sent with each request (up to the latest 20 messages)
- Choose Auto, Gemini, or Groq as the model provider
- Gemini uses Flash first and falls back to Flash-Lite during temporary service or quota failures
- Bounded provider timeouts so slow API calls do not hang a serverless function
- Safe, actionable provider errors without exposing API keys or raw upstream responses
- Copy assistant responses
- Express 5 API, Zod validation, Helmet, CORS allow-list, and request rate limiting
- Provider API keys stay on the server

## Requirements

- Node.js 20+
- At least one valid provider API key

## Run locally

```bash
npm install
cp .env.example .env
```

Add your provider key(s) to `.env`, then run:

```bash
npm run dev
```

Open http://localhost:3000.

## Environment

```env
PORT=3000
CORS_ORIGIN=http://localhost:3000
GEMINI_API_KEY=
GROQ_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GROQ_MODEL=llama-3.3-70b-versatile
```

Use the exact model IDs available in your provider account. Never put API keys in frontend files or commit a real `.env` file. The optional `GEMINI_FALLBACK_MODEL` defaults to `gemini-3.5-flash-lite`.

## API

- `GET /health` — health check
- `POST /api/chat` — chat completion

Example:

```json
{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "provider": "auto"
}
```

The `provider` value can be `auto`, `gemini`, or `groq`. Auto tries Gemini (including its lighter fallback model) before Groq. The backend accepts up to 20 conversation messages.

## Project structure

```text
public/
  index.html
  styles.css
  app.js
src/
  index.js
  routes/chat.js
  services/ai.js
.env.example
.gitignore
package.json
README.md
```

## Notes

- Conversation history is stored in browser localStorage on that device; it is not synced across devices or stored in a server database.
- The in-memory rate limiter is intended for one server instance. Use a shared store for multi-instance deployments.
- Add authentication, per-user usage limits, and a persistent database before making the service public.
- Configure `CORS_ORIGIN` with your real frontend origin(s) when deploying.
- Provider keys must be valid, active, and have access to the selected models. The app trims surrounding whitespace but cannot repair a revoked or incorrect key.

## Official references

- [Gemini API models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API libraries](https://ai.google.dev/gemini-api/docs/libraries)
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
- [Groq API quickstart](https://console.groq.com/docs/quickstart)
- [Express](https://expressjs.com/)
- [Zod](https://zod.dev/)
- [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
