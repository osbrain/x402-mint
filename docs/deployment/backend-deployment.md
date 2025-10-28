# 后端服务部署指南

本指南详细说明如何部署和配置 LICODE x402 后端验证服务。

## 📋 目录

- [系统架构](#系统架构)
- [前置准备](#前置准备)
- [环境配置](#环境配置)
- [本地开发部署](#本地开发部署)
- [生产环境部署](#生产环境部署)
- [安全配置](#安全配置)
- [监控和维护](#监控和维护)
- [故障排查](#故障排查)

---

## 🏗 系统架构

### 后端职责

后端服务是整个系统的核心验证层，负责：

1. **支付请求处理**：返回 HTTP 402 + 支付信息
2. **链上交易验证**：获取并验证 USDC Transfer 事件
3. **限额检查**：验证总量和单钱包限额
4. **代币分发**：调用合约 `distribute()` 方法
5. **安全防护**：防重放、速率限制、CORS

### 技术栈

- Express 4.19
- TypeScript
- ethers.js 6.10
- Redis（防重放）
- express-rate-limit

---

## 🔧 前置准备

### 1. 系统要求

**最低配置**：
- CPU: 1 核
- 内存: 512 MB
- 存储: 10 GB
- 网络: 稳定的互联网连接

**推荐配置**（生产环境）：
- CPU: 2 核+
- 内存: 2 GB+
- 存储: 20 GB+
- 系统: Ubuntu 20.04+ / Debian 11+ / macOS

### 2. 软件依赖

```bash
# Node.js 18+
node --version  # 应该 >= v18.0.0

# pnpm
pnpm --version  # 应该 >= 8.0.0

# Redis（可选，生产环境推荐）
redis-cli --version
```

### 3. 安装 Node.js 和 pnpm

**Ubuntu/Debian**:
```bash
# 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm
```

**macOS**:
```bash
# 使用 Homebrew
brew install node@18
npm install -g pnpm
```

### 4. 安装 Redis

**macOS**:
```bash
brew install redis
brew services start redis

# 验证
redis-cli ping  # 应返回 PONG
```

**Ubuntu/Debian**:
```bash
sudo apt-get update
sudo apt-get install redis-server

# 启动 Redis
sudo systemctl start redis
sudo systemctl enable redis

# 验证
redis-cli ping
```

**Docker**:
```bash
docker run -d -p 6379:6379 --name redis redis:alpine

# 验证
docker exec redis redis-cli ping
```

---

## ⚙️ 环境配置

### 1. 安装项目依赖

```bash
cd backend
pnpm install
```

### 2. 创建 .env 文件

```bash
cp .env.example .env
```

### 3. 配置环境变量

编辑 `backend/.env` 文件：

#### 必需配置

```bash
# ===== RPC 节点配置 =====
# 主网
RPC_URL_BASE="https://mainnet.base.org"

# 测试网（开发环境）
# RPC_URL_BASE="https://sepolia.base.org"

# 推荐使用付费 RPC（更稳定）
# RPC_URL_BASE="https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
# RPC_URL_BASE="https://base-mainnet.infura.io/v3/YOUR_PROJECT_ID"

# ===== 合约地址配置 =====
# LICODE Token 合约地址（从智能合约部署获得）
TOKEN_ADDRESS="0x合约地址"

# USDC 地址
# Base 主网：
USDC_ADDRESS="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"

# Base Sepolia 测试网：
# USDC_ADDRESS="0x036CbD53842c5426634e7929541eC2318f3dCF7e"

# ===== 地址配置 =====
# Treasury 地址（接收用户 USDC 支付）
TREASURY_ADDRESS="0x你的收款地址"

# Distributor 私钥（必须对应合约中的 DISTRIBUTOR_ADDRESS）
DISTRIBUTOR_PRIVATE_KEY="0x后端分发账户私钥"

# ===== 铸造配置 =====
# 铸造价格（6位小数，1 USDC = 1000000）
MINT_USDC_6="1000000"

# Chain ID（Base 主网: 8453, Sepolia: 84532）
CHAIN_ID="8453"
```

#### 安全配置（生产环境必需）

```bash
# ===== Redis 配置 =====
# Redis URL（防重放攻击）
REDIS_URL="redis://localhost:6379"

# 如果 Redis 有密码
# REDIS_URL="redis://:password@localhost:6379"

# 如果使用云 Redis
# REDIS_URL="redis://user:password@your-redis-host:6379"

# ===== 安全选项 =====
# 启用 CORS
ENABLE_CORS="true"

# 前端域名（CORS 白名单）
FRONTEND_URL="https://your-domain.com"

# 开发环境可以使用
# FRONTEND_URL="http://localhost:3000"

# 启用速率限制
ENABLE_RATE_LIMIT="true"

# ===== 可选配置 =====
# 服务端口（默认 3001）
PORT="3001"

# 日志级别（development / production）
NODE_ENV="production"
```

### 4. 配置说明

#### USDC 地址参考表

| 网络 | Chain ID | USDC 地址 |
|------|----------|-----------|
| Base Mainnet | 8453 | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

#### 安全配置说明

| 配置项 | 说明 | 必需性 |
|--------|------|--------|
| `REDIS_URL` | 防重放攻击，记录已处理的交易哈希 | 生产必需 |
| `ENABLE_CORS` | 启用跨域资源共享 | 推荐启用 |
| `FRONTEND_URL` | 前端域名白名单 | 推荐配置 |
| `ENABLE_RATE_LIMIT` | 速率限制（5次/分钟） | 推荐启用 |

---

## 💻 本地开发部署

### 1. 启动开发服务器

```bash
cd backend
pnpm run dev
```

**预期输出**：
```
╔════════════════════════════════════════╗
║   🚀 LICODE Backend Server            ║
╠════════════════════════════════════════╣
║   Port: 3001
║   Redis: enabled
║   Rate Limit: enabled
║   CORS: enabled
╚════════════════════════════════════════╝

✅ Redis connected
Distributor signer: 0x4eb111A2bdB7F8a4e0DDE5E099210a7408C50a20
Server listening on port 3001
```

### 2. 测试基本功能

```bash
# 健康检查
curl http://localhost:3001/health

# 获取统计数据
curl http://localhost:3001/api/stats

# 测试 mint 端点
curl http://localhost:3001/api/mint
```

### 3. 无 Redis 运行（仅开发）

如果不想安装 Redis：

```bash
# 注释掉或删除 .env 中的 REDIS_URL
# REDIS_URL="redis://localhost:6379"

# 启动服务
pnpm run dev
```

⚠️ **警告**：无 Redis 时防重放功能将被禁用，仅用于开发测试。

---

## 🚀 生产环境部署

### 方式 1: PM2 部署（推荐）

PM2 是 Node.js 进程管理器，提供自动重启、日志管理等功能。

#### 1.1 安装 PM2

```bash
npm install -g pm2
```

#### 1.2 构建项目

```bash
cd backend
pnpm run build
```

#### 1.3 启动服务

```bash
# 启动服务
pm2 start dist/server.js --name licode-backend

# 查看状态
pm2 status

# 查看日志
pm2 logs licode-backend

# 停止服务
pm2 stop licode-backend

# 重启服务
pm2 restart licode-backend
```

#### 1.4 设置开机自启

```bash
# 保存当前进程列表
pm2 save

# 生成启动脚本
pm2 startup

# 按照输出的命令执行
# 例如：sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u yourusername --hp /home/yourusername
```

#### 1.5 PM2 配置文件（可选）

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'licode-backend',
    script: './dist/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
```

启动：
```bash
pm2 start ecosystem.config.js
```

### 方式 2: Docker 部署

#### 2.1 创建 Dockerfile

在 `backend/` 目录创建 `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建
RUN pnpm run build

# 暴露端口
EXPOSE 3001

# 启动服务
CMD ["node", "dist/server.js"]
```

#### 2.2 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "3001:3001"
    env_file:
      - .env
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

#### 2.3 启动服务

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f backend

# 停止服务
docker-compose down
```

### 方式 3: Systemd 服务（传统）

#### 3.1 创建服务文件

```bash
sudo nano /etc/systemd/system/licode-backend.service
```

内容：
```ini
[Unit]
Description=LICODE Backend Service
After=network.target redis.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /path/to/backend/dist/server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 3.2 启动服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start licode-backend

# 设置开机自启
sudo systemctl enable licode-backend

# 查看状态
sudo systemctl status licode-backend

# 查看日志
sudo journalctl -u licode-backend -f
```

---

## 🔒 安全配置

### 1. 防火墙配置

```bash
# 允许必要端口
sudo ufw allow 3001/tcp  # 后端服务
sudo ufw allow 6379/tcp  # Redis（如果需要远程访问）

# 启用防火墙
sudo ufw enable
```

### 2. Redis 安全配置

编辑 `/etc/redis/redis.conf`:

```bash
# 绑定到本地（如果只在本机使用）
bind 127.0.0.1

# 设置密码
requirepass your_strong_password_here

# 禁用危险命令
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

重启 Redis:
```bash
sudo systemctl restart redis
```

更新 `.env`:
```bash
REDIS_URL="redis://:your_strong_password_here@localhost:6379"
```

### 3. HTTPS 配置（Nginx 反向代理）

#### 3.1 安装 Nginx

```bash
sudo apt-get install nginx
```

#### 3.2 配置 Nginx

```bash
sudo nano /etc/nginx/sites-available/licode-backend
```

内容：
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
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
sudo ln -s /etc/nginx/sites-available/licode-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 3.3 安装 SSL 证书（Let's Encrypt）

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

### 4. 环境变量安全

```bash
# 设置 .env 文件权限
chmod 600 .env

# 确保不提交到 git
echo ".env" >> .gitignore
```

---

## 📊 监控和维护

### 1. 健康检查

```bash
# 设置定期健康检查
*/5 * * * * curl -f http://localhost:3001/health || systemctl restart licode-backend
```

### 2. 日志管理

**PM2 日志**:
```bash
# 查看实时日志
pm2 logs licode-backend

# 清理日志
pm2 flush

# 日志轮转
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

**Systemd 日志**:
```bash
# 查看日志
sudo journalctl -u licode-backend -f

# 按时间查看
sudo journalctl -u licode-backend --since "1 hour ago"
```

### 3. 性能监控

**监控 Distributor 余额**:
```bash
# 创建监控脚本 check-balance.sh
#!/bin/bash
BALANCE=$(curl -s http://localhost:3001/health | jq -r '.distributorBalance')
if (( $(echo "$BALANCE < 0.05" | bc -l) )); then
    echo "⚠️ Distributor 余额不足: $BALANCE ETH"
    # 发送告警（邮件/Slack/Telegram 等）
fi
```

**监控 Redis**:
```bash
# Redis 信息
redis-cli INFO

# 监控内存使用
redis-cli INFO memory | grep used_memory_human
```

### 4. 备份策略

**备份配置文件**:
```bash
# 定期备份
tar -czf backup-$(date +%Y%m%d).tar.gz .env src/

# 上传到云存储
# aws s3 cp backup-*.tar.gz s3://your-bucket/
```

**备份 Redis 数据**:
```bash
# 手动备份
redis-cli BGSAVE

# 自动备份（添加到 crontab）
0 2 * * * redis-cli BGSAVE && cp /var/lib/redis/dump.rdb /backup/redis-$(date +\%Y\%m\%d).rdb
```

---

## 🚨 故障排查

### 问题 1: 服务无法启动

**检查步骤**:
```bash
# 1. 检查端口占用
lsof -i:3001

# 2. 检查配置文件
cat .env | grep -v "^#" | grep -v "^$"

# 3. 检查日志
pm2 logs licode-backend --lines 50

# 4. 测试 RPC 连接
curl -X POST $RPC_URL_BASE \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### 问题 2: Redis 连接失败

**错误信息**:
```
❌ Redis error: connect ECONNREFUSED 127.0.0.1:6379
```

**解决方案**:
```bash
# 1. 检查 Redis 状态
redis-cli ping

# 2. 启动 Redis
sudo systemctl start redis  # Linux
brew services start redis   # macOS

# 3. 检查 Redis 配置
redis-cli CONFIG GET bind
redis-cli CONFIG GET requirepass

# 4. 临时禁用 Redis（仅测试）
# 在 .env 中注释 REDIS_URL
```

### 问题 3: Distributor 余额不足

**错误信息**:
```
Error: insufficient funds for gas
```

**解决方案**:
```bash
# 1. 检查余额
curl http://localhost:3001/health | jq '.distributorBalance'

# 2. 向 DISTRIBUTOR_ADDRESS 充值 ETH
# 建议保持余额 >= 0.1 ETH
```

### 问题 4: USDC 地址错误

**症状**：所有 `/verify` 请求都失败

**解决方案**:
```bash
# 确认使用正确网络的 USDC 地址
# Base 主网: 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
# Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

# 更新 .env
nano .env

# 重启服务
pm2 restart licode-backend
```

### 问题 5: 速率限制过于严格

**症状**：用户频繁收到 429 错误

**解决方案**:

编辑 `src/server.ts`，修改速率限制配置：

```typescript
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1分钟
  max: 10,  // 增加到 10 次
  message: "Too many requests"
});
```

---

## ✅ 部署验证清单

- [ ] 服务正常启动，无错误日志
- [ ] `/health` 端点返回正常状态
- [ ] `/api/mint` 返回 402 状态码
- [ ] `/api/stats` 返回合约统计
- [ ] Redis 连接正常（生产环境）
- [ ] Distributor 余额充足 (≥ 0.1 ETH)
- [ ] CORS 配置正确
- [ ] 速率限制正常工作
- [ ] HTTPS 配置正确（生产环境）
- [ ] 日志记录正常
- [ ] 监控和告警配置完成

---

## 📚 相关文档

- [合约部署指南](contract-deployment.md)
- [前端部署指南](frontend-deployment.md)
- [安全加固指南](../security/安全加固部署指南.md)
- [部署验证指南](部署验证指南.md)

---

## 🎉 部署完成

恭喜！后端服务已成功部署。

**下一步**：
1. [部署前端应用](frontend-deployment.md)
2. [测试完整流程](部署验证指南.md)
