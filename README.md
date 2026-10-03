# NCAI Strategy Partners – Aileen chat agent

Worker serving the website plus **Aileen**, a chat/voice agent that:
- captures name, business email and phone;
- answers only from the website; if unsure it apologises and says a colleague will follow up within 24 business hours;
- on chat end (or tab close) emails a summary to the guest and to nishant.chaudhary@ncaistrategypartners.com (via Resend), pushes Person + Company + Note to Twenty CRM, and stores the lead in D1;
- supports voice: mic (browser speech-to-text) and spoken replies (Cloudflare Workers AI TTS, browser voice as fallback).

## Required secrets (Cloudflare dashboard → Worker → Settings → Variables and Secrets, type "Secret")
| Name | Value |
|---|---|
| `RESEND_API_KEY` | Resend API key (domain ncaistrategypartners.com must be verified in Resend) |
| `TWENTY_BASE_URL` | Your Twenty server URL, e.g. `https://crm.yourdomain.com` |
| `TWENTY_API_KEY` | Twenty → Settings → APIs & Webhooks |
| `LEADS_API_KEY` | Any long random string; protects `GET /api/leads` (header `X-Leads-Key`) |

Bindings (`AI`, `DB`, `ASSETS`) are in `wrangler.jsonc`. The D1 table is created automatically.

## Endpoints
`POST /api/chat`, `POST /api/end-chat`, `POST /api/tts`, `GET /api/leads` (key required).
