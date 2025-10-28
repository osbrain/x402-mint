import { run } from "hardhat";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const need = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var ${key}`);
  return value;
};

async function main() {
  const tokenAddress = need("TOKEN_ADDRESS");
  const owner = need("OWNER_ADDRESS");
  const distributor = need("DISTRIBUTOR_ADDRESS");

  const totalSupply = ethers.parseUnits(process.env.TOTAL_SUPPLY_18 || "1000000000", 18);
  const tokensPerUsdc = ethers.parseUnits(process.env.TOKENS_PER_USDC_18 || "5000", 18);
  const totalUsdcCap6 = BigInt(process.env.TOTAL_USDC_CAP_6 || "100000000000");
  const perWalletCap6 = BigInt(process.env.PER_WALLET_USDC_CAP_6 || "10000000");

  await run("verify:verify", {
    address: tokenAddress,
    constructorArguments: [
      process.env.TOKEN_NAME || "LICODE",
      process.env.TOKEN_SYMBOL || "LICODE",
      totalSupply.toString(),
      owner,
      distributor,
      tokensPerUsdc.toString(),
      totalUsdcCap6.toString(),
      perWalletCap6.toString()
    ]
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
