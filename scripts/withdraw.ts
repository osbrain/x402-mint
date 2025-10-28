import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const need = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var ${key}`);
  return value;
};

async function main() {
  const tokenAddress = need("TOKEN_ADDRESS");
  const recipient = need("WITHDRAW_TO_ADDRESS");
  const amountInput = need("WITHDRAW_AMOUNT_18");

  const amount = ethers.parseUnits(amountInput, 18);
  if (amount === 0n) throw new Error("WITHDRAW_AMOUNT_18 must be greater than zero");

  const token = await ethers.getContractAt("LicodeToken", tokenAddress);
  const tx = await token.ownerWithdraw(recipient, amount);
  console.log(`Sending ${amountInput} LICODE to ${recipient} ...`);
  await tx.wait();
  console.log("Withdraw complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
