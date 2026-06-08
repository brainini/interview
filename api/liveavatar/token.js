/**
 * POST /api/liveavatar/token
 *
 * Mints a FULL-mode LiveAvatar session token using the server-side API key,
 * and returns it to the browser for the @heygen/liveavatar-web-sdk.
 *
 * Upstream: POST https://api.liveavatar.com/v1/sessions/token
 *   FULL-mode body: { mode:"FULL", avatar_id, avatar_persona:{ context_id }, is_sandbox }
 *   Response:       { code, message, data:{ session_id, session_token } }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey    = process.env.LIVEAVATAR_API_KEY;
  const avatarId  = process.env.LIVEAVATAR_AVATAR_ID;
  const contextId = process.env.LIVEAVATAR_CONTEXT_ID;
  const voiceId   = process.env.LIVEAVATAR_VOICE_ID;
  const language  = process.env.LIVEAVATAR_LANGUAGE || 'en';
  const isSandbox = String(process.env.LIVEAVATAR_SANDBOX || '').toLowerCase() === 'true';

  if (!apiKey || !avatarId) {
    return res.status(500).json({
      error: 'Server is missing LIVEAVATAR_API_KEY or LIVEAVATAR_AVATAR_ID environment variables.',
    });
  }

  // FULL mode requires an avatar_persona. context_id/voice_id are optional in the schema,
  // but an avatar with no default_voice (this one) requires voice_id — so set LIVEAVATAR_VOICE_ID.
  const persona = { language };
  if (contextId) persona.context_id = contextId;
  if (voiceId)   persona.voice_id   = voiceId;

  const body = {
    mode: 'FULL',
    avatar_id: avatarId,
    avatar_persona: persona,
    is_sandbox: isSandbox,
  };

  try {
    const upstream = await fetch('https://api.liveavatar.com/v1/sessions/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.message || `LiveAvatar token error ${upstream.status}`,
        detail: data,
      });
    }

    const token     = data.data?.session_token || data.session_token;
    const sessionId = data.data?.session_id    || data.session_id || null;
    if (!token) {
      return res.status(502).json({ error: 'No session_token in LiveAvatar response', detail: data });
    }

    return res.status(200).json({ token, sessionId });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach LiveAvatar', detail: String(err && err.message || err) });
  }
}
