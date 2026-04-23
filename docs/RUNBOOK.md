# Runbook

實務運維指南 — 如何部署、監控、除錯、回滾。

## 部署架構

```
Internet
  └─► Cloudflare edge
       └─► cloudflared tunnel (d80c3434-fb96-4cdb-a689-52539106de86)
            └─► https://cert.nlpnchu.org → http://localhost:3456 (module-verifier)
```

- **Process**:`cloudflared tunnel run`(長駐,`nohup` + `disown`)+ `npm run dev`(tsx watch)
- **Tunnel 設定檔**:`/user_data/.cloudflared/config.yml`
- **Ingress rule**:`cert.nlpnchu.org → localhost:3456`
- **認證**:HTTP Basic Auth(`auth.json`,單帳號 `staff`)

## 部署新版本

1. SSH 到 server 機器(目前為 `yfan@...`)
2. `cd /user_data/claude_projects/模組驗證`
3. `git pull --rebase origin master`
4. `npm install`(如 package.json 有變動)
5. `npm test` — 本地跑過才上 production
6. 若跑 `npm run dev`:tsx watch 會自動偵測檔案變動重載,**無需重啟**
7. 若跑 `npm start`:`kill` 舊 process 後重新 `nohup npm start &`

## 驗證部署成功

```bash
# 1. 本地 health check
curl -sI http://localhost:3456/ | head -1  # 期待 HTTP/1.1 401 (auth 生效)

# 2. 外部 health check
PASS=$(jq -r '.[0].password' auth.json)
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -u "staff:$PASS" https://cert.nlpnchu.org/overview
# 期待 HTTP 200
```

## 更新運維資料

| 資料 | 動作 |
|------|------|
| **新學年成績** | 新 xlsx 覆蓋 `20260420.xlsx`,tsx watch 會重載;用 `touch src/student-api.ts` 強制觸發 |
| **模組定義異動** | 編輯 `modules_data.json`(或透過 `scripts/import-course-codes.ts --apply`) |
| **新增/移除職員帳號** | 編輯 `auth.json`,**必須 `touch src/server.ts` 觸發重載**(auth.json 沒在 tsx watch 路徑內) |
| **密碼輪替** | 更新 `auth.json` 後同上 |

## 監控

### 即時 log

```bash
# module-verifier server (nohup 模式)
tail -f /tmp/claude-1000/.../b71w1uhf8.output   # 若背景跑
# 或 dev 模式直接看 terminal 輸出
```

cloudflared tunnel log:

```bash
tail -f /user_data/.cloudflared/logs/tunnel.log
```

### 檢查 process

```bash
pgrep -af "tsx.*server.ts"       # module-verifier dev process
pgrep -af "cloudflared tunnel"   # tunnel process (應有一支 `run` 和可能一支 `--url`)
ss -tlnp | grep :3456             # port 3456 是否 listen
```

### 關鍵指標(可以手動做 sanity check)

```bash
PASS=$(jq -r '.[0].password' auth.json)
curl -s -u "staff:$PASS" https://cert.nlpnchu.org/api/modules | jq 'length'
# 期待 73(模組數)
```

## 常見問題 + 修復

### HTTP 502(Bad Gateway)

tunnel 轉到 localhost:3456 但沒有 process listen。
```bash
pgrep -af "tsx.*server.ts" || (cd /user_data/claude_projects/模組驗證 && nohup npm start &)
```

### 首次 `/overview` 超過 30s 才回

正常 — 首次載入要跑 2,120 × 73 次 verify(~6–15s)。cache 後瞬回。若持續超過 30s,檢查 Node heap:

```bash
top -p $(pgrep -f tsx)   # 查 RES 記憶體
```

### `feedback.json` 解析失敗

`feedback-store.ts` 已防呆(try/catch),回傳空陣列 + console.error。修法:備份原檔後讓 server 重建。
```bash
mv feedback.json feedback.json.bak.$(date +%s)
# 下次 POST /feedback 會自動建立新檔
```

### cloudflared tunnel 重新載入 config

cloudflared **不支援 SIGHUP 重載 config**(只做 log rotate)。修改 `~/.cloudflared/config.yml` 後:

```bash
pkill -TERM -f "cloudflared tunnel run"
# 等幾秒確認退出後
nohup cloudflared tunnel run >> /user_data/.cloudflared/logs/tunnel.log 2>&1 &
disown
```

⚠️ 此動作會同時短暫中斷所有共用此 tunnel 的服務(本專案 + asr/demeter/career)。

### 認證彈窗後 HTTP 500

歷史 bug:`hono/basic-auth` 的 `realm` 含非 ASCII 字元時 `WWW-Authenticate` header 序列化失敗。若復發,確認 `src/server.ts` 的 `realm` 仍為純 ASCII(目前是 `'NCHU Module Verifier'`)。

## Rollback

本專案無 CI/CD,部署即 `git pull` + 自動 reload。Rollback = `git reset`:

```bash
git log --oneline -10            # 找要回到的 commit
git reset --hard <commit-hash>   # 回到該 commit
# tsx watch 會自動 reload 新 HEAD 的 code
```

**緊急急救**:直接退回前一 commit
```bash
git reset --hard HEAD~1
```

`modules_data.json` 為資料檔,受 git 管理 — `git checkout HEAD~1 -- modules_data.json` 可局部回退。

## Secret / 個資檔案

以下**絕對不得入 repo**(已列入 `.gitignore`):

- `auth.json` — 帳密明文
- `20260420.xlsx`、`20260410-4dept.xlsx` — 含學號、姓名、成績
- `feedback.json` — 可能含學生身份資訊

> ⚠️ 若不慎 commit 了上述檔案:`git filter-repo` 清 history、force push、立刻輪替密碼、通知相關人員。

## 聯絡

問題 / bug report → `https://github.com/UDICatNCHU/module-verifier/issues`
