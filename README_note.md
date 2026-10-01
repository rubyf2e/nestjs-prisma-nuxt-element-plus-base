# rss-feed-notifier

```
## 後端
PORT=3000 npm run start:dev

### nestjs 基底
https://docs.nestjs.com/first-steps
https://docs.nestjs.cn/

npm i -g @nestjs/cli
nest new backend
rm -rf backend/.git

cd backend

### prisma 資料庫
https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction?utm_source=chatgpt.com
npm install prisma@prev --save-dev
npm install @prisma/client@7 @prisma/adapter-pg pg
npx prisma init

### 基本依賴套件
npm install @nestjs/config
npm install class-validator class-transformer
npm install @nestjs-modules/mailer nodemailer
npm install handlebars
npm install @nestjs/schedule
npm install ioredis
npm install --save @nestjs/jwt passport-jwt
npm install --save @nestjs/bullmq bullmq
npm install -D dotenv-cli
npm install rss-parser
npm install ipaddr.js
npm install ip-address


### 建立 authentication module
nest g module auth
nest g controller auth
nest g service auth
nest g module users
nest g service users

## 前端
npm run dev -- --port 3001

### nestjs 基底
https://nuxt.com/docs/4.x/getting-started/installation
https://element-plus.org/en-US/guide/installation

npm create nuxt@latest frontend
npm install element-plus --save

```

### 常用指令

```
docker compose build --no-cache
docker compose up -d
docker compose stop
docker compose down -v

docker compose exec backend npx prisma migrate dev --name init
docker compose exec backend npx prisma migrate status
docker compose exec backend npx prisma generate

docker compose exec backend npm install @nestjs/jwt passport-jwt

docker compose exec redis redis-cli keys '*'
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli info server | grep redis_version

docker compose logs -f backend
docker compose logs -f frontend
docker compose restart frontend

```

### 測試

```
cd backend
find . -type f -name "*.spec.ts" -not -path "./node_modules/*"

docker compose exec backend npm run test:e2e
docker compose exec backend npm test

docker compose exec backend \
  node -e "fetch('http://host.docker.internal:4000/feed.xml').then(async r => console.log(r.status, await r.text())).catch(console.error)"
200 <?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RSS Test Server</title>
    <link>http://localhost:4000</link>
    <description>用於測試 RSS 通知功能的最小 RSS 2.0 Server</description>
    <item>
      <guid>a5663e11-7bde-480f-b3f8-31a3fe33e918</guid>
      <title>第一篇測試文章</title>
      <link>http://localhost:4000/articles/1</link>
      <pubDate>Fri, 25 Sep 2026 09:29:44 GMT</pubDate>
    </item>
  </channel>
</rss>


curl -X POST http://localhost:3000/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "terry.waters@ethereal.email"}'


http://localhost:3001/login
http://localhost:3001/unsubscribe?token=xxx_your_token_here_xxx
http://localhost:3001/add-feed
```

### Feed Sync Scheduler 間隔設定

Feed 同步排程（`FeedSyncScheduler`）的執行間隔透過環境變數 `FEED_SYNC_INTERVAL_MINUTES` 控制，不需要修改程式碼：

- 未設定 `FEED_SYNC_INTERVAL_MINUTES`，或設為 `0`、負數、非數字字串時，會自動回退為預設值 **15 分鐘**。
- 設定為正整數（分鐘）時，依該數值作為同步間隔。

驗收步驟：

1. 在 `.env` 中不設定 `FEED_SYNC_INTERVAL_MINUTES`（或移除該行），重啟 backend，確認 Feed 同步約每 15 分鐘執行一次。
2. 在 `.env` 中設定：
   ```
   FEED_SYNC_INTERVAL_MINUTES=1
   ```
   重啟 backend（`docker compose up -d --build backend` 或 `docker compose restart backend`），確認 Feed 同步約每 1 分鐘執行一次，過程中不需要修改任何程式碼或 `@Cron()` 設定。
3. 若上一輪同步尚未完成（例如同步耗時超過 1 分鐘），排程不會啟動第二個同步工作；同步發生例外時，排程仍會持續在下一個週期繼續執行，不會中止。
