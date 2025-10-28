import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privateKey);

  console.log("Deployer Address:", wallet.address);

  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const balance = await provider.getBalance(wallet.address);
  const ethBalance = ethers.formatEther(balance);

  console.log("Balance:", ethBalance, "ETH");

  if (parseFloat(ethBalance) < 0.005) {
    console.log("\n⚠️  WARNING: Balance too low! Need at least 0.01 ETH for deployment.");
    process.exit(1);
  } else {
    console.log("\n✅ Balance sufficient for deployment");
  }
}

main().catch(console.error);
