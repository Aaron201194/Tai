const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // 1. CORS headers so TurboWarp Desktop & Web can always connect
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  // Health check route for Render (visiting the base URL in a browser)
  if (reqUrl.pathname === '/' && !reqUrl.searchParams.has('url')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('TurboWarp Discord Relay is ONLINE. Append /?url=<encoded_discord_api_url> to transmit.');
    return;
  }

  // 2. Extract and validate the target Discord API URL
  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl || !targetUrl.startsWith('https://discord.com/api/')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid target URL. Must start with https://discord.com/api/' }));
    return;
  }

  // 3. Buffer the full incoming body (supports JSON and multipart binary screenshots)
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const bodyBuffer = Buffer.concat(chunks);

  // 4. Build clean headers (strips Electron Origin and adds mandatory DiscordBot User-Agent)
  const forwardHeaders = {
    'User-Agent': 'DiscordBot (https://turbowarp.org, 2.0)'
  };
  if (req.headers['authorization']) {
    forwardHeaders['Authorization'] = req.headers['authorization'];
  }
  if (req.headers['content-type']) {
    forwardHeaders['Content-Type'] = req.headers['content-type'];
  }

  try {
    const discordRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuffer
    });

    const responseBuffer = Buffer.from(await discordRes.arrayBuffer());

    res.writeHead(discordRes.status, {
      'Content-Type': discordRes.headers.get('content-type') || 'application/json'
    });
    res.end(responseBuffer);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Relay fetch failed', details: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Discord Relay listening on port ${PORT}`);
});
