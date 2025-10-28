// 安全加固后的后端代码示例
// backend/src/server-secure.ts

import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { ethers } from "ethers";
import rateLimit from "express-rate-limit";
import cors from "cors";
import Redis from "ioredis";
import { erc20Iface } from "./chain";

dotenv.config();

const app = express();
app.use(express.json());

// ============================================
// 1️⃣ CORS 配置
// ============================================
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
};
app.use(cors(corsOptions));

// ============================================
// 2️⃣ Redis 配置（防重放攻击）
// ============================================
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

// ============================================
// 3️⃣ 速率限制
// ============================================
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later' }
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 5, // 每分钟最多5次验证请求
  keyGenerator: (req) => {
    const user = (req.body?.user || '').toLowerCase();
    return `${req.ip}:${user}`;
  },
  message: { error: 'Too many verification attempts, please wait' }
});

app.use(globalLimiter);

// ============================================
// 区块链配置
// ============================================
const RPC = process.env.RPC_URL_BASE;
const provider = new ethers.JsonRpcProvider(RPC);

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS;
const TREASURY = (process.env.TREASURY_ADDRESS || "").toLowerCase();
const PK = process.env.DISTRIBUTOR_PRIVATE_KEY;
const MINT_USDC_6 = process.env.MINT_USDC_6 || "1000000";
const CHAIN_ID = Number(process.env.CHAIN_ID || "8453");

if (!RPC || !TOKEN_ADDRESS || !USDC_ADDRESS || !TREASURY || !PK) {
  throw new Error("Missing required env vars");
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

// ============================================
// API 端点
// ============================================

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

// ============================================
// 4️⃣ 安全验证端点（核心加固）
// ============================================
app.post("/verify", verifyLimiter, async (req: Request, res: Response) => {
  try {
    const { txHash, user } = req.body as { txHash?: string; user?: string };

    // 基本参数验证
    if (!txHash || !user) {
      console.warn("[/verify] Missing args", { txHash, user });
      return res.status(400).json({ error: "missing args" });
    }

    // 地址格式验证
    if (!ethers.isAddress(user)) {
      console.warn("[/verify] Invalid user address", { user });
      return res.status(400).json({ error: "invalid user address" });
    }

    // ============================================
    // 🔐 防重放攻击检查
    // ============================================
    const redisKey = `tx:${txHash.toLowerCase()}`;
    const processed = await redis.get(redisKey);

    if (processed) {
      console.warn("[/verify] ⚠️ Replay attack detected!", {
        txHash,
        user,
        previousRecord: JSON.parse(processed)
      });
      return res.status(400).json({
        error: "Transaction already processed",
        processedAt: JSON.parse(processed).timestamp
      });
    }

    // ============================================
    // 链上验证
    // ============================================
    const rcpt = await provider.getTransactionReceipt(txHash);
    if (!rcpt || rcpt.status !== 1) {
      console.warn("[/verify] Transaction not confirmed", { txHash });
      return res.status(400).json({ error: "tx not confirmed" });
    }

    // 解析 USDC Transfer 事件
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

          // 验证支付方和收款方
          if (from === user.toLowerCase() && to === TREASURY) {
            paid6 += value;
          }
        }
      } catch (err) {
        console.warn("[/verify] Failed to parse log", err);
      }
    }

    // 验证支付金额
    const required6 = BigInt(MINT_USDC_6);
    if (paid6 < required6) {
      console.warn("[/verify] Insufficient payment", {
        paid: paid6.toString(),
        required: required6.toString()
      });
      return res.status(400).json({
        error: "insufficient payment",
        paid: ethers.formatUnits(paid6, 6),
        required: ethers.formatUnits(required6, 6)
      });
    }

    // 验证钱包上限
    const soFar = await token.usdcByWallet(user);
    const perWallet = await token.perWalletUsdcCap();

    if (soFar + required6 > perWallet) {
      console.warn("[/verify] Wallet cap reached", {
        user,
        soFar: soFar.toString(),
        perWallet: perWallet.toString()
      });
      return res.status(400).json({
        error: "wallet cap reached",
        current: ethers.formatUnits(soFar, 6),
        cap: ethers.formatUnits(perWallet, 6)
      });
    }

    // ============================================
    // 分发代币
    // ============================================
    console.log("[/verify] ✅ Verification passed, distributing...", {
      txHash,
      user,
      amount: ethers.formatUnits(required6, 6)
    });

    const distributeTx = await token.distribute(user, required6);
    const distributeReceipt = await distributeTx.wait();

    console.log("[/verify] ✅ Distribution complete", {
      paymentTx: txHash,
      distributorTx: distributeTx.hash,
      gasUsed: distributeReceipt?.gasUsed?.toString()
    });

    // ============================================
    // 🔐 标记交易为已处理（防重放）
    // ============================================
    await redis.set(redisKey, JSON.stringify({
      user,
      amount: required6.toString(),
      paymentTx: txHash,
      distributorTx: distributeTx.hash,
      timestamp: Date.now(),
      ip: req.ip
    }));

    // 可选：设置过期时间（如30天后自动清理）
    // await redis.expire(redisKey, 30 * 24 * 60 * 60);

    res.json({
      ok: true,
      tx: distributeTx.hash,
      amount: ethers.formatUnits(required6, 6)
    });

  } catch (e: any) {
    console.error("[/verify] ❌ Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// 健康检查端点
// ============================================
app.get("/health", async (_req: Request, res: Response) => {
  try {
    // 检查 Redis 连接
    await redis.ping();

    // 检查 RPC 连接
    const blockNumber = await provider.getBlockNumber();

    // 检查 Distributor 余额
    const balance = await provider.getBalance(signer.address);
    const balanceEth = ethers.formatEther(balance);

    res.json({
      status: "healthy",
      redis: "connected",
      rpc: "connected",
      blockNumber,
      distributorBalance: balanceEth,
      timestamp: Date.now()
    });
  } catch (error: any) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message
    });
  }
});

// ============================================
// 启动服务器
// ============================================
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║   🚀 LICODE Backend Server (Secure)   ║
  ╠════════════════════════════════════════╣
  ║   Port: ${port}
  ║   CORS: ${corsOptions.origin}
  ║   Redis: ${process.env.REDIS_URL || 'localhost:6379'}
  ╚════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing gracefully...');
  await redis.quit();
  process.exit(0);
});
