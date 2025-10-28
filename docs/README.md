# LICODE x402 项目文档

欢迎来到 LICODE x402 项目文档中心。这里包含了项目的完整文档，包括部署指南、安全配置、架构说明等。

## 📚 文档目录

### 🚀 部署文档

快速部署指南和详细步骤：

- **[合约部署指南](deployment/contract-deployment.md)**
  - 智能合约编译和部署
  - 网络配置和参数说明
  - 合约验证流程
  - 部署后配置

- **[后端部署指南](deployment/backend-deployment.md)**
  - 后端服务安装和配置
  - PM2/Docker/Systemd 部署方式
  - Redis 配置
  - 监控和日志管理

- **[前端部署指南](deployment/frontend-deployment.md)**
  - 前端应用构建和部署
  - Vercel/传统服务器/Docker 部署
  - 环境变量配置
  - 性能优化建议

- **[部署验证指南](deployment/部署验证指南.md)**
  - 完整的部署验证流程
  - 功能测试清单
  - 常见问题排查

### 🔒 安全文档

生产环境安全配置和最佳实践：

- **[安全加固部署指南](security/安全加固部署指南.md)**
  - 生产环境安全配置
  - Redis 防重放攻击
  - 速率限制和 CORS
  - 优雅关闭和容错

- **[安全校验分析](security/安全校验分析.md)**
  - 安全审计要点
  - 代码安全分析
  - 潜在风险识别

- **[权限配置指南](security/权限配置指南.md)**
  - 角色和权限管理
  - Owner/Distributor 职责
  - 私钥安全管理
  - 最佳实践建议

- **[安全加固完成总结](security/安全加固完成总结.md)**
  - 已实施的安全措施
  - 安全功能清单
  - 验证结果

### 🏗 架构文档

系统设计和技术架构：

- **[技术架构文档](architecture/licode_x_402_mint_prd_full_stack_scaffold.md)**
  - 完整的系统架构说明
  - 技术选型和设计决策
  - 数据流程和交互
  - PRD 和实现细节

### 📖 使用指南

功能说明和操作指南：

- **[功能完整性检查](guides/功能完整性检查.md)**
  - 功能测试清单
  - 完整性验证
  - 测试用例

---

## 🎯 快速导航

### 我是开发者

**首次部署？** 按照以下顺序阅读文档：

1. [合约部署指南](deployment/contract-deployment.md)
2. [后端部署指南](deployment/backend-deployment.md)
3. [前端部署指南](deployment/frontend-deployment.md)
4. [部署验证指南](deployment/部署验证指南.md)

**准备上线？** 查看安全文档：

1. [安全加固部署指南](security/安全加固部署指南.md)
2. [权限配置指南](security/权限配置指南.md)
3. [安全校验分析](security/安全校验分析.md)

### 我是运维人员

**日常维护：**
- [后端部署指南 - 监控和维护](deployment/backend-deployment.md#监控和维护)
- [部署验证指南 - 健康检查](deployment/部署验证指南.md)

**故障排查：**
- [合约部署指南 - 故障排查](deployment/contract-deployment.md#故障排查)
- [后端部署指南 - 故障排查](deployment/backend-deployment.md#故障排查)
- [前端部署指南 - 故障排查](deployment/frontend-deployment.md#故障排查)

### 我是安全审计员

**安全审查：**
1. [安全校验分析](security/安全校验分析.md)
2. [权限配置指南](security/权限配置指南.md)
3. [技术架构文档](architecture/licode_x_402_mint_prd_full_stack_scaffold.md)

---

## 📦 项目结构

```
docs/
├── README.md                 # 本文件 - 文档索引
├── deployment/              # 部署文档
│   ├── contract-deployment.md        # 合约部署
│   ├── backend-deployment.md         # 后端部署
│   ├── frontend-deployment.md        # 前端部署
│   └── 部署验证指南.md                # 部署验证
├── security/                # 安全文档
│   ├── 安全加固部署指南.md            # 安全配置
│   ├── 安全校验分析.md               # 安全审计
│   ├── 权限配置指南.md               # 权限管理
│   └── 安全加固完成总结.md            # 安全总结
├── architecture/            # 架构文档
│   └── licode_x_402_mint_prd_full_stack_scaffold.md
└── guides/                  # 使用指南
    └── 功能完整性检查.md
```

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
用户 → 转账 USDC → 后端验证 → 合约分发 → 用户收到 LICODE
```

详细流程图请参考：[技术架构文档](architecture/licode_x_402_mint_prd_full_stack_scaffold.md)

---

## 💡 最佳实践

### 部署前

- ✅ 在测试网完整测试所有功能
- ✅ 准备好所有必需的地址和私钥
- ✅ 确认网络配置（主网 vs 测试网）
- ✅ 计算好 gas 预算

### 部署中

- ✅ 按顺序部署：合约 → 后端 → 前端
- ✅ 每个步骤后进行验证
- ✅ 记录所有合约地址和交易哈希
- ✅ 备份所有配置文件

### 部署后

- ✅ 完成部署验证清单
- ✅ 配置监控和告警
- ✅ 准备应急预案
- ✅ 定期检查 Distributor 余额

---

## 🆘 获取帮助

### 常见问题

大多数问题可以在各个部署指南的"故障排查"章节找到解决方案：

- [合约部署故障排查](deployment/contract-deployment.md#故障排查)
- [后端部署故障排查](deployment/backend-deployment.md#故障排查)
- [前端部署故障排查](deployment/frontend-deployment.md#故障排查)

### 联系支持

- 📧 Email: support@licode.com
- 💬 Discord: https://discord.gg/licode
- 🐛 Issues: https://github.com/licode/x402mint/issues

---

## 🔄 文档更新

本文档会持续更新。最后更新时间：2025-10

### 版本历史

- **v1.0** (2025-10): 初始版本，包含完整部署和安全文档

---

## 📝 贡献

发现文档错误或有改进建议？欢迎贡献！

1. Fork 项目
2. 创建功能分支
3. 提交 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](../LICENSE) 文件。

---

<div align="center">

**📚 Happy Reading! 祝你部署顺利！**

[返回主 README](../README.md)

</div>
