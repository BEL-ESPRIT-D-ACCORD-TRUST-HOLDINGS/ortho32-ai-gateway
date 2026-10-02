// Local stand-in for the OpenAI / Anthropic HTTP APIs, for tests/e2e.sh.
// Replies with the prompt it received and appends each request (headers + parsed body) to $MOCK_LOG.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const log = process.env.MOCK_LOG;
const portFile = process.env.MOCK_PORT_FILE;

const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    let body;
    try { body = JSON.parse(raw); } catch { res.writeHead(400).end("bad json"); return; }
    appendFileSync(log, JSON.stringify({ path: req.url, headers: req.headers, body }) + "\n");
    const prompt = body.messages?.[0]?.content ?? "";
    const reply = req.url.startsWith("/anthropic")
      ? { content: [{ type: "text", text: "echo:" + prompt }] }
      : { choices: [{ message: { content: "echo:" + prompt } }] };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply));
  });
});
server.listen(0, "127.0.0.1", () => writeFileSync(portFile, String(server.address().port)));
