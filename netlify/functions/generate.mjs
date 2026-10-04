// MY NAGHI Content Hub — server-side AI.
// Runs on Netlify, keeps the Claude API key secret, and checks the team passcode.
// Settings (Netlify > Site configuration > Environment variables):
//   ANTHROPIC_API_KEY  required  your key from console.anthropic.com
//   TEAM_PASSCODE      optional  if set, people must enter it before AI works
//   CLAUDE_MODEL       optional  model name, see docs.claude.com/en/docs/about-claude/models

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const pass = process.env.TEAM_PASSCODE;
  if (pass && body.passcode !== pass) return json({ error: "Wrong passcode" }, 401);

  const prompt = String(body.prompt || "").slice(0, 12000);
  if (!prompt) return json({ error: "Empty prompt" }, 400);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) return json({ error: "AI request failed", status: r.status, detail: await r.text() }, 502);
  const data = await r.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return json({ text });
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export const config = { path: "/api/generate" };
