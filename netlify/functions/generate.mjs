// MY NAGHI Content Hub — server-side AI.
// Runs on Netlify, keeps the Claude API key secret, and checks the team passcode.
// Settings (Netlify > Project configuration > Environment variables):
//   ANTHROPIC_API_KEY   required  your key from console.anthropic.com (starts with sk-ant-)
//   TEAM_PASSCODE       optional  if set, people must enter it before AI works
//   CLAUDE_MODEL        optional  "Best quality" model (default claude-sonnet-5-5)
//   CLAUDE_MODEL_FAST   optional  "Fast" model (default claude-haiku-4-5-20251001)

const API = "https://api.anthropic.com/v1/messages";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const pass = process.env.TEAM_PASSCODE;
  if (pass && body.passcode !== pass) return json({ error: "Wrong passcode" }, 401);

  const prompt = String(body.prompt || "").slice(0, 12000);
  if (!prompt) return json({ error: "Empty prompt" }, 400);
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);

  const model = body.quality === "best"
    ? (process.env.CLAUDE_MODEL || "claude-sonnet-5-5")
    : (process.env.CLAUDE_MODEL_FAST || "claude-haiku-4-5-20251001");

  const upstream = await fetch(API, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      stream: !!body.stream,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.log("Claude error", upstream.status, detail.slice(0, 500));
    return json({ error: "AI request failed", status: upstream.status, detail }, 502);
  }

  // Non-streaming (older pages)
  if (!body.stream) {
    const data = await upstream.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    return json({ text, model });
  }

  // Streaming: pass Claude's text through as it is written
  const enc = new TextEncoder(), dec = new TextDecoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.body.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            const d = line.slice(5).trim();
            if (!d || d === "[DONE]") continue;
            try {
              const ev = JSON.parse(d);
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
              if (ev.type === "error") { console.log("Claude stream error", d); ctrl.enqueue(enc.encode("\n[[error]]")); }
            } catch { /* ignore partial lines */ }
          }
        }
      } catch (e) {
        console.log("Stream failed", String(e));
        ctrl.enqueue(enc.encode("\n[[error]]"));
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export const config = { path: "/api/generate" };
