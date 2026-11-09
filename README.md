# Warren AI App

A clean Node.js API foundation for a web or mobile AI application, with Google Gemini and Groq providers.

## Included

- Express 5 API
- Official Google GenAI JavaScript SDK (`@google/genai`)
- Groq provider through Vercel AI SDK (`ai`, `@ai-sdk/groq`)
- Select provider with `auto`, `gemini`, or `groq`
- Zod request validation, Helmet headers, CORS allow-list, and rate limiting
- API keys stay on the backend

## Requirements

Node.js 20+ and at least one provider API key.

## Run locally

```bash
npm install
cp .env.example .env
```

Put your API key(s) in `.env`, then run:

```bash
npm run dev
```

The API listens on port 3000 by default.

## Endpoints

- `GET /health` — health check
- `POST /api/chat` — generate a response

Example request:

```json
{
  "message": "Explain photosynthesis in simple words",
  "provider": "auto"
}
```

Example response:

```json
{
  "provider": "gemini",
  "text": "..."
}
```

In auto mode Gemini is preferred when configured; Groq is used if Gemini is not configured.

## Test with curl

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello!","provider":"auto"}'
```

## Structure

```text
src/
  index.js
  routes/chat.js
  services/ai.js
.env.example
.gitignore
package.json
README.md
```

## Security before production

- Never commit `.env` or API keys.
- Keep AI calls on the backend; the client should call your API.
- Set `CORS_ORIGIN` to your actual frontend origin(s).
- The built-in in-memory rate limiter is for a single server instance. Use a shared store such as Redis when horizontally scaling.
- Add authentication and per-user quotas before exposing the API publicly.

## Official references

- [Gemini API libraries](https://ai.google.dev/gemini-api/docs/libraries)
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
- [Groq API quickstart](https://console.groq.com/docs/quickstart)
- [Express](https://expressjs.com/)
- [Zod](https://zod.dev/)
- [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)