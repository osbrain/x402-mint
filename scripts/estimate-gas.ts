import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("📊 估算合约部署 Gas 成本...\n");

  // 获取部署参数
  const name = process.env.TOKEN_NAME || "LICODE";
  const symbol = process.env.TOKEN_SYMBOL || "LICODE";
  const totalSupply = ethers.parseUnits(process.env.TOTAL_SUPPLY_18 || "1000000000", 18);
  const tokensPerUsdc = ethers.parseUnits(process.env.TOKENS_PER_USDC_18 || "5000", 18);
  const totalUsdcCap6 = BigInt(process.env.TOTAL_USDC_CAP_6 || "100000000000");
  const perWalletCap6 = BigInt(process.env.PER_WALLET_USDC_CAP_6 || "10000000");

  const [deployer] = await ethers.getSigners();
  const owner = ethers.getAddress(process.env.OWNER_ADDRESS || deployer.address);
  const distributor = ethers.getAddress(process.env.DISTRIBUTOR_ADDRESS || deployer.address);

  // 获取合约工厂
  const LicodeToken = await ethers.getContractFactory("LicodeToken");

  // 估算部署 gas
  const deployTx = await LicodeToken.getDeployTransaction(
    name,
    symbol,
    totalSupply,
    owner,
    distributor,
    tokensPerUsdc,
    totalUsdcCap6,
    perWalletCap6
  );

  const gasEstimate = await ethers.provider.estimateGas(deployTx);
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("0.001", "gwei");

  // 计算成本
  const estimatedCost = gasEstimate * gasPrice;
  const estimatedCostETH = ethers.formatEther(estimatedCost);

  // 检查余额
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceETH = ethers.formatEther(balance);

  console.log("⛽ Gas 估算结果：");
  console.log("├─ Gas Limit:    ", gasEstimate.toString());
  console.log("├─ Gas Price:    ", ethers.formatUnits(gasPrice, "gwei"), "Gwei");
  console.log("├─ 估算成本:      ", estimatedCostETH, "ETH");
  console.log("└─ 建议余额:      ", (parseFloat(estimatedCostETH) * 1.5).toFixed(6), "ETH\n");

  console.log("💰 账户信息：");
  console.log("├─ 部署者:       ", deployer.address);
  console.log("├─ 当前余额:      ", balanceETH, "ETH");
  console.log("└─ 余额状态:      ", parseFloat(balanceETH) >= parseFloat(estimatedCostETH) * 1.5 ? "✅ 充足" : "❌ 不足");

  if (parseFloat(balanceETH) < parseFloat(estimatedCostETH) * 1.5) {
    console.log("\n⚠️  警告：余额可能不足！");
    console.log("   需要充值:", (parseFloat(estimatedCostETH) * 1.5 - parseFloat(balanceETH)).toFixed(6), "ETH");
  } else {
    console.log("\n✅ 余额充足，可以部署！");
  }

  // 显示优化器设置
  console.log("\n🔧 编译器优化设置：");
  console.log("├─ 优化器:       ", "已启用 ✅");
  console.log("├─ 优化次数:      200");
  console.log("└─ Gas 节省:      约 10-30%");

  // 显示网络配置
  console.log("\n🌐 网络配置：");
  console.log("├─ Gas Limit:    ", "5,000,000");
  console.log("├─ Gas Price:    ", "0.001 Gwei");
  console.log("└─ Gas 缓冲:      +20%");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
