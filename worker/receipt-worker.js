/**
 * 泊車記錄 —— AI 讀入油單中轉 (Cloudflare Worker)
 * ================================================
 *
 * 點解需要佢？
 *   個 App 係 GitHub Pages 上嘅靜態網頁，冇後端。如果將 Anthropic API key
 *   寫落網頁度，任何人 View Source 都攞到，用你個 key 燒你錢。所以 key 一定
 *   要放喺呢個 Worker 嘅 Secret 入面，網頁只係叫呢個 Worker。
 *
 * 部署方法見同一個資料夾嘅 README.md。
 */

/* ── 設定 ────────────────────────────────────────────────────────── */

/** 只准呢啲網頁叫呢個 Worker。要加新網址就喺呢度加一行。 */
const ALLOWED_ORIGINS = [
  'https://ronlam1981.github.io',
  'http://localhost:8000',
  'http://localhost:8099',
  'http://127.0.0.1:8000',
];

/** 用邊個模型讀單。想慳錢可以改做 'claude-haiku-4-5'（平好多，讀清楚嘅單一樣得）。 */
const MODEL = 'claude-opus-5';

/** 相片上限（base64 字元數）。約等於 6MB 原檔。 */
const MAX_IMAGE_CHARS = 8_000_000;

/** 一張單大約嘅開支：輸入約 1,500 token、輸出約 200 token。
 *  claude-opus-5 約 US$0.013 一張；claude-haiku-4-5 約 US$0.0025 一張。 */

/** 要 AI 填返嚟嘅欄位。全部准 null —— 張單影唔清就唔好靠估。 */
const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    liters:          { anyOf: [{ type: 'number' }, { type: 'null' }], description: '入油量，公升' },
    price_per_liter: { anyOf: [{ type: 'number' }, { type: 'null' }], description: '每公升單價' },
    total:           { anyOf: [{ type: 'number' }, { type: 'null' }], description: '總金額' },
    currency:        { anyOf: [{ type: 'string' }, { type: 'null' }], description: '貨幣，例如 MOP、HKD' },
    station:         { anyOf: [{ type: 'string' }, { type: 'null' }], description: '油站名／分店' },
    datetime:        { anyOf: [{ type: 'string' }, { type: 'null' }], description: '單上的日期時間，ISO 8601，例如 2026-09-26T14:30:00' },
    odometer:        { anyOf: [{ type: 'number' }, { type: 'null' }], description: '里程錶讀數（好少單會有，冇就 null）' },
    fuel_grade:      { anyOf: [{ type: 'string' }, { type: 'null' }], description: '油品，例如 95、98、柴油' },
    confidence:      { type: 'string', enum: ['high', 'medium', 'low'], description: '整體把握程度' },
  },
  required: ['liters', 'price_per_liter', 'total', 'currency', 'station', 'datetime', 'odometer', 'fuel_grade', 'confidence'],
  additionalProperties: false,
};

const PROMPT =
  '呢張係加油站收據。抽出入油資料。\n' +
  '規則：\n' +
  '1. 只可以抽張單上面真係睇得到嘅數字，睇唔清或者冇寫嘅一律填 null，唔好估、唔好計。\n' +
  '2. 金額只要數字，唔好帶貨幣符號。\n' +
  '3. 澳門／香港嘅單通常寫「公升」或「L」；單價欄常寫成「單價」「Unit Price」。\n' +
  '4. 如果張單同時有小計同總額，total 填實際找數嗰個總額。\n' +
  '5. 日期只有 DD/MM 冇年份就當係今年。\n' +
  '6. 如果根本唔係加油單（例如泊車單、超市單），全部欄位填 null，confidence 填 low。';

/* ── 主程式 ──────────────────────────────────────────────────────── */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.endsWith('/receipt')) {
      return json({ error: '未知路徑，請用 POST /receipt' }, 404, cors);
    }
    if (request.method !== 'POST') {
      return json({ error: '請用 POST' }, 405, cors);
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: '呢個網址未獲授權叫呢個中轉' }, 403, cors);
    }

    const key = env.ANTHROPIC_API_KEY;
    if (!key) return json({ error: 'Worker 未設定 ANTHROPIC_API_KEY（見 README）' }, 500, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: '請求格式錯誤' }, 400, cors); }

    const image = body && body.image;
    if (!image || typeof image !== 'string') return json({ error: '冇收到相片' }, 400, cors);
    if (image.length > MAX_IMAGE_CHARS) return json({ error: '相片太大，請影細張啲' }, 413, cors);

    const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(body.media_type)
      ? body.media_type : 'image/jpeg';

    let resp;
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2048,
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
          },
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: PROMPT },
            ],
          }],
        }),
      });
    } catch (e) {
      return json({ error: '連唔到 AI 服務：' + e.message }, 502, cors);
    }

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = data && data.error ? (data.error.message || data.error.type) : ('HTTP ' + resp.status);
      return json({ error: 'AI 服務回報錯誤：' + msg }, 502, cors);
    }

    if (data.stop_reason === 'refusal') return json({ error: 'AI 拒絕處理呢張相' }, 422, cors);
    if (data.stop_reason === 'max_tokens') return json({ error: 'AI 回覆被截斷，請再試一次' }, 502, cors);

    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) return json({ error: 'AI 冇回覆內容' }, 502, cors);

    let parsed;
    try { parsed = JSON.parse(textBlock.text); }
    catch { return json({ error: 'AI 回覆唔係有效 JSON' }, 502, cors); }

    // 順手報返使用量，方便你睇住使費
    parsed._usage = data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : null;
    parsed._model = data.model || MODEL;

    return json(parsed, 200, cors);
  },
};

/* ── 小工具 ──────────────────────────────────────────────────────── */

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}
