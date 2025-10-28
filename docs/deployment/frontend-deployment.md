# 前端应用部署指南

本指南详细说明如何部署 LICODE x402 前端应用。

## 📋 目录

- [技术架构](#技术架构)
- [前置准备](#前置准备)
- [环境配置](#环境配置)
- [本地开发部署](#本地开发部署)
- [生产环境部署](#生产环境部署)
  - [Vercel 部署](#方式-1-vercel-部署推荐)
  - [传统服务器部署](#方式-2-传统服务器部署)
  - [Docker 部署](#方式-3-docker-部署)
- [故障排查](#故障排查)

---

## 🏗 技术架构

### 前端职责

前端应用为用户提供代币铸造界面，支持：

1. **三种支付方式**：
   - 手动提交交易哈希
   - 扫描 QR 码支付
   - 钱包连接直接转账

2. **实时数据展示**：
   - 合约统计信息
   - 铸造进度
   - 用户余额

3. **钱包集成**：
   - MetaMask
   - Coinbase Wallet
   - WalletConnect

### 技术栈

- Next.js 14.2
- React 18
- TypeScript
- wagmi 2.13
- viem 2.9
- TanStack Query 5.59
- Tailwind CSS

---

## 🔧 前置准备

### 1. 系统要求

- Node.js 18+
- pnpm 8+
- 已部署的后端服务
- 已部署的智能合约

### 2. 安装依赖

```bash
cd frontend
pnpm install
```

---

## ⚙️ 环境配置

### 1. 创建环境变量文件

```bash
cd frontend
cp .env.example .env.local
```

### 2. 配置环境变量

编辑 `frontend/.env.local`:

```bash
# ===== 网络配置 =====
# Base 主网
NEXT_PUBLIC_CHAIN_ID=8453

# Base Sepolia 测试网
# NEXT_PUBLIC_CHAIN_ID=84532

# ===== 合约地址 =====
# LICODE Token 地址（从智能合约部署获得）
NEXT_PUBLIC_TOKEN_ADDRESS="0x合约地址"

# USDC 地址
# Base 主网：
NEXT_PUBLIC_USDC_ADDRESS="0x833589fCD6eDb6E08f4c7C38f3dCF7E808A7C366"

# Base Sepolia 测试网：
# NEXT_PUBLIC_USDC_ADDRESS="0x036CbD53842c5426634e7929541eC2318f3dCF7e"

# ===== 支付配置 =====
# Treasury 地址（接收 USDC 的地址）
NEXT_PUBLIC_TREASURY_ADDRESS="0x收款地址"

# 铸造价格（用户界面显示，单位：USDC）
NEXT_PUBLIC_MINT_USDC="1"

# ===== 后端 API =====
# 后端 API 地址（可选，Next.js 会自动代理）
# NEXT_PUBLIC_API_URL="https://api.yourdomain.com"

# 开发环境
# NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### 3. 配置网络信息

编辑 `app/providers.tsx`（如需修改 RPC）:

```typescript
const config = createConfig({
  chains: [base],  // 或 baseSepolia
  transports: {
    [base.id]: http('https://mainnet.base.org'),  // 自定义 RPC
  },
  // ...
})
```

### 4. 配置 API 代理（开发环境）

编辑 `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*', // 后端地址
      },
    ]
  },
}

module.exports = nextConfig
```

---

## 💻 本地开发部署

### 1. 启动开发服务器

```bash
cd frontend
pnpm run dev
```

**预期输出**：
```
   ▲ Next.js 14.2.0
   - Local:        http://localhost:3000
   - Network:      http://192.168.1.100:3000

 ✓ Ready in 2.5s
```

### 2. 访问应用

打开浏览器访问 http://localhost:3000

### 3. 测试功能

- [ ] 页面正常加载
- [ ] 钱包连接功能正常
- [ ] 可以看到合约统计数据
- [ ] 支付按钮可点击
- [ ] 无控制台错误

---

## 🚀 生产环境部署

### 方式 1: Vercel 部署（推荐）

Vercel 是 Next.js 官方推荐的部署平台，提供零配置部署。

#### 1.1 安装 Vercel CLI

```bash
npm install -g vercel
```

#### 1.2 登录 Vercel

```bash
vercel login
```

#### 1.3 部署

```bash
cd frontend

# 首次部署
vercel

# 生产部署
vercel --prod
```

#### 1.4 配置环境变量（Web 界面）

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的项目
3. 进入 **Settings** → **Environment Variables**
4. 添加以下变量：

```
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C38f3dCF7E808A7C366
NEXT_PUBLIC_TREASURY_ADDRESS=0x...
NEXT_PUBLIC_MINT_USDC=1
```

5. 重新部署：`vercel --prod`

#### 1.5 配置自定义域名

1. 在 Vercel Dashboard 中进入 **Domains**
2. 添加你的域名
3. 按照提示配置 DNS 记录

#### 1.6 配置后端代理（Vercel）

编辑 `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.yourdomain.com/api/:path*"
    }
  ]
}
```

### 方式 2: 传统服务器部署

#### 2.1 构建应用

```bash
cd frontend
pnpm run build
```

**预期输出**：
```
   ▲ Next.js 14.2.0

   Creating an optimized production build ...
 ✓ Compiled successfully
 ✓ Collecting page data
 ✓ Generating static pages
 ✓ Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                    5.2 kB          87 kB
└ ○ /_not-found                          871 B           83 kB
```

#### 2.2 使用 PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start npm --name licode-frontend -- start

# 查看状态
pm2 status

# 设置开机自启
pm2 save
pm2 startup
```

#### 2.3 使用 Systemd

创建 `/etc/systemd/system/licode-frontend.service`:

```ini
[Unit]
Description=LICODE Frontend Service
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl start licode-frontend
sudo systemctl enable licode-frontend
```

#### 2.4 配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/licode-frontend
```

内容：
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/licode-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 2.5 配置 SSL（Let's Encrypt）

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 方式 3: Docker 部署

#### 3.1 创建 Dockerfile

在 `frontend/` 目录创建 `Dockerfile`:

```dockerfile
FROM node:18-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm install -g pnpm && pnpm run build

# Production
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

#### 3.2 修改 next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',  // 添加这一行
  // ...
}
```

#### 3.3 构建和运行

```bash
# 构建镜像
docker build -t licode-frontend .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -e NEXT_PUBLIC_CHAIN_ID=8453 \
  -e NEXT_PUBLIC_TOKEN_ADDRESS=0x... \
  -e NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C38f3dCF7E808A7C366 \
  -e NEXT_PUBLIC_TREASURY_ADDRESS=0x... \
  -e NEXT_PUBLIC_MINT_USDC=1 \
  --name licode-frontend \
  licode-frontend

# 查看日志
docker logs -f licode-frontend
```

#### 3.4 使用 docker-compose

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  frontend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_CHAIN_ID=8453
      - NEXT_PUBLIC_TOKEN_ADDRESS=${NEXT_PUBLIC_TOKEN_ADDRESS}
      - NEXT_PUBLIC_USDC_ADDRESS=${NEXT_PUBLIC_USDC_ADDRESS}
      - NEXT_PUBLIC_TREASURY_ADDRESS=${NEXT_PUBLIC_TREASURY_ADDRESS}
      - NEXT_PUBLIC_MINT_USDC=1
    restart: unless-stopped
```

启动：
```bash
docker-compose up -d
```

---

## 🚨 故障排查

### 问题 1: 钱包连接失败

**症状**：点击 "Connect Wallet" 无反应

**解决方案**：
```bash
# 1. 检查是否安装钱包扩展
# - MetaMask: https://metamask.io/
# - Coinbase Wallet: https://www.coinbase.com/wallet

# 2. 检查网络配置
# 确保 NEXT_PUBLIC_CHAIN_ID 正确

# 3. 检查浏览器控制台错误
# F12 → Console

# 4. 清除浏览器缓存
# Ctrl+Shift+Del → 清除缓存
```

### 问题 2: API 请求失败（CORS 错误）

**错误信息**：
```
Access to fetch at 'http://localhost:3001/api/mint' from origin 'http://localhost:3000'
has been blocked by CORS policy
```

**解决方案**：
```bash
# 1. 检查后端 CORS 配置
# backend/.env
ENABLE_CORS="true"
FRONTEND_URL="http://localhost:3000"

# 2. 重启后端
pm2 restart licode-backend

# 3. 检查 next.config.js 代理配置
```

### 问题 3: 环境变量未生效

**症状**：应用中的地址显示为 undefined

**解决方案**：
```bash
# 1. 确保变量名以 NEXT_PUBLIC_ 开头
# ✅ 正确
NEXT_PUBLIC_TOKEN_ADDRESS="0x..."

# ❌ 错误
TOKEN_ADDRESS="0x..."

# 2. 重新构建应用
pnpm run build

# 3. 对于 Vercel，在 Dashboard 中配置环境变量后重新部署
vercel --prod
```

### 问题 4: 页面空白

**解决方案**：
```bash
# 1. 检查构建日志
pnpm run build

# 2. 检查浏览器控制台
# F12 → Console

# 3. 检查 Node.js 版本
node --version  # 应该 >= 18

# 4. 清除 .next 缓存
rm -rf .next
pnpm run build
```

### 问题 5: 交易失败

**症状**：提交交易后一直 pending 或失败

**解决方案**：
```bash
# 1. 检查钱包网络
# 确保钱包切换到正确的网络（Base 主网或测试网）

# 2. 检查 USDC 余额
# 确保钱包有足够的 USDC

# 3. 检查 Gas 费用
# 确保钱包有足够的 ETH 支付 gas

# 4. 检查合约地址
# 确保 NEXT_PUBLIC_USDC_ADDRESS 正确
```

---

## 🔍 性能优化

### 1. 图片优化

使用 Next.js Image 组件：
```tsx
import Image from 'next/image'

<Image
  src="/logo.png"
  alt="LICODE"
  width={200}
  height={50}
  priority
/>
```

### 2. 代码分割

使用动态导入：
```tsx
import dynamic from 'next/dynamic'

const WalletConnect = dynamic(
  () => import('./WalletConnect'),
  { ssr: false }
)
```

### 3. 缓存配置

编辑 `next.config.js`:
```javascript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|png)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}
```

---

## ✅ 部署验证清单

- [ ] 应用成功构建，无错误
- [ ] 页面正常加载
- [ ] 钱包连接功能正常
- [ ] 合约数据正确显示
- [ ] 支付流程可以完成
- [ ] 移动端显示正常
- [ ] HTTPS 配置正确（生产环境）
- [ ] 环境变量配置正确
- [ ] API 代理配置正确
- [ ] 无控制台错误

---

## 📚 相关文档

- [合约部署指南](contract-deployment.md)
- [后端部署指南](backend-deployment.md)
- [部署验证指南](部署验证指南.md)

---

## 🎉 部署完成

恭喜！前端应用已成功部署。

**下一步**：
1. [测试完整流程](部署验证指南.md)
2. 配置域名和 SSL
3. 设置监控和分析
