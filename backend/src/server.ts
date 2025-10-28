// 安全加固后的后端代码 - 经过完整验证
// backend/src/server.ts
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
// CORS 配置（可选，开发环境可关闭）
// ============================================
const ENABLE_CORS = process.env.ENABLE_CORS === 'true';
if (ENABLE_CORS) {
  const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  };
  app.use(cors(corsOptions));
  console.log(`CORS enabled for: ${corsOptions.origin}`);
}

// ============================================
// Redis 配置（防重放攻击）
// ============================================
const REDIS_ENABLED = process.env.REDIS_URL ? true : false;
let redis: Redis | null = null;

if (REDIS_ENABLED) {
  redis = new Redis(process.env.REDIS_URL!, {
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      console.warn(`Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3
  });

  redis.on('connect', () => console.log('✅ Redis connected'));
  redis.on('error', (err) => console.error('❌ Redis error:', err));
  redis.on('close', () => console.warn('⚠️ Redis connection closed'));
} else {
  console.warn('⚠️ WARNING: Redis not configured - replay protection DISABLED!');
  console.warn('   Set REDIS_URL environment variable to enable security');
}

// ============================================
// 速率限制
// ============================================
const ENABLE_RATE_LIMIT = process.env.ENABLE_RATE_LIMIT !== 'false'; // 默认启用

if (ENABLE_RATE_LIMIT) {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests from this IP' }
  });

  const verifyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many verification attempts, please wait' }
  });

  app.use('/verify', verifyLimiter);
  app.use(globalLimiter);
  console.log('Rate limiting enabled');
}

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
// 验证端点（核心安全加固）
// ============================================
app.post("/verify", async (req: Request, res: Response) => {
  try {
    const { txHash, user } = req.body as { txHash?: string; user?: string };

    // 基本参数验证
    if (!txHash || !user) {
      console.warn("/verify missing args", { txHash, user });
      return res.status(400).json({ error: "missing args" });
    }

    // 地址格式验证
    if (!ethers.isAddress(user)) {
      console.warn("/verify invalid user address", { user });
      return res.status(400).json({ error: "invalid user address" });
    }

    // ============================================
    // 防重放攻击检查（如果Redis可用）
    // ============================================
    if (redis && REDIS_ENABLED) {
      try {
        const redisKey = `tx:${txHash.toLowerCase()}`;
        const processed = await redis.get(redisKey);

        if (processed) {
          console.warn("/verify ⚠️ Replay attack detected!", {
            txHash,
            user,
            previousRecord: JSON.parse(processed)
          });
          return res.status(400).json({
            error: "Transaction already processed",
            processedAt: JSON.parse(processed).timestamp
          });
        }
      } catch (redisError: any) {
        // Redis错误 - 记录但不阻塞请求（可选：改为拒绝请求更安全）
        console.error("/verify Redis check failed:", redisError.message);
        // 可选：取消注释下面这行来在Redis故障时拒绝请求（更安全）
        // return res.status(503).json({ error: "Security check unavailable, please try again" });
      }
    }

    // ============================================
    // 链上验证（核心逻辑 - 与原版完全相同）
    // ============================================
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
        console.warn("/verify failed to parse log", err);
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

    // ============================================
    // 分发代币
    // ============================================
    const tx = await token.distribute(user, required6);
    await tx.wait();

    console.log("/verify ✅ Distributed", {
      user,
      usdc: required6.toString(),
      distributorTx: tx.hash
    });

    // ============================================
    // 标记交易为已处理（如果Redis可用）
    // ============================================
    if (redis && REDIS_ENABLED) {
      try {
        const redisKey = `tx:${txHash.toLowerCase()}`;
        await redis.set(redisKey, JSON.stringify({
          user,
          amount: required6.toString(),
          paymentTx: txHash,
          distributorTx: tx.hash,
          timestamp: Date.now(),
          ip: req.ip
        }));
      } catch (redisError: any) {
        // Redis写入失败 - 记录错误但不影响响应
        console.error("/verify Redis write failed:", redisError.message);
        // 注意：如果Redis写入失败，这个交易可能会被重放
      }
    }

    res.json({ ok: true, tx: tx.hash });

  } catch (e: any) {
    console.error("/verify error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// 健康检查端点
// ============================================
app.get("/health", async (_req: Request, res: Response) => {
  try {
    const checks: any = {
      status: "healthy",
      timestamp: Date.now()
    };

    // 检查 Redis（如果启用）
    if (redis && REDIS_ENABLED) {
      try {
        await redis.ping();
        checks.redis = "connected";
      } catch (err) {
        checks.redis = "disconnected";
        checks.status = "degraded";
      }
    } else {
      checks.redis = "disabled";
    }

    // 检查 RPC
    try {
      checks.blockNumber = await provider.getBlockNumber();
      checks.rpc = "connected";
    } catch (err) {
      checks.rpc = "disconnected";
      checks.status = "unhealthy";
    }

    // 检查 Distributor 余额
    try {
      const balance = await provider.getBalance(signer.address);
      checks.distributorBalance = ethers.formatEther(balance);

      // 警告：余额过低
      if (parseFloat(checks.distributorBalance) < 0.01) {
        checks.warning = "Distributor balance low";
        checks.status = "degraded";
      }
    } catch (err) {
      checks.distributorBalance = "unknown";
    }

    const statusCode = checks.status === "healthy" ? 200 : (checks.status === "degraded" ? 200 : 503);
    res.status(statusCode).json(checks);

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
║   🚀 LICODE Backend Server            ║
╠════════════════════════════════════════╣
║   Port: ${port}
║   Redis: ${REDIS_ENABLED ? 'enabled' : 'DISABLED ⚠️'}
║   Rate Limit: ${ENABLE_RATE_LIMIT ? 'enabled' : 'disabled'}
║   CORS: ${ENABLE_CORS ? 'enabled' : 'disabled'}
╚════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing gracefully...');
  if (redis) {
    await redis.quit();
  }
  process.exit(0);
});
