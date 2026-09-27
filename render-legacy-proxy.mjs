import http from "node:http";

const targetBase = process.env.LEGACY_PROXY_TARGET;
if (!targetBase) throw new Error("LEGACY_PROXY_TARGET is required");
const port = Number(process.env.PORT || 10000);

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 25 * 1024 * 1024) {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large" }));
        return;
      }
      chunks.push(chunk);
    }

    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const target = new URL(req.url || "/", targetBase);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];

    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      redirect: "manual",
    });

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      if (!["transfer-encoding", "content-length", "connection"].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    res.writeHead(response.status, responseHeaders);
    const responseBody = Buffer.from(await response.arrayBuffer());
    res.end(responseBody);
  } catch (error) {
    console.error("[legacy-proxy]", error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Upstream API unavailable" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Legacy City Connect API proxy listening on port ${port} -> ${targetBase}`);
});
