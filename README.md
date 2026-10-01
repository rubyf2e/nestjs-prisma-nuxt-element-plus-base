# rss-notifier

### 初始需手動下指令的程式碼

```
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

### 建立 authentication module
nest g module auth
nest g controller auth
nest g service auth
nest g module users
nest g service users
```

### 調整資料庫時要下的指令

```
docker compose exec backend npx prisma migrate dev --create-only
docker compose exec backend npx prisma migrate
docker compose exec backend npx prisma migrate deploy
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d users"'

docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT
    table_name,
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_name IN ('users', 'magic_links')
ORDER BY table_name, ordinal_position;
SQL

docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT
    tc.constraint_name,
    tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_name = 'magic_links'
ORDER BY tc.constraint_name;
SQL
```
