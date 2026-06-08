# Lumi AI

A children's English-learning app where a student talks **out loud** with a live 3D avatar
(**LiveAvatar / HeyGen**, FULL mode). The whole conversation is transcribed in real time, and
when the student (or Lumi) says **"link"** or **"evidence"**, the app asks **Claude
(`claude-sonnet-4-6`)** to web-search **3 real, existing pages** and shows them in a floating panel.

## How it works

```
Browser (public/index.html)                 Vercel functions (/api/*)            Upstream
─────────────────────────                   ─────────────────────────            ────────
@heygen/liveavatar-web-sdk  ──POST────────▶  /api/liveavatar/token  ──X-API-KEY─▶ api.liveavatar.com
  • renders avatar <video>                    (mode:FULL, avatar_id,               /v1/sessions/token
  • mic in / Lumi voice out                    avatar_persona.context_id)          → { data:{ session_token } }
  • user.transcription / avatar.transcription
        │
        ├─ live transcript panel
        └─ "link"/"evidence" (debounced) ──▶  /api/find-evidence  ──x-api-key────▶ api.anthropic.com
                                               (sonnet-4-6 + web_search_20260209)   /v1/messages
                                               → 3 real links → floating toast
End screen → "Get Lumi's feedback" ────────▶  /api/claude (sonnet-4-6, no tools)
```

- **The conversation is driven by the avatar's own AI** (configured by `context_id` on the
  LiveAvatar platform), not by Claude. Claude is used **only** for the 3-link web search and the
  end-of-session feedback.
- Transcripts come from the SDK's `user.transcription` / `avatar.transcription` events
  (LiveKit data channel) — this is the reliable, documented source.

## Project layout

```
public/index.html          # the entire front-end (loads the SDK from esm.sh, no build step)
api/liveavatar/token.js     # POST → mints a FULL-mode LiveAvatar session token (server-side key)
api/find-evidence.js        # POST → Claude sonnet-4-6 + web search → { links: [{title,url,source}] }
api/claude.js               # POST → Claude sonnet-4-6 (no tools) → { text }  (feedback)
vercel.json                 # raises function maxDuration to 60s
.env.example                # template for the env vars below
```

## Environment variables

Set these in the Vercel dashboard (Production + Preview) and in `.env.local` for `vercel dev`:

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Claude key (server-side only) |
| `LIVEAVATAR_API_KEY` | LiveAvatar key (server-side only) |
| `LIVEAVATAR_AVATAR_ID` | the avatar to use |
| `LIVEAVATAR_CONTEXT_ID` | the FULL-mode persona/context ("Lumi the English teacher") |
| `LIVEAVATAR_VOICE_ID` | the avatar's voice — **required** when the avatar has no default voice (this one). Get an id from `GET /v1/voices` |
| `LIVEAVATAR_LANGUAGE` | conversation language (default `en`) |
| `LIVEAVATAR_SANDBOX` | `true` for free testing (no credits), `false` for production |
| `EVIDENCE_ALLOWED_DOMAINS` | *(optional)* comma-separated allow-list to restrict the web search to kid-safe domains |

> ⚠️ **Rotate the keys.** The Anthropic and LiveAvatar keys were previously committed in plaintext
> (`server.js` / `api_keys.txt`). Treat them as compromised and re-issue both before going live.
> `.env.local` currently holds the old values so you can test locally — replace them with rotated keys.

## Run locally

```bash
npm i -g vercel        # if you don't have the CLI
vercel dev             # serves the page + functions on http://localhost:3000
```

`vercel dev` auto-loads `.env.local`. Open the printed URL, click **Start with Lumi**, allow the
microphone, and talk. (Browser STT/mic works on `localhost` and on any `https://` deploy.)

## Deploy

```bash
vercel            # preview deploy
vercel --prod     # production
# set env vars once:
vercel env add ANTHROPIC_API_KEY production    # repeat for each var above
```

No `vercel.json` routing is needed — files in `api/` become functions automatically, and
`public/index.html` is served at `/`.

## One-time LiveAvatar setup (outside this repo)

In the LiveAvatar / HeyGen console, configure the **context** referenced by `LIVEAVATAR_CONTEXT_ID`
with the "Lumi" English-teacher persona (system prompt, voice, language, greeting). In FULL mode the
avatar's own LLM uses this context to drive the conversation.

## Verification checklist

1. `vercel dev`, open the app, **Start with Lumi** → avatar video renders, mic prompt appears.
2. Talk a few turns → the **📝 Transcript** drawer fills with both `You` and `Lumi` lines.
3. Say *"can I get a **link**?"* or *"show me **evidence**"* → a floating panel shows **3 real,
   clickable** links — open them to confirm they resolve.
4. **End** → summary shows the full transcript + every link found; **Get Lumi's Feedback** returns
   sonnet-4-6 feedback.
5. Deploy and repeat 1–4 on the live URL; confirm no key appears in the page source or network tab
   (the only secrets travel server-side; the browser only ever receives a short-lived session token).

## Troubleshooting

- **No avatar / "Failed to start"** — check the function logs for `/api/liveavatar/token`. A FULL-mode
  token needs `avatar_persona` (we send `{ context_id }`); a wrong/empty `LIVEAVATAR_CONTEXT_ID` or an
  invalid key surfaces here. Set `LIVEAVATAR_SANDBOX=true` to test without spending credits.
- **No audio** — autoplay needs the user gesture; we start the session from the button click, so allow
  audio if the browser blocks it. Some browsers also need the mic permission granted.
- **No transcript lines** — the SDK emits `user.transcription` / `avatar.transcription` only in FULL
  mode; confirm the token was minted with `mode: "FULL"` (it is, in `api/liveavatar/token.js`).
- **No links found** — broaden the search by leaving `EVIDENCE_ALLOWED_DOMAINS` empty; the model still
  prefers kid-friendly sources via its system prompt.
- **SDK won't load** — the front-end imports `@heygen/liveavatar-web-sdk@0.0.18` from `esm.sh`. If a
  network blocks esm.sh, pin a different CDN (e.g. `https://cdn.jsdelivr.net/npm/...+esm`) or add a
  small Vite build that bundles the SDK into `public/`.
