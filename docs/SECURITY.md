# LICODE x402 安全指南

生产环境安全配置和最佳实践。

---

## 🔒 安全架构

### 核心安全措施

| 措施 | 状态 | 说明 |
|------|------|------|
| **防重放攻击** | ✅ Redis | 记录已处理的交易哈希 |
| **速率限制** | ✅ express-rate-limit | 限制 API 请求频率 |
| **CORS 保护** | ✅ cors | 限制跨域访问 |
| **输入验证** | ✅ 严格校验 | 验证所有用户输入 |
| **私钥隔离** | ✅ 环境变量 | 敏感信息不提交代码库 |
| **角色分离** | ✅ 多账户 | Owner/Distributor/Treasury 分离 |

---

## 🛡️ 生产环境配置

### 1. Redis 防重放攻击

#### 安装 Redis

**macOS**:
```bash
brew install redis
brew services start redis
redis-cli ping  # 应返回 PONG
```

**Ubuntu/Debian**:
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis
sudo systemctl enable redis
redis-cli ping
```

**Docker**:
```bash
docker run -d -p 6379:6379 --name redis redis:alpine
docker exec redis redis-cli ping
```

**云服务（推荐）**:
- AWS ElastiCache for Redis
- Azure Cache for Redis
- Upstash (Serverless Redis)

#### 配置 Redis

```bash
# backend/.env
REDIS_URL="redis://localhost:6379"

# 或云服务
# REDIS_URL="redis://username:password@host:port"
```

#### 工作原理

```
1. 用户提交交易哈希 → 2. 检查 Redis 是否已处理
                          ↓
3. 未处理 → 验证 → 分发 → 记录到 Redis (TTL: 24h)
4. 已处理 → 拒绝（防止重复铸造）
```

---

### 2. 速率限制

#### 配置说明

后端已内置速率限制，默认配置：

```javascript
// 全局限制
windowMs: 15 * 60 * 1000,  // 15 分钟
max: 100                    // 最多 100 次请求

// /verify 端点专属限制
windowMs: 60 * 60 * 1000,  // 1 小时
max: 10                     // 最多 10 次验证请求
```

#### 启用方式

```bash
# backend/.env
ENABLE_RATE_LIMIT="true"
```

#### 自定义配置

编辑 `backend/src/server.ts`：

```typescript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 时间窗口（毫秒）
  max: 100,                   // 最大请求数
  message: '请求过于频繁，请稍后再试'
});
```

---

### 3. CORS 保护

#### 基本配置

```bash
# backend/.env
ENABLE_CORS="true"
FRONTEND_URL="https://your-domain.com"
```

#### 工作原理

```javascript
// 只允许指定域名访问
cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
})
```

#### 多域名配置

编辑 `backend/src/server.ts`：

```typescript
const allowedOrigins = [
  'https://your-domain.com',
  'https://www.your-domain.com',
  'https://staging.your-domain.com'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
```

---

## 🔑 私钥管理

### 私钥分类

| 私钥 | 用途 | 安全级别 | 存储位置 |
|------|------|----------|----------|
| **DEPLOYER** | 一次性部署合约 | 中 | 临时使用，部署后转移余额 |
| **OWNER** | 管理合约 | 高 | 硬件钱包或多签 |
| **DISTRIBUTOR** | 后端分发代币 | 中 | 后端 .env，定期轮换 |
| **TREASURY** | 无私钥 | N/A | 仅地址，接收 USDC |

### 最佳实践

#### 1. 部署者私钥（DEPLOYER）

```bash
# ❌ 不要使用主钱包私钥部署
# ✅ 创建临时账户
# ✅ 部署后转移剩余 ETH
# ✅ 不要在生产环境保留
```

#### 2. 所有者私钥（OWNER）

```bash
# ✅ 使用硬件钱包（Ledger, Trezor）
# ✅ 或使用多签钱包（Gnosis Safe）
# ✅ 不要在服务器上存储
# ❌ 不要使用在线生成的私钥
```

#### 3. 分发者私钥（DISTRIBUTOR）

```bash
# ✅ 创建专用账户
# ✅ 只保留必要的 gas 余额（~0.1 ETH）
# ✅ 定期检查余额和交易记录
# ✅ 考虑定期轮换（每月/每季度）
# ❌ 不要与其他用途混用
```

#### 4. 财库地址（TREASURY）

```bash
# ✅ 使用安全的钱包地址
# ✅ 定期提取 USDC 到更安全的地址
# ✅ 设置监控告警
# ✅ 多人知道地址，但私钥保密
```

### 私钥泄露应急预案

**Distributor 私钥泄露**:
```bash
# 1. 立即停止后端服务
pm2 stop licode-backend

# 2. 生成新的 Distributor 地址
# 3. Owner 调用 setDistributor(newAddress) 更换
# 4. 为新地址充值 ETH
# 5. 更新后端配置
# 6. 重启服务
pm2 start licode-backend
```

**Owner 私钥泄露**:
```bash
# 紧急措施：
# 1. 立即使用 ownerWithdraw() 提取所有代币到安全地址
# 2. 生成新的 Owner 地址
# 3. 调用 Ownable.transferOwnership(newOwner)
# 4. 更新所有配置文档
```

---

## 🌐 HTTPS 配置

### 为什么需要 HTTPS

- ✅ 加密传输数据
- ✅ 防止中间人攻击
- ✅ 浏览器安全要求
- ✅ 提升用户信任度

### Let's Encrypt 免费证书

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### Nginx 配置

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 📊 监控和告警

### 关键指标

| 指标 | 正常值 | 告警阈值 | 说明 |
|------|--------|----------|------|
| **Distributor ETH 余额** | > 0.05 ETH | < 0.02 ETH | gas 不足会导致分发失败 |
| **后端响应时间** | < 500ms | > 2000ms | 响应过慢影响用户体验 |
| **错误率** | < 1% | > 5% | 高错误率需要排查 |
| **Redis 连接** | 正常 | 断开 | Redis 不可用影响安全 |

### 日志监控

```bash
# 查看后端日志
pm2 logs licode-backend

# 过滤错误日志
pm2 logs licode-backend --err

# 实时监控
tail -f /path/to/logs/error.log
```

### 自动告警脚本

```bash
#!/bin/bash
# check-distributor-balance.sh

DISTRIBUTOR="0x4eb111A2bdB7F8a4e0DDE5E099210a7408C50a20"
RPC_URL="https://mainnet.base.org"
THRESHOLD="20000000000000000"  # 0.02 ETH in wei

BALANCE=$(cast balance $DISTRIBUTOR --rpc-url $RPC_URL)

if [ "$BALANCE" -lt "$THRESHOLD" ]; then
    echo "⚠️ Distributor balance low: $BALANCE wei"
    # 发送告警邮件或推送通知
    # curl -X POST "https://api.example.com/alert" -d "message=Low balance"
fi
```

定时运行：
```bash
# 添加到 crontab（每小时检查一次）
crontab -e

# 添加：
0 * * * * /path/to/check-distributor-balance.sh
```

---

## 🚨 安全检查清单

### 部署前

- [ ] 在测试网完整测试所有功能
- [ ] 所有私钥安全生成并妥善保管
- [ ] 准备好应急联系人和流程
- [ ] 文档化所有关键地址和配置

### 部署时

- [ ] 使用临时账户部署合约
- [ ] 部署后立即验证合约
- [ ] 配置所有安全措施（Redis、速率限制、CORS）
- [ ] 使用 HTTPS
- [ ] 设置监控和告警

### 部署后

- [ ] Owner 转移到硬件钱包或多签
- [ ] Distributor 充值足够 gas
- [ ] 测试完整的攻击防御能力
- [ ] 定期审计日志
- [ ] 定期更新依赖包
- [ ] 定期备份配置和数据

### 日常运营

- [ ] 每日检查 Distributor 余额
- [ ] 每周检查错误日志
- [ ] 每月提取 Treasury 中的 USDC
- [ ] 每季度审计安全配置
- [ ] 及时修复发现的安全问题

---

## 🔍 安全审计

### 合约审计要点

1. **重入攻击**: ✅ 使用 OpenZeppelin 标准库
2. **整数溢出**: ✅ Solidity 0.8+ 内置检查
3. **权限控制**: ✅ Ownable 模式
4. **拒绝服务**: ✅ 无循环依赖
5. **前运行攻击**: ✅ 固定价格，无时间依赖

### 后端审计要点

1. **输入验证**: ✅ 严格验证所有参数
2. **重放攻击**: ✅ Redis 防重放
3. **速率限制**: ✅ express-rate-limit
4. **日志记录**: ✅ 记录所有关键操作
5. **错误处理**: ✅ 不暴露敏感信息

### 前端审计要点

1. **XSS 攻击**: ✅ React 自动转义
2. **CSRF 攻击**: ✅ 无敏感操作在前端
3. **私钥泄露**: ✅ 不处理私钥
4. **钓鱼防护**: ✅ 验证合约地址

---

## 📞 安全事件响应

### 发现漏洞

1. **评估严重程度**
   - 高危：立即暂停服务
   - 中危：24小时内修复
   - 低危：下次更新修复

2. **暂停服务**
```bash
# 停止后端
pm2 stop licode-backend

# 如需禁用合约分发功能
# Owner 调用 setDistributor(address(0))
```

3. **修复漏洞**
   - 更新代码
   - 测试修复
   - 部署更新

4. **恢复服务**
```bash
pm2 start licode-backend
```

5. **事后总结**
   - 记录事件详情
   - 分析根本原因
   - 改进安全措施
   - 通知受影响用户（如需要）

---

## 📚 安全资源

### 推荐工具

- **Slither**: Solidity 静态分析
- **MythX**: 智能合约安全扫描
- **OpenZeppelin Defender**: 合约监控
- **Certora**: 形式化验证

### 学习资源

- [Smart Contract Security Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [Solidity Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html)
- [OWASP API Security](https://owasp.org/www-project-api-security/)

---

## ⚠️ 免责声明

本指南提供的安全建议基于当前最佳实践，但不能保证绝对安全。区块链和 Web3 技术仍在快速发展，新的安全威胁不断出现。

建议：
- 定期更新安全知识
- 参与安全社区
- 考虑专业安全审计
- 保持警惕和谨慎

---

**保护好你的系统，保护好你的用户** 🔒
