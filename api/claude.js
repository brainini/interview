/**
 * POST /api/claude   body: { system?, messages, max_tokens? }
 *
 * Plain Claude (sonnet-4-6) call with NO tools — used for the end-of-session
 * "Lumi's feedback" on the transcript. The conversation itself is handled by
 * the LiveAvatar (FULL mode), not here.
 *
 * Response: { text }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
  }

  const { system, messages, max_tokens } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 512,
        system: system || '',
        messages,
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.error?.message || `Claude API error ${upstream.status}`,
      });
    }

    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n\n')
      .trim();

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Claude', detail: String(err && err.message || err) });
  }
}
