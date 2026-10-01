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
