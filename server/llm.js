// One text-model interface for the whole platform.
// Order: the Nashmi model (OpenAI-compatible) when AI_BASE_URL is set, otherwise Google Gemini, otherwise none (callers fall back).

const NASHMI_BASE = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
const NASHMI_KEY = process.env.AI_API_KEY || '';
const NASHMI_MODEL = process.env.AI_MODEL || 'nashmi';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview';
// Busy or retired models are skipped automatically, in this order.
const GEMINI_MODELS = [...new Set([GEMINI_MODEL, 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'])];
const RETRYABLE = new Set([404, 429, 500, 503, 504]);
const CONNECT_TIMEOUT = 25_000;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function provider({ multimodal = false } = {}) {
  // Attachments (images, PDFs) go to Gemini, which reads them natively.
  if (NASHMI_BASE && NASHMI_KEY && !multimodal) return { name: 'nashmi', model: NASHMI_MODEL };
  if (GEMINI_KEY) return { name: 'gemini', model: GEMINI_MODEL };
  if (NASHMI_BASE && NASHMI_KEY) return { name: 'nashmi', model: NASHMI_MODEL };
  return null;
}

export const llmStatus = () => {
  const p = provider();
  return p ? { connected: true, provider: p.name, model: p.model } : { connected: false, provider: null, model: null };
};

// messages: [{ role: 'user'|'assistant', content: string, files?: [{ mime, data(base64) }] }]
function toGemini(system, messages, { json, temperature }) {
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [...(m.files || []).map((f) => ({ inline_data: { mime_type: f.mime, data: f.data } })), { text: m.content || ' ' }],
    })),
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
}

function toOpenAI(system, messages, { json, temperature, stream }) {
  return {
    model: NASHMI_MODEL, temperature, stream,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m) => ({ role: m.role, content: m.content }))],
  };
}

async function failure(res, label) {
  const body = await res.text().catch(() => '');
  const err = new Error(`${label} ${res.status}: ${body.slice(0, 300)}`);
  err.status = res.status;
  return err;
}

// Tries each Gemini model until one answers; a model that is overloaded, rate-limited or slow to respond is skipped.
async function geminiFetch(method, body, { totalTimeout = 180_000 } = {}) {
  let lastErr;
  for (const model of GEMINI_MODELS) {
    const ctrl = new AbortController();
    const connect = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT);
    try {
      const res = await fetch(`${GEMINI_URL}/${model}:${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body), signal: ctrl.signal,
      });
      clearTimeout(connect);
      if (res.ok) {
        setTimeout(() => ctrl.abort(), totalTimeout).unref();
        return { res, model };
      }
      lastErr = await failure(res, `Gemini ${model}`);
      if (!RETRYABLE.has(res.status)) throw lastErr;
    } catch (err) {
      clearTimeout(connect);
      if (err === lastErr && !RETRYABLE.has(err.status)) throw err;
      if (err.name === 'AbortError') lastErr = Object.assign(new Error(`Gemini ${model} timed out`), { status: 504 });
      else if (err !== lastErr) lastErr = Object.assign(err, { status: err.status || 503 });
    }
    console.warn(`[llm] ${model} unavailable (${lastErr.status}), trying the next model`);
  }
  throw lastErr;
}

export async function complete({ system, messages, json = false, temperature = 0.7 }) {
  const multimodal = messages.some((m) => m.files?.length);
  const p = provider({ multimodal });
  if (!p) throw Object.assign(new Error('No language model configured'), { code: 'NO_LLM' });
  if (p.name === 'gemini') {
    const { res, model } = await geminiFetch('generateContent', toGemini(system, messages, { json, temperature }), { totalTimeout: 120_000 });
    const data = await res.json();
    return { text: (data.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join(''), provider: { ...p, model } };
  }
  const res = await fetch(`${NASHMI_BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NASHMI_KEY}` },
    body: JSON.stringify(toOpenAI(system, messages, { json, temperature })), signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw await failure(res, 'Nashmi');
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? '', provider: p };
}

// Reads a server-sent-events body and yields each `data:` payload.
async function* sse(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}

// Streams text chunks; returns the full text.
export async function stream({ system, messages, temperature = 0.6, onToken }) {
  const multimodal = messages.some((m) => m.files?.length);
  const p = provider({ multimodal });
  if (!p) throw Object.assign(new Error('No language model configured'), { code: 'NO_LLM' });
  let full = '';
  if (p.name === 'gemini') {
    const { res, model } = await geminiFetch('streamGenerateContent?alt=sse', toGemini(system, messages, { temperature }));
    p.model = model;
    for await (const payload of sse(res)) {
      try {
        const piece = (JSON.parse(payload).candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
        if (piece) { full += piece; onToken?.(piece); }
      } catch { /* keep-alive or partial line */ }
    }
  } else {
    const res = await fetch(`${NASHMI_BASE}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NASHMI_KEY}` },
      body: JSON.stringify(toOpenAI(system, messages, { temperature, stream: true })), signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw await failure(res, 'Nashmi');
    for await (const payload of sse(res)) {
      if (payload === '[DONE]') break;
      try {
        const piece = JSON.parse(payload).choices?.[0]?.delta?.content || '';
        if (piece) { full += piece; onToken?.(piece); }
      } catch { /* ignore */ }
    }
  }
  return { text: full, provider: p };
}
