# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在此代码库中工作的指导。

## 项目概述

LICODE x402 是一个在 Base 区块链上实现 x402 支付验证模式的全栈代币铸造系统。用户通过支付 USDC 以固定汇率铸造 LICODE 代币（默认：1 USDC → 5,000 LICODE），系统强制执行单钱包上限和总量上限。

**系统架构：**
- **智能合约**：基于分发者模式的 ERC-20 代币（Solidity 0.8.24）
- **后端**：验证链上 USDC 支付并分发代币的 Express 服务器
- **前端**：集成钱包（wagmi、viem）和二维码支持的 Next.js 14 应用

## 核心开发命令

### 根目录（Hardhat）
```bash
pnpm install                    # 安装所有依赖
pnpm build                      # 编译合约
pnpm run deploy                 # 部署到 Base 主网
pnpm run deploySepolia          # 部署到 Base Sepolia 测试网
TOKEN_ADDRESS=0x... pnpm run verify  # 在 Basescan 上验证合约
```

### 后端
```bash
cd backend
pnpm install
pnpm run dev                    # 启动 Express 服务器（端口 3001）
```

### 前端
```bash
cd frontend
pnpm install
pnpm run dev                    # 启动 Next.js 开发服务器（端口 3000）
pnpm run build                  # 构建生产版本
pnpm run start                  # 启动生产服务器
```

## 架构详解

### 代币合约流程
`LicodeToken` 合约 (contracts/LicodeToken.sol) 是一个具有以下特性的 ERC-20：
- 全部供应量在部署时铸造到**合约本身**
- 只有指定的 `distributor` EOA 可以调用 `distribute()` 将代币转移给用户
- 强制执行上限：`totalUsdcCap`（总量）和 `perWalletUsdcCap`（单用户），以 6 位小数 USDC 单位追踪
- 汇率转换：代币数量 = (usdcAmount6 * tokensPerUsdc) / 1e6
- 所有者可调用 `ownerWithdraw()` 转移代币（用于 LP 或财库）

### 后端验证流程 (backend/src/server.ts)
1. **GET /mint** → 返回 HTTP 402 及支付详情（USDC 金额、财库地址）
2. **POST /verify** → 接受 `{txHash, user}`：
   - 从 Base RPC 获取交易回执
   - 扫描日志中的 USDC Transfer 事件（从用户 → 财库）
   - 验证支付金额是否匹配 `MINT_USDC_6`
   - 检查是否超过单钱包上限
   - 调用链上 `token.distribute(user, usdcAmount6)`
   - 返回分发者交易哈希
3. **GET /stats** → 返回合约统计数据（供应量、已铸造代币、上限等）

### 前端架构 (frontend/app/)
- **page.tsx**：主 UI，包含三种支付模式：
  - 手动提交交易哈希
  - 二维码扫描（ERC-681 格式）
  - 钱包连接（wagmi）直接转账 USDC
- **providers.tsx**：WagmiConfig 和 QueryClient 配置（Base 网络）
- **layout.tsx**：根布局及全局 provider

### 环境配置
系统需要在三个层级正确配置 `.env`：

**根目录 `.env`（用于 Hardhat 部署）：**
- `RPC_URL_BASE`、`DEPLOYER_PRIVATE_KEY`
- 代币参数：`TOKEN_NAME`、`TOTAL_SUPPLY_18`、`TOKENS_PER_USDC_18`
- 上限：`TOTAL_USDC_CAP_6`、`PER_WALLET_USDC_CAP_6`
- `DISTRIBUTOR_ADDRESS`、`OWNER_ADDRESS`

**backend/.env：**
- `RPC_URL_BASE`、`TOKEN_ADDRESS`、`USDC_ADDRESS`
- `TREASURY_ADDRESS`（接收 USDC 支付）
- `DISTRIBUTOR_PRIVATE_KEY`（调用 distribute() 的 EOA）
- `MINT_USDC_6`（例如 "1000000" 表示 1 USDC）
- `CHAIN_ID`（Base 主网 8453，Sepolia 84532）

**关键配置：** `USDC_ADDRESS` 必须是 Base 上正确的 USDC 代币地址：
- Base 主网：`0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`（Circle 官方 USDC）
- Base Sepolia：`0x036CbD53842c5426634e7929541eC2318f3dCF7e`（常用测试代币）

## 重要运营细节

### 分发者角色
- 分发者 EOA **不托管代币**
- 它只需要 gas（ETH）来执行 `distribute()` 交易
- 所有 LICODE 在分发前都保留在合约中
- 更换分发者：所有者调用 `token.setDistributor(newAddress)`，然后更新 backend/.env 中的 `DISTRIBUTOR_PRIVATE_KEY`

### LP/财库代币提取
使用 scripts/withdraw.ts 将代币从合约转移到其他地址：
```bash
# 在根目录 .env 中设置：
WITHDRAW_TO_ADDRESS=0xDestination
WITHDRAW_AMOUNT_18=1000000
TOKEN_ADDRESS=0xYourToken

pnpm hardhat run scripts/withdraw.ts --network base
```

### 小数位处理
- LICODE 代币：18 位小数（标准 ERC-20）
- USDC：6 位小数
- 合约以 6 位小数单位追踪 USDC（`usdcAmount6`）
- 转换发生在 `distribute()` 中：`tokenAmount = (usdcAmount6 * tokensPerUsdc) / 1e6`

### 网络配置
Hardhat 支持三个网络：
- `base`：Base 主网（ChainId 8453）
- `baseSepolia`：Base Sepolia 测试网（ChainId 84532）
- `baseGoerli`：Base Goerli（已弃用，ChainId 84531）

## 测试策略
主网部署前的建议步骤：
1. 使用 `pnpm run deploySepolia` 部署到 Base Sepolia
2. 配置后端使用 Sepolia RPC 和测试网 USDC 地址
3. 测试完整流程：铸造请求 → USDC 支付 → 验证 → 代币分发
4. 验证上限在合约和后端层面都正确执行
5. 测试边界情况：支付不足、超过钱包上限、无效交易哈希

## 技术栈
- **合约**：Solidity 0.8.24、OpenZeppelin 5.0、Hardhat 2.22
- **后端**：Node.js、Express 4.19、ethers.js 6.10、TypeScript
- **前端**：Next.js 14.2、React 18、wagmi 2.13、viem 2.9、TanStack Query 5.59

## 常见陷阱
- 后端 `package.json` 使用 `"type": "commonjs"`，而非 `"module"`（尽管 PRD 显示为 ES 模块）
- 前端的 rewrites/proxies 应将 `/api/*` 路由到 `http://localhost:3001`
- USDC Transfer 事件扫描对地址大小写敏感（后端将所有地址转为小写）
- 单钱包上限检查在后端（预检）和合约（强制执行）中都会进行
- Gas 费用：用户支付 USDC 转账费用，项目支付 `distribute()` 调用费用

## 功能完整性评估

### ✅ 已实现核心功能
- 完整的 x402 支付验证流程
- 链上 USDC 支付验证和代币分发
- 双层上限控制（总量 + 单钱包）
- 三种用户体验模式（手动/二维码/钱包连接）
- 完整的统计和进度追踪
- 代币提取工具（用于 LP）
- 多网络支持（主网 + 测试网）

### ⚠️ 生产部署建议
1. **添加防重放攻击**：记录已处理的交易哈希（数据库或 Redis）
2. **实现速率限制**：使用 express-rate-limit 保护 API
3. **配置前端代理**：在 next.config.js 中添加 rewrites 配置
4. **添加监控日志**：集成 Winston/Pino 结构化日志
5. **考虑交易队列**：防止高并发时的 nonce 冲突

### 总体评价
功能完整性：**90%**

核心业务逻辑完整且符合 PRD 要求。代码质量良好，使用成熟的开源库。主要缺失的是生产环境加固功能（防重放、速率限制、监控），需要在正式上线前补充。
