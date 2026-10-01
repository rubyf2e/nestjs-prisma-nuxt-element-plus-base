#!/bin/sh
set -e

# 產生 Prisma Client，並將 schema.prisma 同步到資料庫（無須手動下 SQL）
npx prisma db push
npx prisma generate
exec "$@"
