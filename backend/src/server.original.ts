import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { erc20Iface } from "./chain";

dotenv.config();

const app = express();
app.use(express.json());

const RPC = process.env.RPC_URL_BASE;
const provider = new ethers.JsonRpcProvider(RPC);

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS;
const TREASURY = (process.env.TREASURY_ADDRESS || "").toLowerCase();
const PK = process.env.DISTRIBUTOR_PRIVATE_KEY;
const MINT_USDC_6 = process.env.MINT_USDC_6 || "1000000"; // 1 USDC default
const CHAIN_ID = Number(process.env.CHAIN_ID || "8453");

if (!RPC || !TOKEN_ADDRESS || !USDC_ADDRESS || !TREASURY || !PK) {
  throw new Error("Missing required env vars (RPC_URL_BASE, TOKEN_ADDRESS, USDC_ADDRESS, TREASURY_ADDRESS, DISTRIBUTOR_PRIVATE_KEY)");
}

const signer = new ethers.Wallet(PK.startsWith("0x") ? PK : `0x${PK}`, provider);
signer.getAddress().then((addr) => console.log("Distributor signer:", addr));
const distributionIface = new ethers.Interface([
  "function distribute(address to, uint256 usdcAmount6) external",
  "function usdcByWallet(address) view returns (uint256)",
  "function perWalletUsdcCap() view returns (uint256)",
  "function totalUsdcCap() view returns (uint256)",
  "function usdcCounted() view returns (uint256)"
]);

const statsIface = new ethers.Interface([
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function usdcCounted() view returns (uint256)",
  "function totalUsdcCap() view returns (uint256)",
  "function perWalletUsdcCap() view returns (uint256)",
  "function distributor() view returns (address)",
  "function owner() view returns (address)"
]);

const token = new ethers.Contract(TOKEN_ADDRESS, distributionIface, signer);
const tokenRead = new ethers.Contract(TOKEN_ADDRESS, statsIface, provider);

app.get("/mint", async (_req: Request, res: Response) => {
  res.status(402).json({
    message: "Payment Required",
    network: "base",
    currency: "USDC",
    amount6: MINT_USDC_6,
    payTo: TREASURY
  });
});

app.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [totalSupply, contractBalance, usdcCountedValue, totalUsdcCapValue, perWalletCapValue, distributorAddress, ownerAddress] =
      await Promise.all([
        tokenRead.totalSupply(),
        tokenRead.balanceOf(TOKEN_ADDRESS),
        tokenRead.usdcCounted(),
        tokenRead.totalUsdcCap(),
        tokenRead.perWalletUsdcCap(),
        tokenRead.distributor(),
        tokenRead.owner()
      ]);

    const totalSupplyBig = BigInt(totalSupply);
    const contractBalanceBig = BigInt(contractBalance);
    const minted = totalSupplyBig - contractBalanceBig;
    const totalSupplyNonZero = totalSupplyBig === 0n ? 1n : totalSupplyBig;
    const mintedPercentBps = Number((minted * 10000n) / totalSupplyNonZero);
    const mintUnit6 = BigInt(MINT_USDC_6);

    res.json({
      tokenAddress: TOKEN_ADDRESS,
      treasury: TREASURY,
      distributor: distributorAddress,
      owner: ownerAddress,
      chainId: CHAIN_ID,
      usdcAddress: USDC_ADDRESS,
      totalSupplyTokens: ethers.formatUnits(totalSupply, 18),
      mintedTokens: ethers.formatUnits(minted, 18),
      remainingTokens: ethers.formatUnits(contractBalance, 18),
      mintedPercent: mintedPercentBps / 100,
      usdcCollected: ethers.formatUnits(usdcCountedValue, 6),
      totalUsdcCap: ethers.formatUnits(totalUsdcCapValue, 6),
      perWalletUsdcCap: ethers.formatUnits(perWalletCapValue, 6),
      mintUnitUsdc: ethers.formatUnits(mintUnit6, 6),
      mintUnitUsdc6: MINT_USDC_6
    });
  } catch (error: any) {
    console.error("Failed to build stats", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/verify", async (req: Request, res: Response) => {
  try {
    const { txHash, user } = req.body as { txHash?: string; user?: string };
    if (!txHash || !user) {
      console.warn("/verify missing args", { txHash, user });
      return res.status(400).json({ error: "missing args" });
    }

    const rcpt = await provider.getTransactionReceipt(txHash);
    if (!rcpt || rcpt.status !== 1) {
      console.warn("/verify tx not confirmed", txHash);
      return res.status(400).json({ error: "tx not confirmed" });
    }

    const USDC = new ethers.Contract(USDC_ADDRESS, erc20Iface(), provider);
    let paid6 = 0n;

    for (const log of rcpt.logs) {
      if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue;
      try {
        const parsed = USDC.interface.parseLog({ data: log.data, topics: log.topics });
        if (parsed?.name === "Transfer") {
          const from = (parsed.args[0] as string).toLowerCase();
          const to = (parsed.args[1] as string).toLowerCase();
          const value = parsed.args[2] as bigint;
          if (from === user.toLowerCase() && to === TREASURY) {
            paid6 += value;
          }
        }
      } catch (err) {
        console.warn("Failed to parse log", err);
      }
    }

    const required6 = BigInt(MINT_USDC_6);
    if (paid6 < required6) {
      console.warn("/verify insufficient payment", { paid6: paid6.toString(), required6: required6.toString() });
      return res.status(400).json({ error: "insufficient payment" });
    }

    const soFar = await token.usdcByWallet(user);
    const perWallet = await token.perWalletUsdcCap();
    if (soFar + required6 > perWallet) {
      console.warn("/verify wallet cap reached", { soFar: soFar.toString(), perWallet: perWallet.toString(), required6: required6.toString() });
      return res.status(400).json({ error: "wallet cap reached" });
    }

    const tx = await token.distribute(user, required6);
    await tx.wait();

    console.log("Distributed", {
      user,
      usdc: required6.toString(),
      distributorTx: tx.hash
    });

    res.json({ ok: true, tx: tx.hash });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Backend on :${port}`));
