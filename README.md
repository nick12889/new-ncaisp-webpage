# NCAI Strategy Partners — Aileen Chat Agent

## What this does

A Worker (`new-ncaisp-webpage`) that serves your website and powers **Aileen**, a chat agent widget that:

1. **Greets visitors** and asks for their **name, business email, phone, and company** before answering questions
2. **Answers questions** only based on your website content — if a question is out of context, Aileen apologizes and says a colleague will follow up within one business day
3. **Saves conversation summaries to a D1 database** as lead records, which can feed into your Twenty CRM

## Architecture

```
Browser (chat widget)
  ↓ POST /api/chat      → Workers AI (Llama 3.1) with system prompt
  ↓ POST /api/save-lead → Workers AI (extract lead info) → D1 database
  ↓ GET  /api/leads     → D1 database (for CRM integration)
  ↓ Static assets       → Served from /public directory
```

## Setup

### 1. Create the D1 database

```bash
npx wrangler d1 create ncaisp-leads
```

Copy the `database_id` from the output and paste it into `wrangler.jsonc` (replace `YOUR_D1_DATABASE_ID`).

### 2. Create the leads table

```bash
npx wrangler d1 execute ncaisp-leads --remote --file=./schema.sql
```

### 3. Deploy

```bash
npm install
npx wrangler deploy
```

### 4. Update website content

Edit the `WEBPAGE_CONTENT` constant in `src/index.js` to include your actual website content. This is the knowledge base Aileen uses to answer questions.

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Send messages array, get Aileen's reply |
| `/api/save-lead` | POST | Save conversation summary as a lead in D1 |
| `/api/leads` | GET | Retrieve all leads (for CRM integration) |

## D1 Schema

```sql
CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  conversation_summary TEXT,
  out_of_context_questions TEXT,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

## Twenty CRM Integration

Your Twenty CRM can pull leads from the `/api/leads` endpoint. Options:

1. **Webhook/HTTP call**: When a lead is saved, add a Worker Cron Trigger or Queue to push the lead to Twenty CRM's API
2. **Polling**: Twenty CRM (or a middleware script) polls `/api/leads` periodically for new records
3. **Direct API push**: Add a `fetch()` call in the `saveLead()` function to push to Twenty CRM's API directly

## Customization

- **System prompt**: Edit `SYSTEM_PROMPT` in `src/index.js` to change Aileen's behavior
- **Website content**: Edit `WEBPAGE_CONTENT` in `src/index.js` to update the knowledge base
- **Model**: Change the model in `callAI()` (default: `@cf/meta/llama-3.1-8b-instruct`)
- **Chat widget UI**: Edit `public/index.html` to match your brand
