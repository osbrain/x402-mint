# LICODE x402 项目文档

LICODE x402 代币铸造系统完整文档。

---

## 📚 核心文档

### 📦 [部署指南](./DEPLOYMENT.md)

完整的部署流程和配置说明：
- ✅ 已部署信息摘要
- 🚀 合约/后端/前端部署步骤
- ✅ 部署验证清单
- 🔧 角色和权限说明
- 🐛 故障排查
- 📊 监控和维护

**适合**: 开发者、运维人员

---

### 🔒 [安全指南](./SECURITY.md)

生产环境安全配置和最佳实践：
- 🛡️ Redis 防重放攻击
- ⚡ 速率限制配置
- 🌐 CORS 保护
- 🔑 私钥管理
- 📊 监控和告警
- 🚨 安全检查清单

**适合**: 安全审计员、运维人员

---

## 🎯 快速导航

### 我是开发者

**首次部署？**
1. 阅读 [部署指南](./DEPLOYMENT.md)
2. 按照步骤部署合约 → 后端 → 前端
3. 完成部署验证

**准备上线？**
1. 阅读 [安全指南](./SECURITY.md)
2. 配置 Redis、速率限制、CORS
3. 设置 HTTPS 和监控

### 我是运维人员

**日常维护：**
- [监控和维护](./DEPLOYMENT.md#监控和维护)
- [安全检查清单](./SECURITY.md#安全检查清单)

**故障排查：**
- [部署故障排查](./DEPLOYMENT.md#故障排查)
- [安全事件响应](./SECURITY.md#安全事件响应)

### 我是安全审计员

**安全审查：**
1. [安全架构](./SECURITY.md#安全架构)
2. [安全审计要点](./SECURITY.md#安全审计)
3. [部署安全检查](./DEPLOYMENT.md#安全检查清单)

---

## 🔑 核心概念

### 系统组件

| 组件 | 职责 | 技术栈 |
|------|------|--------|
| **智能合约** | ERC-20 代币 + 分发逻辑 | Solidity 0.8.24, OpenZeppelin |
| **后端服务** | 支付验证 + 代币分发 | Express, ethers.js, Redis |
| **前端应用** | 用户界面 + 钱包集成 | Next.js 14, wagmi, React |

### 关键角色

| 角色 | 权限 | 安全要求 |
|------|------|----------|
| **DEPLOYER** | 部署合约 | 临时账户，部署后转移资金 |
| **OWNER** | 提取代币、更换 Distributor | 硬件钱包或多签 |
| **DISTRIBUTOR** | 分发代币（后端 EOA） | 专用账户，保持 gas 余额 |
| **TREASURY** | 接收 USDC 支付 | 安全钱包，定期提取资金 |

### 核心流程

```
用户支付 USDC → 后端验证 → 合约分发 → 用户收到 LICODE
```

---

## 📋 已部署信息

**部署时间**: 2025-10-28
**部署网络**: Base Mainnet (Chain ID: 8453)

| 项目 | 值 |
|------|-----|
| **合约地址** | `0x835A383202e7BdA19B1849647eFa697fe4Bef101` |
| **Owner** | `0x7488966a774199BD475763D9f9Ea99F17a273652` |
| **Distributor** | `0x4eb111A2bdB7F8a4e0DDE5E099210a7408C50a20` |
| **USDC 地址** | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` |
| **Basescan** | https://basescan.org/address/0x835A383202e7BdA19B1849647eFa697fe4Bef101 |

---

## 💡 最佳实践

### 部署前
- ✅ 在测试网完整测试所有功能
- ✅ 准备好所有必需的地址和私钥
- ✅ 确认网络配置（主网 vs 测试网）

### 部署后
- ✅ 完成部署验证清单
- ✅ 配置 Redis 防重放攻击
- ✅ 启用速率限制和 CORS
- ✅ 设置监控和告警
- ✅ 定期检查 Distributor 余额

---

## 🆘 获取帮助

### 常见问题
- [部署故障排查](./DEPLOYMENT.md#故障排查)
- [安全事件响应](./SECURITY.md#安全事件响应)

### 相关资源
- **合约地址**: https://basescan.org/address/0x835A383202e7BdA19B1849647eFa697fe4Bef101
- **Base 官网**: https://base.org
- **USDC on Base**: https://www.circle.com/en/usdc-on-base

---

## 📦 项目结构

```
x402mint/
├── contracts/          # Solidity 智能合约
├── backend/           # Express 后端服务
├── frontend/          # Next.js 前端应用
├── scripts/           # 部署和管理脚本
└── docs/             # 📖 项目文档
    ├── README.md         # 本文件 - 文档导航
    ├── DEPLOYMENT.md     # 部署指南
    └── SECURITY.md       # 安全指南
```

---

## 🔄 文档版本

**当前版本**: v2.0
**最后更新**: 2025-10-28

### 更新历史
- **v2.0** (2025-10-28): 精简文档结构，合并为 3 个核心文件
- **v1.0** (2025-10): 初始版本

---

## 📝 贡献

发现文档错误或有改进建议？欢迎贡献！

1. Fork 项目
2. 创建功能分支
3. 提交 Pull Request

---

<div align="center">

**📚 开始使用 LICODE x402**

[部署系统](./DEPLOYMENT.md) · [安全配置](./SECURITY.md) · [返回主页](../README.md)

</div>
