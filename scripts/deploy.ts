import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const name = process.env.TOKEN_NAME || "LICODE";
  const symbol = process.env.TOKEN_SYMBOL || "LICODE";

  const totalSupply = ethers.parseUnits(process.env.TOTAL_SUPPLY_18 || "1000000000", 18);
  const tokensPerUsdc = ethers.parseUnits(process.env.TOKENS_PER_USDC_18 || "5000", 18);
  const totalUsdcCap6 = BigInt(process.env.TOTAL_USDC_CAP_6 || "100000000000");
  const perWalletCap6 = BigInt(process.env.PER_WALLET_USDC_CAP_6 || "10000000");

  const owner = ethers.getAddress(process.env.OWNER_ADDRESS || deployer.address);
  const distributor = ethers.getAddress(process.env.DISTRIBUTOR_ADDRESS || deployer.address);

  const Licode = await ethers.getContractFactory("LicodeToken");
  const token = await Licode.deploy(
    name,
    symbol,
    totalSupply,
    owner,
    distributor,
    tokensPerUsdc,
    totalUsdcCap6,
    perWalletCap6
  );
  await token.waitForDeployment();

  console.log("LicodeToken deployed:", await token.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
