// Aileen – lead-capturing AI chat agent for NC AI Strategy Partners (Cloudflare Worker)
// Chat + TTS: Workers AI | Email: Resend | CRM: Twenty (self-hosted, REST) | Storage: D1

const OWNER_EMAIL = 'nishant.chaudhary@ncaistrategypartners.com';
const FROM_EMAIL = 'NCAI Strategy Partners <hello@updates.ncaistrategypartners.com>';
const CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

const GREETING =
  "Hi, I'm Aileen from NC AI Strategy Partners. I'm happy to help you explore how AI can support your business. " +
  'To get started, may I have your name?';

// Fixed fallback shown whenever the model is not sure. Also used to find unanswered questions later.
const FOLLOWUP_TEXT =
  "I'm sorry, I'm not sure about that one. A colleague will follow up with you within 24 business hours.";
const UNSURE_MARKER = '[[UNSURE]]';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com',
  'aol.com', 'proton.me', 'protonmail.com', 'msn.com', 'me.com', 'ymail.com',
]);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;

const MAX_MESSAGES = 30;
const MAX_CHARS = 2000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function extractTextFromHTML(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

const transcriptOf = (messages) =>
  messages.map((m) => `${m.role === 'user' ? 'Visitor' : 'Aileen'}: ${m.content}`).join('\n');

// Questions the agent could not answer = user message right before a fallback reply.
function unansweredQuestions(messages) {
  const out = [];
  messages.forEach((m, i) => {
    const unsure = /colleague will follow up|not (mentioned|listed|covered|available) (on|in) (our|the) website|don'?t have (that|enough|any) information|not sure about that|unable to (provide|answer)/i;
    if (m.role === 'assistant' && unsure.test(m.content) && i > 0 && messages[i - 1].role === 'user') {
      out.push(messages[i - 1].content);
    }
  });
  return out;
}

async function runAI(env, messages, opts = {}) {
  const resp = await env.AI.run(CHAT_MODEL, { messages, max_tokens: 500, temperature: 0.3, ...opts });
  const text = resp?.response ?? resp?.result?.response ?? '';
  return typeof text === 'string' ? text : JSON.stringify(text);
}

// ---------- Lead extraction ----------
async function extractLead(env, messages) {
  const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  const lead = { name: null, email: null, phone: null, company: null };

  const email = userText.match(EMAIL_RE);
  if (email) lead.email = email[0].toLowerCase();
  const phone = userText.replace(EMAIL_RE, ' ').match(PHONE_RE);
  if (phone) lead.phone = phone[0].trim();

  if (!userText.trim()) return lead;
  try {
    const out = await runAI(
      env,
      [
        {
          role: 'system',
          content:
            'Extract contact details from the visitor messages. Reply with ONLY a JSON object: ' +
            '{"name": string|null, "company": string|null}. "name" is the visitor\'s own full name as they gave it. ' +
            '"company" is their business name. Use null if not clearly stated. Never invent values.',
        },
        { role: 'user', content: userText },
      ],
      { max_tokens: 100, temperature: 0 }
    );
    const m = out.match(/\{[\s\S]*\}/);
    if (m) {
      const p = JSON.parse(m[0]);
      if (typeof p.name === 'string' && p.name.trim() && p.name.length < 80) lead.name = p.name.trim();
      if (typeof p.company === 'string' && p.company.trim() && p.company.length < 120) lead.company = p.company.trim();
    }
  } catch (e) {
    console.error('Lead extraction failed:', e);
  }
  return lead;
}

// ---------- Prompt ----------
function buildSystemPrompt(lead, siteText) {
  const missing = [];
  if (!lead.name) missing.push('full name');
  if (!lead.email) missing.push('business email');
  if (!lead.phone) missing.push('phone number');

  const freeEmail = lead.email && FREE_EMAIL_DOMAINS.has(lead.email.split('@')[1]);

  let leadRule;
  if (missing.length) {
    leadRule =
      `Visitor details still missing: ${missing.join(', ')}. ` +
      `Warmly ask for the next missing item (${missing[0]}) in this reply, one item at a time. ` +
      'You may answer a question briefly first, but always end by asking for the missing item. ' +
      'If the visitor declines, do not push; continue helping.';
  } else if (freeEmail) {
    leadRule =
      'All details collected, but the email looks personal. Once, politely ask if they have a business email we can use instead; accept whatever they say.';
  } else {
    leadRule = 'All visitor details are collected. Do not ask for them again. Help with their questions.';
  }

  return `You are Aileen, a warm, professional assistant for NC AI Strategy Partners (NCAISP).

Rules:
- Answer ONLY from the WEBSITE CONTENT below. Never invent services, prices, timelines or facts.
- Keep replies short (2-4 sentences), plain text, no markdown.
- If the answer is not explicitly in the website content, or you are not sure, reply with exactly: ${UNSURE_MARKER} and nothing else. Never say things like "not mentioned on the website".
- ${leadRule}
- If the visitor wants a consultation or call, thank them and say a colleague will follow up within 24 business hours.

## WEBSITE CONTENT
${siteText}`;
}

// ---------- Email (Resend) ----------
// Returns true on success, otherwise a short error string (stored with the lead so failures are visible).
async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return 'no RESEND_API_KEY';
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (r.ok) return true;
    const text = await r.text();
    console.error('Resend error', r.status, text);
    return `resend ${r.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`;
  } catch (e) {
    console.error('Resend failed:', e);
    return `fetch failed: ${String(e.message || e).slice(0, 100)}`;
  }
}

const pre = (t) =>
  `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-family:inherit;">${esc(t)}</pre>`;

async function sendEmails(env, lead, summary, unanswered, transcript) {
  const followUp = unanswered.length > 0;
  const unansweredHtml = followUp
    ? `<h3>Questions needing a follow-up</h3><ul>${unanswered.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>`
    : '';

  const owner = await sendEmail(env, {
    to: OWNER_EMAIL,
    replyTo: lead.email || undefined,
    subject: `${followUp ? '[Follow-up needed] ' : ''}New lead: ${lead.name || 'Unknown'}${lead.company ? ' – ' + lead.company : ''}`,
    html: `<h2>New lead from the website chat</h2>
      <p><strong>Name:</strong> ${esc(lead.name)}<br/>
      <strong>Email:</strong> ${esc(lead.email)}<br/>
      <strong>Phone:</strong> ${esc(lead.phone)}<br/>
      <strong>Company:</strong> ${esc(lead.company)}</p>
      <h3>Summary</h3>${pre(summary)}
      ${unansweredHtml}
      <h3>Full transcript</h3>${pre(transcript)}`,
  });

  let guest = null;
  if (lead.email) {
    guest = await sendEmail(env, {
      to: lead.email,
      replyTo: OWNER_EMAIL,
      subject: 'Thank you for chatting with NC AI Strategy Partners',
      html: `<h2>Thank you, ${esc(lead.name || 'there')}!</h2>
        <p>Here is a summary of our conversation.</p>${pre(summary)}
        <p>${followUp ? 'A colleague will follow up with you within 24 business hours.' : 'A colleague will be in touch if there is anything further we can help with.'}</p>
        <p>Best regards,<br/>NC AI Strategy Partners</p>`,
    });
  }
  return { owner, guest };
}

// ---------- Twenty CRM (self-hosted REST) ----------
async function twenty(env, path, body) {
  const base = env.TWENTY_BASE_URL.replace(/\/+$/, '');
  const r = await fetch(`${base}/rest/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.TWENTY_API_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { /* not json */ }
  if (!r.ok) throw new Error(`Twenty ${path} ${r.status}: ${text.slice(0, 300)}`);
  return data;
}

// Twenty wraps created records as {data:{createX:{id}}} or {data:{id}} depending on version.
const idOf = (d) => d?.data?.id ?? Object.values(d?.data ?? {})[0]?.id ?? d?.id ?? null;

async function pushToTwenty(env, lead, summary, unanswered) {
  if (!env.TWENTY_BASE_URL || !env.TWENTY_API_KEY) return 'skipped';
  try {
    let companyId = null;
    if (lead.company) {
      try {
        companyId = idOf(await twenty(env, 'companies', { name: lead.company }));
      } catch (e) {
        console.error('Twenty company error:', e);
      }
    }

    const [first, ...rest] = (lead.name || 'Website Visitor').split(/\s+/);
    const person = await twenty(env, 'people', {
      name: { firstName: first, lastName: rest.join(' ') },
      ...(lead.email ? { emails: { primaryEmail: lead.email } } : {}),
      ...(lead.phone ? { phones: { primaryPhoneNumber: lead.phone } } : {}),
      ...(companyId ? { companyId } : {}),
    });
    const personId = idOf(person);

    const noteText =
      `Source: Website chat (Aileen)\n\n${summary}` +
      (unanswered.length ? `\n\nUnanswered questions (follow up within 24 business hours):\n- ${unanswered.join('\n- ')}` : '');
    let note;
    try {
      note = await twenty(env, 'notes', { title: 'Website chat summary', bodyV2: { markdown: noteText } });
    } catch (_) {
      note = await twenty(env, 'notes', { title: 'Website chat summary', body: noteText }); // older Twenty versions
    }
    const noteId = idOf(note);
    if (noteId && personId) await twenty(env, 'noteTargets', { noteId, personId });
    return 'ok';
  } catch (e) {
    console.error('Twenty CRM push failed:', e);
    return 'failed';
  }
}

// ---------- D1 ----------
async function ensureTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS lead_submissions (
      session_id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, company TEXT,
      summary TEXT, unanswered TEXT, transcript TEXT,
      email_status TEXT, crm_status TEXT, created_at TEXT
    )`
  ).run();
}

// ---------- Handlers ----------
async function handleChat(request, env) {
  const body = await request.json();
  const messages = cleanMessages(body.messages);
  if (messages.length === 0) return json({ reply: GREETING, needs_followup: false });

  let pageHtml = '<html><body><h1>NC AI Strategy Partners</h1></body></html>';
  if (env.ASSETS?.fetch) {
    const r = await env.ASSETS.fetch(new Request(new URL('/', request.url)));
    pageHtml = await r.text();
  }
  const siteText = extractTextFromHTML(pageHtml).slice(0, 6000);

  const lead = await extractLead(env, messages);
  const out = await runAI(env, [
    { role: 'system', content: buildSystemPrompt(lead, siteText) },
    ...messages,
  ]);

  const unsure = out.includes(UNSURE_MARKER) || !out.trim();
  const reply = unsure ? FOLLOWUP_TEXT : out.trim();
  return json({ reply, needs_followup: unsure, lead_complete: !!(lead.name && lead.email && lead.phone) });
}

// Runs after the HTTP response is sent (ctx.waitUntil) so a closing browser tab cannot cut it off.
async function processLead(env, sessionId, messages) {
  try {
    const lead = await extractLead(env, messages);
    const transcript = transcriptOf(messages);
    const unanswered = unansweredQuestions(messages);

    let summary = transcript;
    try {
      const s = await runAI(env, [
        {
          role: 'system',
          content:
            'Summarize this website chat for a sales follow-up in 3-5 short bullet points (plain text, "- " bullets). ' +
          'Only state what the VISITOR said or asked, plus any question Aileen could not answer. ' +
          'Do not guess, infer roles or intentions, or repeat contact details. If something is unknown, leave it out.',
        },
        { role: 'user', content: transcript },
      ], { max_tokens: 350 });
      if (s.trim()) summary = s.trim();
    } catch (e) {
      console.error('Summary failed:', e);
    }

    const mail = await sendEmails(env, lead, summary, unanswered, transcript);
    const crm = await pushToTwenty(env, lead, summary, unanswered);

    await env.DB.prepare(
      `UPDATE lead_submissions SET name=?, email=?, phone=?, company=?, summary=?, unanswered=?, transcript=?, email_status=?, crm_status=? WHERE session_id=?`
    ).bind(
      lead.name, lead.email, lead.phone, lead.company, summary, JSON.stringify(unanswered), transcript,
      `owner:${mail.owner === true ? 'ok' : mail.owner} | guest:${mail.guest === true ? 'ok' : mail.guest}`, crm, sessionId
    ).run();
  } catch (e) {
    console.error('processLead failed:', e);
    try {
      await env.DB.prepare('UPDATE lead_submissions SET email_status=? WHERE session_id=?')
        .bind(`error: ${String(e.message || e).slice(0, 200)}`, sessionId).run();
    } catch (_) { /* nothing more to do */ }
  }
}

async function handleEndChat(request, env, ctx) {
  const body = await request.json();
  const sessionId = typeof body.session_id === 'string' ? body.session_id.slice(0, 64) : null;
  const messages = cleanMessages(body.messages);
  if (!sessionId || !messages.some((m) => m.role === 'user')) return json({ ok: false, reason: 'nothing to save' });

  await ensureTable(env);
  // Claim the session (and keep the transcript right away so nothing is lost) so a double submit is processed once.
  const now = new Date().toISOString();
  const claim = await env.DB.prepare(
    'INSERT OR IGNORE INTO lead_submissions (session_id, transcript, created_at) VALUES (?, ?, ?)'
  ).bind(sessionId, transcriptOf(messages), now).run();
  if (!claim.meta?.changes) {
    // A previous attempt that never finished (no status after 2 minutes) may be retried.
    const retry = await env.DB.prepare(
      "UPDATE lead_submissions SET created_at=?, transcript=? WHERE session_id=? AND email_status IS NULL AND created_at < ?"
    ).bind(now, transcriptOf(messages), sessionId, new Date(Date.now() - 2 * 60 * 1000).toISOString()).run();
    if (!retry.meta?.changes) return json({ ok: true, duplicate: true });
  }

  ctx.waitUntil(processLead(env, sessionId, messages));
  return json({ ok: true, queued: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/chat/status' && request.method === 'GET') return json({ ready: !!env.AI });
      if (url.pathname === '/api/chat' && request.method === 'POST') return await handleChat(request, env);
      if (url.pathname === '/api/end-chat' && request.method === 'POST') return await handleEndChat(request, env, ctx);

      if (url.pathname === '/api/leads' && request.method === 'GET') {
        if (!env.LEADS_API_KEY || request.headers.get('X-Leads-Key') !== env.LEADS_API_KEY) {
          return json({ error: 'Unauthorized' }, 401);
        }
        await ensureTable(env);
        const { results } = await env.DB.prepare('SELECT * FROM lead_submissions ORDER BY created_at DESC LIMIT 200').all();
        return json({ leads: results });
      }

      if (url.pathname === '/api/stt' && request.method === 'POST') {
        const buf = await request.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > 5 * 1024 * 1024) return json({ error: 'Audio missing or too long.' }, 400);
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const out = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: btoa(bin), language: 'en' });
        return json({ text: String(out?.text || '').trim().slice(0, 1500) });
      }

      if (url.pathname === '/api/tts' && request.method === 'POST') {
        const { text } = await request.json();
        const audio = await env.AI.run(
          '@cf/deepgram/aura-2-fiona-en',
          { text: String(text || '').slice(0, 1500), speaker: 'brigid', encoding: 'mp3', container: 'none' },
          { returnRawResponse: true }
        );
        return new Response(audio.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
      }
    } catch (err) {
      console.error('Request failed:', err);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
