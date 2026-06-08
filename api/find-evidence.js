/**
 * POST /api/find-evidence   body: { topic?, argument? }
 *
 * Asks Claude (sonnet-4-6) to web-search for REAL, existing pages that support
 * the current conversation, and returns up to 3 unique links.
 *
 * Server-side web search is GA — no beta header. Real URLs are taken from the
 * `web_search_tool_result` blocks (Claude can't invent these), not from prose.
 *
 * Response: { links: [{ title, url, source }] }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
  }

  const { topic, argument } = req.body || {};
  if (!topic && !argument) {
    return res.status(400).json({ error: 'topic or argument is required' });
  }
  const query = [topic, argument].filter(Boolean).join(' — ');

  const tool = { type: 'web_search_20260209', name: 'web_search', max_uses: 3 };
  const allow = (process.env.EVIDENCE_ALLOWED_DOMAINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (allow.length) tool.allowed_domains = allow;

  const claudeBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system:
      "You are a research helper for a children's English-learning app. Use the web_search tool " +
      'to find REAL, currently-existing web pages that support or explain the topic the student is ' +
      'discussing. Strongly prefer reputable, age-appropriate, kid-friendly educational sources. ' +
      'Never invent URLs or titles — only surface pages you actually found via search.',
    messages: [{
      role: 'user',
      content: `Find up to 3 real, kid-friendly web pages that would help a young student learn about, or find evidence for: ${query}`,
    }],
    tools: [tool],
  };

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeBody),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.error?.message || `Claude API error ${upstream.status}`,
      });
    }

    // Collect real URLs from web_search_tool_result blocks (dedupe by hostname).
    const links = [];
    const seenHosts = new Set();
    for (const block of (data.content || [])) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item.type === 'web_search_result' && item.url) {
            let host = '';
            try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
            if (host && seenHosts.has(host)) continue;
            if (host) seenHosts.add(host);
            links.push({ title: item.title || host || item.url, url: item.url, source: host || 'web' });
            if (links.length >= 3) break;
          }
        }
      }
      if (links.length >= 3) break;
    }

    if (!links.length) {
      return res.status(502).json({ error: 'No links found in search results', links: [] });
    }
    return res.status(200).json({ links });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Claude', detail: String(err && err.message || err) });
  }
}
