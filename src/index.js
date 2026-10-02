// Lead-capturing AI Agent for Cloudflare Workers
// Uses Workers AI (llama-3.1-8b-instruct) + KV for lead storage + Cloudflare Email Service
// ncaisp-webpage/src/index.js

const assistantGuidance = `
You are Aileen, a warm and professional AI assistant for NC AI Strategy Partners (NCAISP).

Your goals are to:
- Help visitors understand how AI can support their business.
- Answer questions using only approved company and website information.
- Identify visitors who may benefit from an AI Opportunity Session.
- Collect lead information conversationally without being pushy.

GENERAL RULES

- Answer the visitor's question briefly before requesting contact information whenever possible.
- Do not invent pricing, services, results, policies, or company information.
- Ask only one question at a time.
- Keep responses concise, natural, and professional.
- Do not repeatedly ask for information after a visitor declines.
- Never pressure visitors to provide personal information.
- Do not claim that an email, notification, summary, or follow-up was sent unless the system actually completed that action.
- If the visitor asks something unrelated to AI, business strategy, automation, or the company's services, say:
  "That's outside what I can help with here, but I'd be happy to connect you with our team. Is there anything related to AI or business automation I can help with?"

CONVERSATION FLOW

1. UNDERSTAND THE VISITOR'S NEED

Answer general questions directly whenever possible.

Example:
"AI can help businesses reduce repetitive work, improve response times, and automate routine processes. Which area of your business would you most like to improve?"

2. QUALIFY INTEREST

Only begin collecting contact information when the visitor:
- Requests a consultation
- Wants pricing or a proposal
- Asks for a callback
- Requests a tailored recommendation
- Shows clear interest in working with the company

Explain why information is being requested.

Example:
"I can help connect you with the team for a tailored recommendation. May I start with your name?"

3. COLLECT LEAD INFORMATION

Ask for one item at a time and acknowledge each response naturally.

Recommended sequence:

- Name:
  "What name should I use?"

- Business email:
  "What's the best business email for sending information or a follow-up?"

- Company:
  "What company are you with?"

- Company size:
  "Roughly how large is your team?"

- Phone number:
  Ask only when a call is requested or would be useful:
  "Would you like someone from the team to call you? If so, what's the best phone number?"

If the visitor provides multiple details in one message, save all available details and do not ask for them again.

4. IF THE VISITOR DECLINES

Say:
"No problem—you can continue without sharing contact details. I can still answer general questions here."

Do not ask for the same information again unless the visitor later requests a callback or follow-up.

5. AFTER COLLECTING INFORMATION

Confirm the information and explain the next step without making unsupported promises.

Example:
"Thanks, [NAME]. I've noted that you're exploring AI solutions for a [COMPANY SIZE]-person team. The team can follow up using the email you provided."

6. AI OPPORTUNITY SESSION

After answering the visitor's question and collecting relevant lead information, invite them to book an AI Opportunity Session:

"Based on what you've shared, you may benefit from our AI Opportunity Session—a complimentary session where we identify practical ways AI could save your team time and money. Would you like to book a time? You can schedule directly here:
https://cal.com/nishant-chaudhary-ai-strategy-partners/ai-opportunity-session"

If they are unsure:
"No problem. The team can also follow up with more information and help you decide whether a session would be useful."

VOICE AGENT RULES

- Ask one question per turn.
- Use short, natural sentences.
- Do not interrupt the visitor.
- If speech recognition is uncertain, ask for clarification.
- Repeat email addresses and phone numbers once for confirmation.
- If the visitor is silent, say:
  "Take your time."
- Offer an easy exit:
  "Would you prefer to continue here, speak with someone, or end the conversation?"

CHATBOT RULES

- Keep responses to one to three short paragraphs.
- Use bullets only when presenting multiple options or steps.
- Do not present the conversation as a rigid form.
- Remember information already provided.
- Do not ask for a phone number unless a phone call is requested or useful.

## RESPONSE FORMAT (CRITICAL — ALWAYS FOLLOW)

You MUST respond with valid JSON only — no markdown, no code fences, no extra text.
Use this format on every single turn:

{
  "reply": "your conversational response to the visitor",
  "lead_complete": false,
  "lead_data": null
}

Track lead information across turns in lead_data as it becomes available:

{
  "reply": "your conversational response",
  "lead_complete": false,
  "lead_data": {
    "name": "value or null",
    "email": "value or null",
    "company": "value or null",
    "company_size": "value or null",
    "phone": "value or null"
  }
}

When you have collected at minimum a name AND an email, set lead_complete to true:

{
  "reply": "your final confirmation message to the visitor",
  "lead_complete": true,
  "lead_data": {
    "name": "...",
    "email": "...",
    "company": "...",
    "company_size": "...",
    "phone": "..."
  }
}

Never include anything outside the JSON object. The "reply" field is what the visitor sees.
`;

// Extract readable text from HTML
function extractTextFromHTML(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

// Send email notification using Cloudflare Email Service
async function sendLeadEmail(env, leadData, chatSummary) {
  const ownerEmail = "nishant120889@gmail.com";
  const senderEmail = "hello@ncaistrategypartners.com";
  const timestamp = new Date().toISOString();

  const ownerSubject = "New Lead Captured - NCAI Strategy Partners";
  const ownerHTML = `
    <h2>New Lead Captured!</h2>
    <p><strong>Name:</strong> ${leadData.name || 'N/A'}</p>
    <p><strong>Email:</strong> ${leadData.email || 'N/A'}</p>
    <p><strong>Phone:</strong> ${leadData.phone || 'N/A'}</p>
    <p><strong>Company Size:</strong> ${leadData.company_size || 'N/A'}</p>
    <p><strong>Captured at:</strong> ${timestamp}</p>
    <h3>Chat Summary:</h3>
    <div style="background:#f5f5f5;padding:15px;border-radius:8px;white-space:pre-wrap;">${chatSummary}</div>
  `;

  try {
    // Send email to you (the business owner)
    await env.EMAIL.send({
      to: ownerEmail,
      from: senderEmail,
      subject: ownerSubject,
      html: ownerHTML,
      text: `New Lead: ${leadData.name || 'N/A'}, ${leadData.email || 'N/A'}, ${leadData.phone || 'N/A'}, Company size: ${leadData.company_size || 'N/A'}`
    });

    // Send confirmation email to the visitor
    if (leadData.email) {
      const customerHTML = `
        <h2>Thanks for reaching out, ${leadData.name || 'there'}!</h2>
        <p>We've received your inquiry and our team will follow up with you shortly.</p>
        <p>Here's a summary of our conversation:</p>
        <div style="background:#f5f5f5;padding:15px;border-radius:8px;white-space:pre-wrap;">${chatSummary}</div>
        <p>We look forward to speaking with you soon!</p>
        <p>Best regards,<br>NCAI Strategy Partners</p>
      `;
      await env.EMAIL.send({
        to: leadData.email,
        from: senderEmail,
        subject: "Thanks for reaching out - NCAI Strategy Partners",
        html: customerHTML,
        text: `Thanks for reaching out, ${leadData.name || 'there'}! We'll follow up with you shortly.`
      });
    }
    return true;
  } catch (e) {
    console.log("Email sending failed:", e.message);
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: Chat endpoint
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const { messages, sessionId } = body;

        // Fetch the index.html to get website content
        const pageResponse = await env.ASSETS.fetch(new Request("https://dummy/index.html"));
        const pageHTML = await pageResponse.text();
        const fullContent = extractTextFromHTML(pageHTML);
        const pageContent = fullContent.substring(0, 3000);

        // Build the conversation with system prompt + website context + chat history
        const conversationMessages = [
          {
            role: "system",
            content: `${assistantGuidance}\n\n## WEBSITE CONTENT (use ONLY this information to answer questions)\n${pageContent}`
          },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ];

        // Call the LLM
        const aiResponse = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fast",
          {
            messages: conversationMessages,
            max_tokens: 500,
            temperature: 0.7
          }
        );

        let replyText = aiResponse.response || aiResponse.result?.response || "I'm sorry, I didn't catch that. Could you repeat?";
        if (typeof replyText !== 'string') {
          replyText = JSON.stringify(replyText);
        }
        let leadComplete = false;
        let leadData = null;

        // Try to parse JSON response from LLM
        try {
          // Strip any markdown code blocks
          const cleanText = replyText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleanText);
          replyText = typeof parsed.reply === 'string' ? parsed.reply : String(parsed.reply || replyText);
          leadComplete = parsed.lead_complete || false;
          leadData = parsed.lead_data || null;
        } catch {
          // If LLM didn't return JSON, use the raw text
        }

        // If lead is complete, trigger email
        let emailSent = false;
        if (leadComplete && leadData) {
          const chatSummary = messages
            .map(m => `${m.role === 'user' ? 'Visitor' : 'Agent'}: ${m.content}`)
            .join('\n');
          emailSent = await sendLeadEmail(env, leadData, chatSummary);

          // Store in KV
          const leadId = `lead_${Date.now()}`;
          await env.LEADS.put(leadId, JSON.stringify({
            leadData,
            chatSummary,
            timestamp: new Date().toISOString(),
            emailSent
          }));
        }

        return new Response(JSON.stringify({
          reply: replyText,
          lead_complete: leadComplete,
          email_sent: emailSent
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: "Something went wrong. Please try again.",
          details: error.message
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // API: Get stored leads (protected by secret header)
    if (url.pathname === "/api/leads" && request.method === "GET") {
      // Basic auth: require a secret header to prevent public access
      const authHeader = request.headers.get("X-Leads-Key");
      if (authHeader !== env.LEADS_API_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      const list = await env.LEADS.list();
      const leads = [];
      for (const key of list.keys) {
        const value = await env.LEADS.get(key.name);
        if (value) leads.push(JSON.parse(value));
      }
      return new Response(JSON.stringify({ leads }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // API: Text-to-Speech using Deepgram Aura-2
    if (url.pathname === "/api/tts" && request.method === "POST") {
      try {
        const { text } = await request.json();

        const audioResponse = await env.AI.run(
          "@cf/deepgram/aura-2-en",
          {
            text: text,
            speaker: "helena",
            encoding: "mp3",
            container: "none"
          },
          {
            returnRawResponse: true
          }
        );

        return new Response(audioResponse.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-cache"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "TTS failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  }
};
