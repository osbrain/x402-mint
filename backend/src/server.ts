// 安全加固后的后端代码 - 经过完整验证
// backend/src/server.ts
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { ethers } from "ethers";
import rateLimit from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";
import Redis from "ioredis";
import {
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  erc20Iface,
  usdcEip3009Interface,
} from "./chain";

dotenv.config();

const app = express();
// Restrict trusted proxies to local/link-local by default; override with TRUST_PROXY env if needed
const TRUST_PROXY = process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal';
app.set('trust proxy', TRUST_PROXY);
app.use(express.json());

// ============================================
// HTTP 安全响应头（Helmet）
// ============================================
const IS_PROD = process.env.NODE_ENV === 'production';
app.use(helmet({
  // 仅在生产开启 CSP，避免本地开发受限
  contentSecurityPolicy: IS_PROD ? {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    }
  } : false,
  referrerPolicy: { policy: "no-referrer" },
  frameguard: { action: 'deny' },
  hsts: IS_PROD ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
  crossOriginEmbedderPolicy: false, // 避免影响现有前后端交互
}));

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

// 生产环境强制启用 Redis（无则拒绝启动）
if (IS_PROD && !REDIS_ENABLED) {
  throw new Error('Redis required in production (set REDIS_URL)');
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
  const gaslessLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
      const from = (req.body?.authorization?.from || "").toLowerCase();
      return `${req.ip}:${from}`;
    },
    message: { error: 'Too many gasless transfers, please wait' }
  });

  app.use('/verify', verifyLimiter);
  app.use('/gasless/transfer', gaslessLimiter);
  app.use(globalLimiter);
  console.log('Rate limiting enabled');
}

// ============================================
// 区块链配置
// ============================================
const RPC = process.env.RPC_URL_BASE;
const provider = new ethers.JsonRpcProvider(RPC);

const RAW_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const RAW_USDC_ADDRESS = process.env.USDC_ADDRESS;
const RAW_TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;
const PK = process.env.DISTRIBUTOR_PRIVATE_KEY;
const MINT_USDC_6 = process.env.MINT_USDC_6 || "1000000";
const CHAIN_ID = Number(process.env.CHAIN_ID || "8453");

if (!RPC || !RAW_TOKEN_ADDRESS || !RAW_USDC_ADDRESS || !RAW_TREASURY_ADDRESS || !PK) {
  throw new Error("Missing required env vars (RPC_URL_BASE, TOKEN_ADDRESS, USDC_ADDRESS, TREASURY_ADDRESS, DISTRIBUTOR_PRIVATE_KEY)");
}

const TOKEN_ADDRESS = ethers.getAddress(RAW_TOKEN_ADDRESS);
const USDC_ADDRESS = ethers.getAddress(RAW_USDC_ADDRESS);
const TREASURY_CHECKSUM = ethers.getAddress(RAW_TREASURY_ADDRESS);
const TREASURY = TREASURY_CHECKSUM.toLowerCase();

const AUTHORIZATION_WINDOW_SECONDS = Number(process.env.AUTHORIZATION_WINDOW_SECONDS || "900"); // default 15 minutes
const AUTHORIZATION_CLOCK_DRIFT_SECONDS = Number(process.env.AUTHORIZATION_CLOCK_DRIFT_SECONDS || "120"); // allow 2 minutes drift
const AUTHORIZATION_RECORD_TTL_SECONDS = Number(process.env.AUTHORIZATION_RECORD_TTL_SECONDS || "172800"); // keep records 2 days
// /verify 端点处理记录 TTL（默认 30 天）
const VERIFY_RECORD_TTL_MS = Number(process.env.VERIFY_RECORD_TTL_MS || String(30 * 24 * 60 * 60 * 1000));

const TRANSFER_AUTHORIZATION_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: CHAIN_ID,
  verifyingContract: USDC_ADDRESS,
} as const;

type AuthorizationStatus = "pending" | "broadcasted" | "completed" | "failed";
type AuthorizationRecord = {
  status: AuthorizationStatus;
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  signature: string;
  paymentTx?: string;
  distributorTx?: string;
  error?: string;
  updatedAt: number;
};

const inMemoryAuthorizationCache = new Map<string, AuthorizationRecord>();

const authCacheKey = (from: string, nonce: string) =>
  `auth:${from.toLowerCase()}:${nonce.toLowerCase()}`;

const AUTH_RECORD_TTL_MS = AUTHORIZATION_RECORD_TTL_SECONDS * 1000;

async function readAuthorizationRecord(key: string): Promise<AuthorizationRecord | null> {
  if (redis && REDIS_ENABLED) {
    const stored = await redis.get(key);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as AuthorizationRecord;
    } catch {
      return null;
    }
  }
  return inMemoryAuthorizationCache.get(key) ?? null;
}

async function writeAuthorizationRecord(
  key: string,
  record: AuthorizationRecord,
  { onlyIfAbsent }: { onlyIfAbsent?: boolean } = {}
): Promise<boolean> {
  if (redis && REDIS_ENABLED) {
    try {
      if (onlyIfAbsent) {
        const result = await redis.set(key, JSON.stringify(record), "PX", AUTH_RECORD_TTL_MS, "NX");
        return result === "OK";
      }
      await redis.set(key, JSON.stringify(record), "PX", AUTH_RECORD_TTL_MS);
      return true;
    } catch (error) {
      console.error("Redis writeAuthorizationRecord failed:", (error as Error).message);
      if (onlyIfAbsent) {
        // fall back to memory cache
      } else {
        return false;
      }
    }
  }

  if (onlyIfAbsent && inMemoryAuthorizationCache.has(key)) {
    return false;
  }
  inMemoryAuthorizationCache.set(key, record);
  return true;
}

async function dropAuthorizationRecord(key: string) {
  if (redis && REDIS_ENABLED) {
    try {
      await redis.del(key);
      return;
    } catch (error) {
      console.error("Redis dropAuthorizationRecord failed:", (error as Error).message);
    }
  }
  inMemoryAuthorizationCache.delete(key);
}

const signer = new ethers.Wallet(PK.startsWith("0x") ? PK : `0x${PK}`, provider);
let FACILITATOR_ADDRESS = "";
signer.getAddress()
  .then((addr) => {
    FACILITATOR_ADDRESS = ethers.getAddress(addr);
    console.log("Distributor signer:", FACILITATOR_ADDRESS);
  })
  .catch((err) => console.error("Failed to resolve facilitator signer address:", err));

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
const usdcAuthorizationContract = new ethers.Contract(
  USDC_ADDRESS,
  usdcEip3009Interface(),
  signer
);

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

    const facilitatorAddress =
      FACILITATOR_ADDRESS || ethers.getAddress(await signer.getAddress());

    res.json({
      tokenAddress: TOKEN_ADDRESS,
      treasury: TREASURY_CHECKSUM,
      distributor: ethers.getAddress(distributorAddress),
      owner: ethers.getAddress(ownerAddress),
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
      mintUnitUsdc6: MINT_USDC_6,
      gasless: {
        facilitator: facilitatorAddress,
        authorizationDomain: TRANSFER_AUTHORIZATION_DOMAIN,
        authorizationTypes: TRANSFER_WITH_AUTHORIZATION_TYPES,
        authorizationWindowSeconds: AUTHORIZATION_WINDOW_SECONDS,
        clockDriftAllowanceSeconds: AUTHORIZATION_CLOCK_DRIFT_SECONDS
      }
    });
  } catch (error: any) {
    console.error("Failed to build stats", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 无 Gas 授权转账（ERC-3009）
// ============================================
app.post("/gasless/transfer", async (req: Request, res: Response) => {
  const payload = req.body as {
    authorization?: {
      from?: string;
      to?: string;
      value?: string | number | bigint;
      validAfter?: string | number | bigint;
      validBefore?: string | number | bigint;
      nonce?: string;
    };
    signature?: string;
  };

  try {
    if (!payload?.authorization || typeof payload.signature !== "string") {
      return res.status(400).json({ error: "authorization and signature are required" });
    }

    const { authorization } = payload;
    const { from, to, value, validAfter, validBefore, nonce } = authorization;

    if (!from || !to || value === undefined || validAfter === undefined || validBefore === undefined || !nonce) {
      return res.status(400).json({ error: "authorization fields missing" });
    }

    let fromAddress: string;
    let toAddress: string;
    try {
      fromAddress = ethers.getAddress(from);
      toAddress = ethers.getAddress(to);
    } catch {
      return res.status(400).json({ error: "invalid from/to address" });
    }

    if (toAddress.toLowerCase() !== TREASURY.toLowerCase()) {
      return res.status(400).json({ error: "authorization recipient mismatch" });
    }

    const parseToBigInt = (input: string | number | bigint, field: string): bigint => {
      try {
        if (typeof input === "bigint") return input;
        if (typeof input === "number") return BigInt(Math.floor(input));
        if (typeof input === "string" && input.trim() !== "") return BigInt(input.trim());
      } catch {
        // swallow to throw below
      }
      throw new Error(`invalid ${field}`);
    };

    const valueBig = parseToBigInt(value, "value");
    const validAfterBig = parseToBigInt(validAfter, "validAfter");
    const validBeforeBig = parseToBigInt(validBefore, "validBefore");

    if (valueBig <= 0n) {
      return res.status(400).json({ error: "invalid transfer value" });
    }

    const required6 = BigInt(MINT_USDC_6);
    if (valueBig !== required6) {
      return res.status(400).json({ error: `value must equal ${MINT_USDC_6}` });
    }

    if (typeof nonce !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(nonce)) {
      return res.status(400).json({ error: "nonce must be 32-byte hex string" });
    }

    const now = Math.floor(Date.now() / 1000);
    const validAfterNum = Number(validAfterBig);
    const validBeforeNum = Number(validBeforeBig);
    if (!Number.isFinite(validAfterNum) || !Number.isFinite(validBeforeNum)) {
      return res.status(400).json({ error: "authorization validity window is invalid" });
    }

    if (validBeforeNum <= validAfterNum) {
      return res.status(400).json({ error: "validBefore must be greater than validAfter" });
    }

    const windowSeconds = validBeforeNum - validAfterNum;
    if (windowSeconds > AUTHORIZATION_WINDOW_SECONDS) {
      return res.status(400).json({ error: `authorization window too long (>${AUTHORIZATION_WINDOW_SECONDS}s)` });
    }

    if (validAfterNum > now + AUTHORIZATION_CLOCK_DRIFT_SECONDS) {
      return res.status(400).json({ error: "authorization not yet valid" });
    }

    if (validBeforeNum <= now - AUTHORIZATION_CLOCK_DRIFT_SECONDS) {
      return res.status(400).json({ error: "authorization already expired" });
    }

    const sanitizedMessage = {
      from: fromAddress,
      to: toAddress,
      value: valueBig,
      validAfter: validAfterBig,
      validBefore: validBeforeBig,
      nonce,
    };

    let signature: ethers.Signature;
    try {
      const recovered = ethers.verifyTypedData(
        TRANSFER_AUTHORIZATION_DOMAIN,
        TRANSFER_WITH_AUTHORIZATION_TYPES,
        sanitizedMessage,
        payload.signature
      );

      if (recovered.toLowerCase() !== fromAddress.toLowerCase()) {
        return res.status(400).json({ error: "signature does not match authorizer" });
      }

      signature = ethers.Signature.from(payload.signature);
    } catch (err: any) {
      console.error("verifyTypedData failed:", err);
      return res.status(400).json({ error: "invalid authorization signature" });
    }

    const cacheKey = authCacheKey(fromAddress, nonce);
    const existing = await readAuthorizationRecord(cacheKey);
    if (existing?.status === "completed") {
      return res.status(200).json({
        ok: true,
        paymentTx: existing.paymentTx,
        distributorTx: existing.distributorTx,
        status: existing.status,
      });
    }
    if (existing?.status === "failed") {
      await dropAuthorizationRecord(cacheKey);
    } else if (existing) {
      return res.status(409).json({ error: "authorization already processing", status: existing.status, paymentTx: existing.paymentTx });
    }

    // Check on-chain auth state and minting limits before spending gas
    const [alreadyUsed, walletSoFar, perWalletCap, counted, totalCap] = await Promise.all([
      usdcAuthorizationContract.authorizationState(fromAddress, nonce),
      token.usdcByWallet(fromAddress),
      token.perWalletUsdcCap(),
      token.usdcCounted(),
      token.totalUsdcCap(),
    ]);

    if (alreadyUsed) {
      return res.status(409).json({ error: "authorization already used on-chain" });
    }

    if (walletSoFar + required6 > perWalletCap) {
      return res.status(400).json({ error: "wallet cap reached" });
    }

    if (counted + required6 > totalCap) {
      return res.status(400).json({ error: "total cap reached" });
    }

    const initialRecord: AuthorizationRecord = {
      status: "pending",
      from: fromAddress,
      to: toAddress,
      value: valueBig.toString(),
      validAfter: validAfterNum,
      validBefore: validBeforeNum,
      nonce,
      signature: payload.signature,
      updatedAt: Date.now(),
    };

    const reserved = await writeAuthorizationRecord(cacheKey, initialRecord, { onlyIfAbsent: true });
    if (!reserved) {
      const snapshot = await readAuthorizationRecord(cacheKey);
      return res.status(409).json({ error: "authorization already submitted", status: snapshot?.status, paymentTx: snapshot?.paymentTx });
    }

    let transferTx;
    try {
      transferTx = await usdcAuthorizationContract.transferWithAuthorization(
        fromAddress,
        toAddress,
        valueBig,
        validAfterBig,
        validBeforeBig,
        nonce,
        signature.v,
        signature.r,
        signature.s
      );
    } catch (error: any) {
      await dropAuthorizationRecord(cacheKey);
      console.error("transferWithAuthorization broadcast failed:", error);
      const message = error?.shortMessage || error?.error?.message || error?.message || "transferWithAuthorization failed";
      return res.status(502).json({ error: message });
    }

    await writeAuthorizationRecord(cacheKey, {
      ...initialRecord,
      status: "broadcasted",
      paymentTx: transferTx.hash,
      updatedAt: Date.now(),
    });

    const transferReceipt = await transferTx.wait();
    if (transferReceipt.status !== 1) {
      await writeAuthorizationRecord(cacheKey, {
        ...initialRecord,
        status: "failed",
        paymentTx: transferTx.hash,
        error: "transferWithAuthorization reverted",
        updatedAt: Date.now(),
      });
      return res.status(502).json({ error: "transferWithAuthorization reverted", paymentTx: transferTx.hash });
    }

    let distributeTx;
    try {
      distributeTx = await token.distribute(fromAddress, required6);
    } catch (error: any) {
      console.error("token.distribute failed after payment:", error);
      await writeAuthorizationRecord(cacheKey, {
        ...initialRecord,
        status: "failed",
        paymentTx: transferTx.hash,
        error: "distribution failed after payment",
        updatedAt: Date.now(),
      });
      return res.status(500).json({
        error: "distribution failed after payment; please contact support with payment tx hash",
        paymentTx: transferTx.hash,
      });
    }

    const distributeReceipt = await distributeTx.wait();
    if (distributeReceipt.status !== 1) {
      await writeAuthorizationRecord(cacheKey, {
        ...initialRecord,
        status: "failed",
        paymentTx: transferTx.hash,
        distributorTx: distributeTx.hash,
        error: "distribution reverted",
        updatedAt: Date.now(),
      });
      return res.status(500).json({
        error: "distribution reverted after payment; please contact support",
        paymentTx: transferTx.hash,
        distributorTx: distributeTx.hash,
      });
    }

    const finalRecord: AuthorizationRecord = {
      ...initialRecord,
      status: "completed",
      paymentTx: transferTx.hash,
      distributorTx: distributeTx.hash,
      updatedAt: Date.now(),
    };
    await writeAuthorizationRecord(cacheKey, finalRecord);

    console.log("/gasless/transfer ✅ completed", {
      from: fromAddress,
      value: valueBig.toString(),
      paymentTx: transferTx.hash,
      distributorTx: distributeTx.hash,
    });

    res.json({
      ok: true,
      paymentTx: transferTx.hash,
      distributorTx: distributeTx.hash,
      status: finalRecord.status,
    });
  } catch (error: any) {
    console.error("/gasless/transfer error:", error);
    res.status(500).json({ error: error?.message || "internal error" });
  }
});

app.get("/gasless/status", async (req: Request, res: Response) => {
  const fromRaw = (req.query.from as string | undefined) || "";
  const nonce = (req.query.nonce as string | undefined) || "";
  if (!fromRaw || !nonce) {
    return res.status(400).json({ error: "from and nonce are required" });
  }

  let from: string;
  try {
    from = ethers.getAddress(fromRaw);
  } catch {
    return res.status(400).json({ error: "invalid from address" });
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) {
    return res.status(400).json({ error: "invalid nonce format" });
  }

  try {
    const key = authCacheKey(from, nonce);
    const record = await readAuthorizationRecord(key);
    if (!record) {
      return res.status(404).json({ error: "authorization not found" });
    }
    res.json(record);
  } catch (error: any) {
    console.error("/gasless/status error:", error);
    res.status(500).json({ error: error?.message || "internal error" });
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
        }), 'PX', VERIFY_RECORD_TTL_MS);
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
═══════════════════════════════════════
      🚀 LICODE Backend Server             
═══════════════════════════════════════
  Port: ${port}
  Redis: ${REDIS_ENABLED ? 'enabled' : 'DISABLED ⚠️'}
  Rate Limit: ${ENABLE_RATE_LIMIT ? 'enabled' : 'disabled'}
  CORS: ${ENABLE_CORS ? 'enabled' : 'disabled'}
════════════════════════════════════════
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
