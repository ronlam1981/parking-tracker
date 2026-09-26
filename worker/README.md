# AI 讀入油單 — 部署說明

影低入油單，Claude 會讀返入油量、單價、金額、日期同油站，自動填入表格。

## 點解要有呢個 Worker

個 App 係 GitHub Pages 上嘅靜態網頁，任何人都可以 View Source。
如果將 Anthropic API key 寫落網頁，等於公開派 key 俾人用你個帳號燒錢。
所以 key 一定要存喺呢個 Worker 嘅 **Secret**，網頁只係叫呢個 Worker。

## 使費

一張單大約：輸入 1,500 token、輸出 200 token。

| 模型 | 每張單大約 | 一個月影 20 張 |
|---|---|---|
| `claude-opus-5`（預設，最準） | 約 US$0.013 | 約 US$0.26 |
| `claude-haiku-4-5`（最平） | 約 US$0.0025 | 約 US$0.05 |

想慳錢就改 `receipt-worker.js` 最上面嘅 `MODEL`。清晰嘅單 Haiku 一樣讀得到；
影得矇或者手寫嘅單，Opus 準好多。

Cloudflare Workers 免費計劃每日 100,000 次請求，呢個用量完全唔使錢。

## 第一步：攞 Anthropic API key

1. 去 https://console.anthropic.com/ 登記／登入
2. Settings → API Keys → Create Key，抄低（`sk-ant-...`，只顯示一次）
3. Billing 入面充值（最少 US$5，夠用好耐）

## 第二步：部署 Worker

### 做法 A — Cloudflare 網頁（唔使裝任何嘢）

1. 去 https://dash.cloudflare.com/ → **Workers & Pages** → **Create** → **Create Worker**
2. 改個名，例如 `parking-receipt-ai` → **Deploy**
3. **Edit code** → 將 `receipt-worker.js` 全部內容貼入去，覆蓋原本嘅 → **Deploy**
4. 返去該 Worker → **Settings** → **Variables and Secrets** → **Add**
   - Type 揀 **Secret**
   - Name 打 `ANTHROPIC_API_KEY`
   - Value 貼你個 key → **Deploy**
5. 抄低個網址，例如 `https://parking-receipt-ai.你個帳號.workers.dev`

### 做法 B — 用指令

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # 貼個 key
npx wrangler deploy
```

## 第三步：填入 App

打開泊車記錄 App → **設定** → **AI 讀入油單 — 中轉網址** → 貼上面個網址 → 完成。

之後喺「管理車輛 → 揀架車 → ⛽ 入油 → 新增入油」就會見到「📷 影入油單，AI 自動填數」。

## 安全設計

- API key 只存喺 Cloudflare Secret，網頁同 git 都冇
- `ALLOWED_ORIGINS` 限制咗只有你個 App 個網址可以叫呢個 Worker，
  第二個網站抄你個 Worker 網址都用唔到
- 相片上限 6MB，防止有人用大檔燒你 token
- Worker 唔會儲存任何相片或數據，只係即時轉發

## 讀唔準點算

- AI 睇唔清嘅欄位會留空（填 `null`），唔會靠估 —— 咁你至少知道邊個數要自己補
- 每次都會顯示「請核對一次先儲存」，因為單據影得矇係好常見嘅事
- 完全唔想用 AI？設定入面留空個網址就得，影相照樣存底，數自己填
