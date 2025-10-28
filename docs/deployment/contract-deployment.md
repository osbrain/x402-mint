# 智能合约部署指南

本指南详细说明如何部署 LICODE Token 智能合约到 Base 网络。

## 📋 目录

- [前置准备](#前置准备)
- [环境配置](#环境配置)
- [部署流程](#部署流程)
- [合约验证](#合约验证)
- [部署后配置](#部署后配置)
- [故障排查](#故障排查)

---

## 🔧 前置准备

### 1. 安装依赖

```bash
# 在项目根目录
pnpm install
```

### 2. 准备账户和资金

#### 测试网（Base Sepolia）

- **Deployer 账户**：需要测试网 ETH
  - 获取测试网 ETH：[Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
  - 建议余额：0.05 ETH 以上

#### 主网（Base Mainnet）

- **Deployer 账户**：需要主网 ETH
  - 建议余额：0.02-0.05 ETH（部署约消耗 0.01-0.02 ETH）
  - ⚠️ 确保账户有足够余额，gas 不足会导致部署失败

### 3. 准备地址

需要准备以下三个地址：

| 角色 | 说明 | 安全建议 |
|------|------|----------|
| **DEPLOYER** | 部署合约的账户 | 临时账户，部署后可以转移资金 |
| **OWNER** | 合约所有者 | 使用硬件钱包或多签，权限：提取代币、更换 Distributor |
| **DISTRIBUTOR** | 后端分发账户 | 专用账户，只需要 gas，权限：分发代币 |

**最佳实践**：
- ✅ DEPLOYER、OWNER、DISTRIBUTOR 使用三个不同地址
- ✅ OWNER 使用硬件钱包（Ledger/Trezor）或多签钱包
- ✅ DISTRIBUTOR 使用专门生成的新账户

---

## ⚙️ 环境配置

### 1. 创建 .env 文件

```bash
# 在项目根目录
cp .env.example .env
```

### 2. 编辑 .env 文件

打开 `.env` 文件，填写以下配置：

#### 基础配置

```bash
# ===== 网络配置 =====
# 测试网
RPC_URL_BASE="https://sepolia.base.org"
CHAIN_ID="84532"

# 主网（部署主网时使用）
# RPC_URL_BASE="https://base.llamarpc.com"
# CHAIN_ID="8453"

# 或使用其他 RPC 提供商
# RPC_URL_BASE="https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
# RPC_URL_BASE="https://base-mainnet.infura.io/v3/YOUR_PROJECT_ID"
```

#### 部署者配置

```bash
# ===== 部署者私钥 =====
DEPLOYER_PRIVATE_KEY="0x你的私钥"
# ⚠️ 警告：确保此私钥安全，不要提交到 git
```

#### 角色地址配置

```bash
# ===== 角色地址 =====
# 合约所有者（可以调用 ownerWithdraw、setDistributor）
OWNER_ADDRESS="0x所有者地址"

# 分发者地址（后端 EOA，可以调用 distribute）
DISTRIBUTOR_ADDRESS="0x分发者地址"
```

#### 代币参数配置（可选，有默认值）

```bash
# ===== 代币参数 =====
# 代币名称和符号
TOKEN_NAME="LICODE"
TOKEN_SYMBOL="LICODE"

# 总供应量（单位：整数，脚本会自动乘以 10^18）
# 默认：1000000000 = 10亿代币
TOTAL_SUPPLY_18="1000000000"

# 兑换率：1 USDC 可兑换多少代币
# 默认：5000 = 1 USDC 兑换 5000 LICODE
TOKENS_PER_USDC_18="5000"

# 总 USDC 限额（6位小数）
# 默认：100000000000 = 100,000 USDC
# 计算公式：想要的 USDC 数量 × 1000000
TOTAL_USDC_CAP_6="100000000000"

# 单钱包 USDC 限额（6位小数）
# 默认：10000000 = 10 USDC
# 计算公式：想要的 USDC 数量 × 1000000
PER_WALLET_USDC_CAP_6="10000000"
```

#### 合约验证配置（可选）

```bash
# ===== 合约验证 =====
# Basescan API Key（用于验证合约）
# 获取地址：https://basescan.org/myapikey
BASESCAN_API_KEY="你的API密钥"
```

### 3. 参数计算示例

**示例 1：修改总限额为 50,000 USDC**
```bash
TOTAL_USDC_CAP_6="50000000000"  # 50000 × 1000000
```

**示例 2：修改单钱包限额为 5 USDC**
```bash
PER_WALLET_USDC_CAP_6="5000000"  # 5 × 1000000
```

**示例 3：修改兑换率为 1 USDC = 10,000 LICODE**
```bash
TOKENS_PER_USDC_18="10000"
```

---

## 🚀 部署流程

### 步骤 1: 编译合约

```bash
# 在项目根目录
pnpm build
```

**预期输出**：
```
Compiled 1 Solidity file successfully
Generating typings for: 1 artifacts
Successfully generated 5 typings
```

### 步骤 2: 检查配置

确认 `.env` 文件中的所有配置正确：

```bash
# 检查配置文件是否存在
cat .env | grep -E "DEPLOYER_PRIVATE_KEY|OWNER_ADDRESS|DISTRIBUTOR_ADDRESS"
```

### 步骤 3: 部署到测试网（推荐先测试）

```bash
pnpm run deploySepolia
```

**预期输出**：
```
Deployer: 0x7488966a774199BD475763D9f9Ea99F17a273652
LicodeToken deployed: 0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
```

### 步骤 4: 部署到主网

⚠️ **部署主网前最后检查**：
- [ ] 在测试网完整测试过所有功能
- [ ] 确认所有配置参数正确
- [ ] Deployer 账户有足够 ETH（建议 ≥ 0.02 ETH）
- [ ] 已备份所有配置和私钥
- [ ] OWNER 和 DISTRIBUTOR 地址正确无误

```bash
pnpm run deploy
```

**预期输出**：
```
Deployer: 0x7488966a774199BD475763D9f9Ea99F17a273652
LicodeToken deployed: 0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
```

### 步骤 5: 记录合约地址

**重要**：将输出的合约地址记录下来，后续需要用到：

```bash
# 合约地址示例
TOKEN_ADDRESS=0xAbCdEf1234567890AbCdEf1234567890AbCdEf12

# 可以添加到 .env 文件中
echo "TOKEN_ADDRESS=$TOKEN_ADDRESS" >> .env
```

---

## ✅ 合约验证

验证合约可以让用户在区块链浏览器上查看源代码，提高透明度和信任度。

### 方法 1: 使用脚本验证

```bash
# 设置合约地址
TOKEN_ADDRESS=0xAbCdEf1234567890AbCdEf1234567890AbCdEf12

# 运行验证脚本
TOKEN_ADDRESS=$TOKEN_ADDRESS pnpm run verify
```

### 方法 2: 手动验证

如果自动验证失败，可以手动在 Basescan 上验证：

1. 访问 [Basescan](https://basescan.org/)（主网）或 [Sepolia Basescan](https://sepolia.basescan.org/)（测试网）
2. 搜索你的合约地址
3. 点击 "Contract" → "Verify and Publish"
4. 选择：
   - Compiler Type: Solidity (Single file)
   - Compiler Version: v0.8.24
   - License Type: MIT
5. 上传合约源码和构造函数参数

### 验证成功标志

- ✅ Basescan 上显示绿色 ✓ 标记
- ✅ 可以看到 "Read Contract" 和 "Write Contract" 选项卡
- ✅ 源代码可见

---

## 🔧 部署后配置

### 1. 更新后端配置

将部署的合约地址添加到后端配置：

```bash
cd backend
nano .env  # 或使用其他编辑器

# 添加或更新
TOKEN_ADDRESS="0xAbCdEf1234567890AbCdEf1234567890AbCdEf12"
```

### 2. 更新前端配置

将合约地址添加到前端配置：

```bash
cd frontend
nano .env.local

# 添加或更新
NEXT_PUBLIC_TOKEN_ADDRESS="0xAbCdEf1234567890AbCdEf1234567890AbCdEf12"
```

### 3. 验证合约状态

使用 Hardhat Console 验证合约状态：

```bash
npx hardhat console --network base

# 进入 console 后
const token = await ethers.getContractAt("LicodeToken", "0x合约地址")

// 检查基本信息
await token.name()           // 应返回 "LICODE"
await token.symbol()         // 应返回 "LICODE"
await token.totalSupply()    // 总供应量
await token.owner()          // Owner 地址
await token.distributor()    // Distributor 地址

// 检查合约余额（应该等于总供应量）
await token.balanceOf(await token.getAddress())

// 检查限额配置
await token.totalUsdcCap()        // 总 USDC 限额
await token.perWalletUsdcCap()    // 单钱包限额
await token.tokensPerUsdc()       // 兑换率
```

### 4. 为 Distributor 充值 Gas

Distributor 账户需要 ETH 来支付分发代币的 gas：

```bash
# 向 DISTRIBUTOR_ADDRESS 转账 ETH
# 建议余额：0.1-0.5 ETH（主网）或 0.05 ETH（测试网）
```

---

## 🔍 部署验证清单

部署完成后，请确认以下项目：

### 基础验证
- [ ] 合约成功部署，获得合约地址
- [ ] 合约在 Basescan 上可见
- [ ] 合约源码已验证（可选但推荐）

### 参数验证
- [ ] `token.owner()` 返回正确的 OWNER_ADDRESS
- [ ] `token.distributor()` 返回正确的 DISTRIBUTOR_ADDRESS
- [ ] `token.totalSupply()` 等于配置的总供应量
- [ ] `token.balanceOf(contractAddress)` 等于总供应量
- [ ] 限额和兑换率配置正确

### 配置验证
- [ ] 后端 `.env` 已更新 TOKEN_ADDRESS
- [ ] 前端 `.env.local` 已更新 TOKEN_ADDRESS
- [ ] DISTRIBUTOR_ADDRESS 有足够的 ETH
- [ ] 备份了所有配置文件

---

## 🚨 故障排查

### 问题 1: 部署失败 - Gas 不足

**错误信息**：
```
Error: insufficient funds for intrinsic transaction cost
```

**解决方案**：
```bash
# 1. 检查 Deployer 余额
# 访问 Basescan 查看余额

# 2. 充值 ETH 到 DEPLOYER_ADDRESS
# 主网建议：0.02-0.05 ETH
# 测试网：使用水龙头获取
```

### 问题 2: RPC 连接失败

**错误信息**：
```
Error: could not detect network
ProviderError: read ECONNRESET
```

**解决方案**：
```bash
# 1. 更换 RPC 节点
# 编辑 .env

# 测试网备选 RPC
RPC_URL_BASE="https://sepolia.base.org"
RPC_URL_BASE="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"

# 主网备选 RPC
RPC_URL_BASE="https://base.llamarpc.com"
RPC_URL_BASE="https://mainnet.base.org"
RPC_URL_BASE="https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"

# 2. 检查网络连接
curl -X POST https://mainnet.base.org -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### 问题 3: 私钥格式错误

**错误信息**：
```
Error: invalid private key
```

**解决方案**：
```bash
# 确保私钥格式正确
# ✅ 正确: 0x 开头，64位十六进制
DEPLOYER_PRIVATE_KEY="0xabcd1234..."

# ❌ 错误: 没有 0x 前缀
DEPLOYER_PRIVATE_KEY="abcd1234..."
```

### 问题 4: 合约验证失败

**错误信息**：
```
Error: Contract source code already verified
Error: Failed to verify contract
```

**解决方案**：
```bash
# 1. 检查是否已经验证
# 访问 Basescan 查看

# 2. 如果验证失败，手动验证
# 参考上面的"手动验证"部分

# 3. 确保 BASESCAN_API_KEY 正确
# 在 https://basescan.org/myapikey 获取
```

### 问题 5: 地址格式错误

**错误信息**：
```
Error: invalid address
```

**解决方案**：
```bash
# 确保所有地址格式正确
# ✅ 正确格式
OWNER_ADDRESS="0x7488966a774199BD475763D9f9Ea99F17a273652"

# ❌ 错误格式
OWNER_ADDRESS="7488966a774199BD475763D9f9Ea99F17a273652"  # 缺少 0x
OWNER_ADDRESS="0x7488..."  # 不完整
```

---

## 📊 部署成本参考

### Gas 消耗估算

| 网络 | 合约部署 | 合约验证 | 总计 |
|------|----------|----------|------|
| Base Sepolia | ~1,500,000 gas | 免费 | ~0.01 ETH |
| Base Mainnet | ~1,500,000 gas | 免费 | 0.01-0.02 ETH |

*注：实际 gas 消耗会根据网络拥堵情况变化*

### 成本优化建议

1. **选择低 gas 时段**：通常周末或深夜 gas 较低
2. **使用可靠的 RPC**：避免交易失败浪费 gas
3. **测试网先测试**：确保配置正确后再部署主网

---

## 🔐 安全提醒

### 私钥安全

- ✅ **永远不要**在公开场合分享私钥
- ✅ **永远不要**提交私钥到 git
- ✅ 部署后立即转移 DEPLOYER 账户的剩余资金
- ✅ 使用硬件钱包存储 OWNER 私钥

### 配置安全

```bash
# 检查 .env 是否在 .gitignore 中
cat .gitignore | grep .env

# 应该看到
.env
.env.local
.env*.local
```

---

## 📚 相关文档

- [后端部署指南](backend-deployment.md)
- [前端部署指南](frontend-deployment.md)
- [部署验证指南](部署验证指南.md)
- [安全配置指南](../security/安全加固部署指南.md)

---

## ✅ 部署完成

恭喜！如果你已经完成了所有步骤并通过验证清单，合约部署就成功了！

**下一步**：
1. [部署后端服务](backend-deployment.md)
2. [部署前端应用](frontend-deployment.md)
3. [测试完整流程](部署验证指南.md)
