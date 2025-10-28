# LICODE x402 部署指南

完整的部署流程和配置说明。

---

## 📋 已部署信息

**部署时间**: 2025-10-28
**部署网络**: Base Mainnet (Chain ID: 8453)

### 合约信息

| 项目 | 值 |
|------|-----|
| **合约地址** | `0x835A383202e7BdA19B1849647eFa697fe4Bef101` |
| **Owner** | `0x7488966a774199BD475763D9f9Ea99F17a273652` |
| **Distributor** | `0x4eb111A2bdB7F8a4e0DDE5E099210a7408C50a20` |
| **USDC 地址** | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` |
| **Basescan** | https://basescan.org/address/0x835A383202e7BdA19B1849647eFa697fe4Bef101 |

### 代币参数

| 参数 | 值 |
|------|-----|
| **名称** | LICODE |
| **总供应量** | 1,000,000,000 LICODE |
| **兑换率** | 1 USDC = 5,000 LICODE |
| **总USDC限额** | 100,000 USDC |
| **单钱包限额** | 10 USDC |

---

## 🚀 部署流程

### 1. 合约部署

#### 准备工作

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量（根目录 .env）
cp .env.example .env
nano .env
```

#### 必需配置

```bash
# Base RPC
RPC_URL_BASE="https://mainnet.base.org"

# 部署者私钥（需要有 ETH 支付 gas）
DEPLOYER_PRIVATE_KEY="0x..."

# 代币参数
TOKEN_NAME="LICODE"
TOKEN_SYMBOL="LICODE"
TOTAL_SUPPLY_18="1000000000000000000000000000"  # 10亿，18位小数
TOKENS_PER_USDC_18="5000000000000000000000"    # 5000，18位小数

# 限额（USDC，6位小数）
TOTAL_USDC_CAP_6="100000000000"   # 100,000 USDC
PER_WALLET_USDC_CAP_6="10000000"  # 10 USDC

# 关键地址
DISTRIBUTOR_ADDRESS="0x4eb111A2bdB7F8a4e0DDE5E099210a7408C50a20"
OWNER_ADDRESS="0x7488966a774199BD475763D9f9Ea99F17a273652"
```

#### 执行部署

```bash
# Base 主网
pnpm run deploy

# Base Sepolia 测试网
pnpm run deploySepolia
```

#### 验证合约（推荐）

```bash
TOKEN_ADDRESS=0x835A383202e7BdA19B1849647eFa697fe4Bef101 pnpm run verify
```

---

### 2. 后端部署

#### 环境配置

```bash
cd backend
cp .env.example .env
nano .env
```

#### 必需配置

```bash
# RPC 配置
RPC_URL_BASE="https://base.llamarpc.com"

# 合约地址
TOKEN_ADDRESS="0x835A383202e7BdA19B1849647eFa697fe4Bef101"
USDC_ADDRESS="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"

# 地址配置
TREASURY_ADDRESS="0x你的收款地址"              # 接收 USDC
DISTRIBUTOR_PRIVATE_KEY="0x分发账户的私钥"      # 用于调用 distribute()

# 铸造配置
MINT_USDC_6="1000000"        # 1 USDC
CHAIN_ID="8453"              # Base 主网

# 安全配置（生产环境必需）
REDIS_URL="redis://localhost:6379"
ENABLE_CORS="true"
FRONTEND_URL="https://your-domain.com"
ENABLE_RATE_LIMIT="true"

PORT="3001"
NODE_ENV="production"
```

#### 启动服务

**开发环境**:
```bash
pnpm install
pnpm run dev
```

**生产环境（PM2）**:
```bash
pnpm install
pnpm run build

# 启动
pm2 start dist/server.js --name licode-backend

# 查看日志
pm2 logs licode-backend

# 重启
pm2 restart licode-backend
```

**生产环境（Docker）**:
```bash
# 构建镜像
docker build -t licode-backend .

# 运行容器
docker run -d \
  --name licode-backend \
  -p 3001:3001 \
  --env-file .env \
  licode-backend
```

---

### 3. 前端部署

#### 环境配置

```bash
cd frontend
cp .env.example .env.local
nano .env.local
```

#### 必需配置

```bash
# API 端点
NEXT_PUBLIC_API_URL="https://api.your-domain.com"  # 或 http://localhost:3001

# Base RPC（可选，使用默认即可）
NEXT_PUBLIC_BASE_RPC="https://mainnet.base.org"
```

#### Vercel 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署到生产环境
vercel --prod
```

#### 传统服务器部署

```bash
# 构建
pnpm install
pnpm run build

# 启动（生产模式）
pnpm start

# 或使用 PM2
pm2 start npm --name "licode-frontend" -- start
```

#### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## ✅ 部署验证

### 1. 合约验证

```bash
# 检查合约信息
cast call $TOKEN_ADDRESS "name()(string)" --rpc-url $RPC_URL_BASE
cast call $TOKEN_ADDRESS "totalSupply()(uint256)" --rpc-url $RPC_URL_BASE
cast call $TOKEN_ADDRESS "distributor()(address)" --rpc-url $RPC_URL_BASE
```

### 2. 后端验证

```bash
# 健康检查
curl http://localhost:3001/stats

# 预期返回：
# {
#   "tokenAddress": "0x835A...",
#   "treasury": "0x...",
#   "chainId": 8453,
#   ...
# }
```

### 3. 前端验证

访问前端 URL，检查：
- ✅ 页面正常加载
- ✅ 显示正确的合约信息
- ✅ 可以连接钱包
- ✅ 显示正确的网络（Base 主网）

### 4. 完整流程测试

1. **连接钱包** → 确保在 Base 主网
2. **准备 USDC** → 钱包中至少 1 USDC
3. **发起支付** → 点击 "Pay 1 USDC"
4. **签名交易** → 在钱包中确认
5. **等待确认** → 查看交易状态
6. **验证到账** → 检查 LICODE 余额

---

## 🔧 角色和权限

### DEPLOYER（部署者）
- **作用**: 一次性部署合约
- **权限**: 无特殊权限
- **安全**: 部署后可以清空余额

### OWNER（所有者）
- **作用**: 管理合约
- **权限**:
  - 调用 `ownerWithdraw()` 提取代币
  - 调用 `setDistributor()` 更换分发者
- **安全**: 建议使用硬件钱包或多签地址

### DISTRIBUTOR（分发者）
- **作用**: 后端服务账户
- **权限**: 调用 `distribute()` 分发代币给用户
- **安全**:
  - 需要保持 ETH 余额（gas）
  - 私钥保存在后端 `.env`
  - 不托管代币，只执行分发
- **推荐余额**: ≥ 0.1 ETH

### TREASURY（财库）
- **作用**: 接收用户的 USDC 支付
- **权限**: 无合约权限
- **安全**: 使用安全的钱包地址，定期提取资金

---

## 🔐 安全检查清单

### 部署前

- [ ] 在测试网完整测试所有功能
- [ ] 准备好所有必需的地址和私钥
- [ ] 确认网络配置正确（主网 vs 测试网）
- [ ] 计算并准备好 gas 预算

### 部署后

- [ ] 验证合约在 Basescan 上
- [ ] 为 Distributor 地址充值 ETH（建议 ≥ 0.1 ETH）
- [ ] 测试完整的铸造流程
- [ ] 配置后端 Redis（防重放攻击）
- [ ] 启用速率限制和 CORS
- [ ] 设置监控和告警
- [ ] 备份所有配置文件和私钥

### 生产环境必需

- [ ] 使用 HTTPS
- [ ] 配置 Redis 防重放攻击
- [ ] 启用速率限制
- [ ] 设置 CORS 白名单
- [ ] 考虑将 Owner 转移到硬件钱包
- [ ] 定期检查 Distributor 余额
- [ ] 定期提取 Treasury 中的 USDC

---

## 🐛 故障排查

### 合约部署失败

**错误**: "Insufficient funds"
```bash
# 检查部署者余额
cast balance $DEPLOYER_ADDRESS --rpc-url $RPC_URL_BASE

# 需要至少 ~0.001 ETH
```

**错误**: "Transaction underpriced"
```bash
# 检查 gas price
# hardhat.config.ts 已配置自动估算，无需手动设置
```

### 后端无法启动

**错误**: "Missing required env vars"
```bash
# 检查 .env 文件
cat backend/.env

# 确保配置了：
# - RPC_URL_BASE
# - TOKEN_ADDRESS
# - USDC_ADDRESS
# - TREASURY_ADDRESS
# - DISTRIBUTOR_PRIVATE_KEY
```

**错误**: "Cannot connect to Redis"
```bash
# 检查 Redis 服务
redis-cli ping  # 应该返回 PONG

# 或临时禁用 Redis（仅开发环境）
# 注释掉 REDIS_URL 配置
```

### 前端无法连接钱包

**问题**: "Please switch to Base network"
```
解决方案：
1. 在钱包中手动切换到 Base 主网
2. 或点击 "Pay USDC" 按钮，系统会自动提示切换
```

**问题**: "Address checksum mismatch"
```
解决方案：已在代码中使用 getAddress() 规范化地址
如仍有问题，检查 backend .env 中的地址格式
```

### 交易验证失败

**错误**: "Payment not found"
```bash
# 检查后端日志
pm2 logs licode-backend

# 确认：
# 1. 用户转账到正确的 USDC 地址
# 2. 转账到正确的 Treasury 地址
# 3. 转账金额正确（1 USDC = 1000000，6位小数）
```

**错误**: "Cap exceeded"
```bash
# 检查钱包限额
# 每个钱包最多铸造 10 USDC 对应的代币
```

---

## 📊 监控和维护

### 日常监控

```bash
# 检查后端状态
pm2 status

# 查看实时日志
pm2 logs licode-backend --lines 100

# 检查 Distributor 余额
cast balance 0x4eb111A2bdB7F8a4e0DDE5E099210a7408C50a20 --rpc-url $RPC_URL_BASE
```

### 定期维护

- **每日**: 检查后端日志，确认无异常
- **每周**: 检查 Distributor ETH 余额，及时充值
- **每月**: 提取 Treasury 中的 USDC 到安全地址
- **按需**: 更新依赖包，修复安全漏洞

### 应急预案

**Distributor 余额不足**:
```bash
# 立即向 Distributor 地址转账 ETH
# 地址: 0x4eb111A2bdB7F8a4e0DDE5E099210a7408C50a20
# 建议金额: 0.1-0.5 ETH
```

**后端服务宕机**:
```bash
# 重启服务
pm2 restart licode-backend

# 查看错误日志
pm2 logs licode-backend --err
```

**需要暂停铸造**:
```bash
# 方案1：停止后端服务
pm2 stop licode-backend

# 方案2：Owner 可以调用 setDistributor(address(0)) 临时禁用分发
# （需要通过合约交互）
```

---

## 🔗 相关资源

- **合约地址**: https://basescan.org/address/0x835A383202e7BdA19B1849647eFa697fe4Bef101
- **Base 官网**: https://base.org
- **USDC on Base**: https://www.circle.com/en/usdc-on-base
- **Basescan**: https://basescan.org
- **安全配置**: 查看 [SECURITY.md](./SECURITY.md)

---

**部署完成！开始运营你的代币铸造系统** 🎉
