# 3maps

## What is 3maps?

3maps is a web app built to solve a common problem with AI chats: they're linear. If you want to re-ask about a specific point mid-response, you have no choice but to keep scrolling down — and the original thread gets buried.

3maps lets you re-ask sideways: each follow-up question opens a new branch without touching the main conversation, and those branches form a navigable node map.

**Try it:** https://alanepazs.github.io/3maps/ — no install, no account needed.

## Demo

![3maps demo: conversation tree, branching, light/dark theme, conversation panel, and local model](.github/assets/demo.gif)

---

## How it works

Everything runs in your browser: no account, no server, nothing to install.

- **Local storage.** Each conversation is saved as Markdown files in your browser
  (a set of files = one map). It persists across sessions on the same machine and
  browser; no cloud sync in this mode.
- **Your own API key.** You choose the provider (Google Gemini is free) and your
  key goes directly to it — 3maps never sees it. More details in [Privacy](#privacy).
- **Or run everything on your machine, no key needed.** With [Ollama](https://ollama.com)
  installed on your computer, or with **WebLLM** running directly in the browser via
  WebGPU (Chrome/Edge desktop, nothing to install). 3maps detects your hardware
  and suggests which model works best.
- **Scoped context.** Each branch only sends the path from root to the current node;
  old content is summarized. Long conversations don't re-send everything each time.
- **Export and import** a complete map as `.zip`.

## Local mode vs. with account

Login is optional. By default, 3maps runs 100% local: no account, no setup needed.

| Feature | Local (default) | With account |
|---|:---:|:---:|
| AI, branching, full canvas | ✅ | ✅ |
| Browser storage | ✅ | ✅ |
| Login (Google / magic-link) | — | ✅ |
| Share map by link | — | ✅ |
| Sync across devices | — | ✅ |
| Keys on all your devices | — | ✅ |

## AI Providers

- **Free, no card:** Google Gemini, Groq, OpenRouter, Hugging Face.
- **Paid (your own account):** Claude (Anthropic), OpenAI, DeepSeek.
- **Local:** Ollama (installed on your computer) or WebLLM (in the browser, nothing to install).

Attach text, images, and PDFs (depending on what the chosen model supports).

## Stack

- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- **Node canvas:** [React Flow](https://reactflow.dev/) (`@xyflow/react` v12)
- **Optional backend:** Supabase (login, sharing, sync, AI proxy)
- **Deploy:** GitHub Pages (`output: "export"`, static — everything runs client-side)

## Run locally

Requires Node 20.9 or higher (required by Next.js 16).

```bash
git clone https://github.com/alanepazs/3maps.git
cd 3maps
npm install
npm run dev          # http://localhost:3000
```

Without `NEXT_PUBLIC_SUPABASE_*` environment variables in `.env.local`, it runs
100% local: no login, no sharing, no device sync — everything else (AI, branching,
export) works the same.

## Privacy

Your API key lives only in your browser and goes directly to your chosen provider —
it never passes through 3maps infrastructure. Providers that don't enable CORS can,
if you want, go through your own stateless edge function: it just forwards the
request, doesn't log or store it.

The repo is public and has no keys or `.env` files committed.

## Documentation

- [`docs/arquitectura.md`](docs/arquitectura.md) — what each file in `src/` does
- [`docs/decisiones.md`](docs/decisiones.md) — why the code is the way it is
- [`docs/spec-proyecto.md`](docs/spec-proyecto.md) — design: data model
  (`.md` per exchange), context algorithm, token costs, roadmap
- [`CLAUDE.md`](CLAUDE.md) — project invariants and conventions
