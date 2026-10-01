# Magic Link Login + JWT + Queue + Redis + Scheduler（基本版）

這是以 Email Magic Link 登入為核心的 NestJS Backend 基本範例，串接 JWT、BullMQ/Redis 背景寄信，以及定期清理過期登入連結。此版本聚焦登入與背景工作基礎；RSS feed 管理、同步通知與 Frontend 應用頁面尚未實作。

## 技術組成

- API 與登入：NestJS 12、TypeScript、Prisma 7、PostgreSQL 16、JWT。
- 背景寄信：BullMQ、Redis 7、Nest Mailer、Nodemailer、Handlebars。
- 定期工作：NestJS Scheduler 每日清理過期且未使用的 Magic Link。
- 開發環境：Docker Compose 提供 Backend、PostgreSQL、Redis 與 Nuxt 4 Frontend dev server。

## 快速啟動

需求：Docker、Docker Compose。

1. 建立環境設定：

```sh
cp .env.example .env
```

2. 編輯 `.env`，至少設定 `JWT_SECRET`、`MAIL_USER`、`MAIL_PASS` 與寄件者 `MAIL_FROM`。`JWT_SECRET` 請換成隨機秘密值；SMTP 範例使用 Ethereal，需填入有效帳號才能收取測試郵件。

3. 建立並啟動服務：

```sh
docker compose up --build -d
docker compose ps
```

Backend API 預設為 `http://localhost:3000`，Frontend dev server 預設為 `http://localhost:3001`。Backend entrypoint 啟動時會執行 `prisma db push` 與 `prisma generate`。

> `db push` 會將目前 Prisma schema 同步到資料庫。正式環境部署前，請先建立並檢視 migration；不要把開發環境的自動同步當成正式資料庫遷移流程。

## 環境變數

- PostgreSQL：`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`、`POSTGRES_PORT`、`DATABASE_URL`。
- Redis：`REDIS_PORT`、`REDIS_URL`。
- Backend：`PORT`、`BACKEND_PORT`。
- SMTP：`MAIL_HOST`、`MAIL_PORT`、`MAIL_SECURE`、`MAIL_USER`、`MAIL_PASS`、`MAIL_FROM`。
- JWT：`JWT_SECRET`、`JWT_EXPIRES_IN`。
- Magic Link：`MAGIC_LINK_TTL_MINUTES`、`FRONTEND_URL`。
- Frontend dev server：`FRONTEND_PORT`、`NUXT_PUBLIC_API_BASE`。
- `FEED_SYNC_INTERVAL_MINUTES`：範例保留的預留設定；此基本版尚無 Feed sync scheduler，設定不會觸發同步。

變數範例與預設值請以 [.env.example](.env.example) 為準。Compose 內 Backend 連線使用服務名稱 `postgres` 和 `redis`，不要將容器內連線 URL 改成 `localhost`。

## API

### 健康檢查

```http
GET /
```

成功回應：`200 OK`，內容為 `Hello World!`。

### 要求登入連結

```http
POST /auth/magic-link
Content-Type: application/json

{
    "email": "user@example.com"
}
```

成功回應為 `202 Accepted`，不揭露 Email 是否已註冊：

```json
{
  "message": "If this email can be used, a login link has been sent."
}
```

新 Email 會建立 User；Magic Link token 只以 SHA-256 hash 儲存。信件加入 BullMQ 的 `mail` queue，由 Worker 使用 Handlebars template 和 MailerService 在背景寄送。連結效期由 `MAGIC_LINK_TTL_MINUTES` 設定，預設 15 分鐘。

### 驗證登入連結

```http
GET /auth/magic-link/verify?token=<email-link-token>
```

成功時回傳 `200 OK`、JWT 與使用者公開 ID：

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "<public-id>",
    "email": "user@example.com"
  }
}
```

token 不存在、已過期或已使用時回傳 `401 Unauthorized`；token 為單次使用。資料庫使用 BigInt 作為內部 User ID，API 的 `user.id` 與 JWT `userId` 使用 User `publicId`。登入連結目前須由 Email 取得，再呼叫上述 API 完成驗證。

## Postman

匯入 [API Postman collection](postman/rss-notifier-api.postman_collection.json)。Collection 包含目前所有 Backend routes 及輸入錯誤案例。使用前設定 `baseUrl` 與 `email`；成功驗證案例需先從登入信取得 token，填入 `magicLinkToken`。

## Background 工作與記錄

- Mail queue：`mail`。Magic Link request enqueue 收件者與登入 URL；Worker 負責套用 Handlebars template 並呼叫 MailerService。
- Redis：提供 BullMQ queue backend，不作為主要業務資料庫。
- Magic Link cleanup：每日午夜以批次方式刪除 `usedAt IS NULL` 且 `expiresAt < now` 的資料。
- Scheduler log：`/app/logs/backend-scheduler.jsonl`，JSON Lines 格式，記錄排程名稱、開始/結束時間、成功/失敗、耗時及必要的錯誤資訊。Docker named volume `backend_scheduler_logs` 會跨 container recreate 持久保存。
- 檢視服務 log：

  ```sh
  docker compose logs -f backend
  docker compose exec backend tail -f /app/logs/backend-scheduler.jsonl
  ```

停止服務但保留資料：

```sh
docker compose down
```

`docker compose down -v` 會一併刪除 PostgreSQL、Redis 與 Scheduler log 等 named volumes，請只在確定要清除所有持久資料時使用。

## 測試與檢查

Backend 指令依專案規則在 Docker container 執行：

```sh
docker compose exec backend npm test -- --runInBand
docker compose exec backend npm run lint
docker compose exec backend npm run build
```

Frontend build：

```sh
docker compose exec frontend npm run build
```
