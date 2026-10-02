// Lead‑capturing AI Agent for Cloudflare Workers
// Uses Workers AI (llama-3.1-8b-instruct) + KV for lead storage + Cloudflare Email Service + D1 database (if bound)

const assistantGuidance = `
You are Aileen, a warm and professional AI assistant for NC AI Strategy Partners (NCAISP).

Your goals are to:
- Help visitors understand how AI can support their business.
- Answer questions using ONLY the provided website content.
- Collect lead information (name, email, company, company size, phone) before providing detailed advice.
- If you do not know the answer, reply with: "I don't have enough information to answer that. A colleague will follow up within 24 business hours."

Conversation rules:
- Ask one question at a time.
- Only request contact details when the visitor shows interest (asks for a consultation, pricing, or a call).
- Do not pressure or repeatedly ask for information if the visitor declines.
- Always respond in the JSON format:
  {"reply": "...", "lead_complete": false, "lead_data": null}
- When all required lead fields are collected (at least name and email), set "lead_complete": true and include all gathered fields in "lead_data".
`;

// Extract readable text from HTML
function extractTextFromHTML(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Send email notifications using Cloudflare Email Service
async function sendLeadEmail(env, lead, chatSummary) {
  const ownerEmail = "nishant.chaudhary@ncaistartegypartners.com";
  const from = "hello@ncaistrategypartners.com";
  const timestamp = new Date().toISOString();

  const ownerSubject = "New lead captured – NCAI Strategy Partners";
  const ownerHtml = `
    <h2>New lead captured</h2>
    <p><strong>Name:</strong> ${lead.name || ''}</p>
    <p><strong>Email:</strong> ${lead.email || ''}</p>
    <p><strong>Company:</strong> ${lead.company || ''}</p>
    <p><strong>Company size:</strong> ${lead.company_size || ''}</p>
    <p><strong>Phone:</strong> ${lead.phone || ''}</p>
    <p><strong>Timestamp:</strong> ${timestamp}</p>
    <h3>Chat summary</h3>
    <pre style="background:#f5f5f5;padding:10px;border-radius:5px;white-space:pre-wrap;">
${chatSummary}
    </pre>
  `;

  const visitorSubject = "Thank you for contacting NCAI Strategy Partners";
  const visitorHtml = `
    <h2>Thank you, ${lead.name || 'there'}!</h2>
    <p>We have received your information and will follow up shortly.</p>
    <h3>Chat summary</h3>
    <pre style="background:#f5f5f5;padding:10px;border-radius:5px;white-space:pre-wrap;">
${chatSummary}
    </pre>
    <p>Best regards,<br/>NCAI Strategy Partners</p>
  `;

  try {
    await env.EMAIL.send({ to: ownerEmail, from, subject: ownerSubject, html: ownerHtml });
    if (lead.email) {
      await env.EMAIL.send({ to: lead.email, from, subject: visitorSubject, html: visitorHtml });
    }
    return true;
  } catch (e) {
    console.error('Email sending failed:', e);
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ------------------- Chat endpoint -------------------
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const { messages } = await request.json();
        // Load website content (bundled static file)
        const pageResp = await env.ASSETS.fetch('index.html');
        const pageHtml = await pageResp.text();
        const siteText = extractTextFromHTML(pageHtml).slice(0, 3000);

        const systemPrompt = `${assistantGuidance}\n\n## WEBSITE CONTENT (use ONLY this information)\n${siteText}`;
        const llmMessages = [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))];

        const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
          messages: llmMessages,
          max_tokens: 500,
          temperature: 0.7,
        });

        let replyText = aiResp.response || aiResp.result?.response || 'I did not understand that.';
        if (typeof replyText !== 'string') replyText = JSON.stringify(replyText);

        // Expect JSON output from the model
        let leadComplete = false;
        let leadData = null;
        try {
          const clean = replyText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(clean);
          replyText = parsed.reply ?? replyText;
          leadComplete = parsed.lead_complete ?? false;
          leadData = parsed.lead_data ?? null;
        } catch (_) { /* keep raw reply */ }

        // If lead collection finished, send emails and store data
        let emailSent = false;
        if (leadComplete && leadData) {
          const chatSummary = messages.map(m => `${m.role === 'user' ? 'Visitor' : 'Agent'}: ${m.content}`).join('\n');
          emailSent = await sendLeadEmail(env, leadData, chatSummary);

          const leadId = `lead_${Date.now()}`;
          await env.LEADS.put(leadId, JSON.stringify({ leadData, chatSummary, timestamp: new Date().toISOString(), emailSent }));

          if (env.DB) {
            try {
              await env.DB.prepare(`INSERT INTO leads (id, name, email, company, company_size, phone, chat_summary, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
                .bind(
                  leadId,
                  leadData.name || null,
                  leadData.email || null,
                  leadData.company || null,
                  leadData.company_size || null,
                  leadData.phone || null,
                  chatSummary,
                  new Date().toISOString()
                )
                .run();
            } catch (dbErr) {
              console.error('D1 insert error:', dbErr);
            }
          }
        }

        return new Response(JSON.stringify({ reply: replyText, lead_complete: leadComplete, email_sent: emailSent }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Chat processing failed', details: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ------------------- Leads list (protected) -------------------
    if (url.pathname === '/api/leads' && request.method === 'GET') {
      const auth = request.headers.get('X-Leads-Key');
      if (auth !== env.LEADS_API_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      const list = await env.LEADS.list();
      const leads = [];
      for (const key of list.keys) {
        const val = await env.LEADS.get(key.name);
        if (val) leads.push(JSON.parse(val));
      }
      return new Response(JSON.stringify({ leads }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ------------------- Text‑to‑Speech (optional) -------------------
    if (url.pathname === '/api/tts' && request.method === 'POST') {
      try {
        const { text } = await request.json();
        const audio = await env.AI.run('@cf/deepgram/aura-2-en', {
          text,
          speaker: 'helena',
          encoding: 'mp3',
          container: 'none',
        }, { returnRawResponse: true });
        return new Response(audio.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'TTS failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ------------------- Static assets fallback -------------------
    return env.ASSETS.fetch(request);
  },
};