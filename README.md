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

## SEO & launch checklist
- Canonical address is `https://ncaistrategypartners.com`. The Worker 301-redirects `www.` and `http://` there and adds security headers to every response (`run_worker_first` in `wrangler.jsonc`).
- `public/robots.txt`, `public/sitemap.xml` and `public/llms.txt` are static. Update the sitemap `lastmod` dates and `llms.txt` when pages change.
- Every page has a canonical link, Open Graph/Twitter tags and JSON-LD (Organization, WebPage, BreadcrumbList, plus Service, FAQPage, Article or Person where relevant).
- Pages are indexable (`index,follow`); only `404.html` is `noindex`. After launch, submit the sitemap in Google Search Console and Bing Webmaster Tools.
- `/privacy/` describes the chat, voice, email (Resend), CRM (Twenty), D1 and Cal.com data flows. Update it whenever a provider or data flow changes. A daily cron (`scheduled` in `src/index.js`) deletes D1 leads older than 24 months, matching the notice; CRM and mailbox records must be cleaned on the same schedule by hand.
