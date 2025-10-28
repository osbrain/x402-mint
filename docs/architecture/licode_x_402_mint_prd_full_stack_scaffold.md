# LICODE — x402 Mint + Uniswap (Base) \[PRD + Full Stack Scaffold]

This document gives you everything needed to launch **LICODE** as an x402-style mint on **Base**, with:

- A clear **PRD** (decisions configurable via `.env`)
- **Smart contract** (ERC‑20 with safe distributor hook)
- **Backend** (x402-style payment check → token distribution)
- **Frontend** (simple Next.js mint UI)
- **Hardhat scripts** (deploy, verify)
- **Uniswap V3 liquidity steps** (UI-first, with optional script scaffold)

> ⚠️ Legal & Risk: This is a meme-style launch pattern. Do not promise profit. Consider local regulations. Use at your own risk.

---

## 0) Repo Layout

```
licode-x402/
├─ contracts/
│  └─ LicodeToken.sol
├─ hardhat.config.ts
├─ package.json
├─ scripts/
│  ├─ deploy.ts
│  └─ verify.ts
├─ .env.example
├─ backend/
│  ├─ package.json
│  ├─ src/
│  │  ├─ server.ts
│  │  └─ chain.ts
│  └─ .env.example
└─ frontend/
   ├─ package.json
   ├─ next.config.js
   └─ app/
      └─ page.tsx
```

---

## 1) PRD — Product Requirements (Configurable)

### 1.1 Goals
- Let users **mint LICODE by paying USDC** on **Base** via an x402-style flow.
- Keep **mint cost low** (default: 1 USDC → 5,000 LICODE).
- Enforce a **total cap** and **per-wallet limit**.
- After mint window/cap, make LICODE **tradable on Uniswap V3 (Base)**.

### 1.2 Key Decisions (All configurable)
- **Treasury wallet (USDC recipient):** `TREASURY_ADDRESS` (in `.env`)
- **Distributor signer (EOA that calls contract):** `DISTRIBUTOR_PRIVATE_KEY` (backend `.env`)
- **USDC on Base address:** `USDC_ADDRESS` (set explicitly in `.env`)
- **Mint price (USDC)**: default 1 USDC
- **Rate:** default 1 USDC = 5,000 LICODE
- **Per-wallet max (USDC):** default 10 USDC
- **Total mint cap (USDC):** default 100,000 USDC
- **Total supply:** default 1,000,000,000 LICODE (1e9 * 1e18)
- **Chain:** Base mainnet (ChainId 8453)

### 1.3 User Flow
1. User opens mint page → clicks **Mint 1 USDC**.
2. Backend replies **HTTP 402** with `amount=1 USDC`, `payTo=TREASURY_ADDRESS` (x402-style).
3. User sends **1 USDC on Base** to `TREASURY_ADDRESS` (wallet pays gas).
4. Frontend submits **tx hash** + **user address** to `/verify`.
5. Backend **verifies on-chain** that the USDC transfer occurred and fits rules (cap & per-wallet).
6. Backend (as distributor) calls **`distribute()`** on the token contract to **transfer LICODE** from the contract to the user address.

### 1.4 Gas & Cost Policy
- **User** pays gas to send USDC.
- **Project** pays gas for LICODE distribution (backend signer). You can flip to a claim model later if desired.

### 1.5 Trust & Safety
- Token supply pre-minted to the **token contract** (not EOA). Distributor can only move tokens via strict rules.
- Publish: contract address, treasury, rules, caps.
- Optional: renounce ownership after launch / time-lock setters.

---

## 2) Smart Contract — `contracts/LicodeToken.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * LICODE — ERC20 with capped distributor-based distributions.
 *
 * Design choices:
 * - Entire supply is minted to this contract at deploy.
 * - A trusted `distributor` (your backend signer) can call `distribute()`
 *   to move tokens from the contract to users AFTER it has verified a valid USDC payment.
 * - We track an aggregate USDC cap and a per-wallet USDC cap (both in 6 decimals).
 * - Rate is `tokensPerUsdc` (18-dec tokens per 1e6 USDC units).
 */
contract LicodeToken is ERC20, Ownable {
    address public distributor;              // backend signer EOA

    uint256 public immutable tokensPerUsdc;  // e.g. 5000e18 tokens per 1 USDC(1e6)
    uint256 public immutable totalUsdcCap;   // e.g. 100_000e6 (in USDC 6-dec units)
    uint256 public immutable perWalletUsdcCap; // e.g. 10e6 (6-dec)

    uint256 public usdcCounted; // total USDC accounted in distributions (6-dec)
    mapping(address => uint256) public usdcByWallet; // (6-dec)

    event Distributed(address indexed to, uint256 usdcAmount6, uint256 tokenAmount);
    event DistributorChanged(address indexed newDistributor);

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,          // in 18 decimals
        address _owner,
        address _distributor,
        uint256 _tokensPerUsdc,        // tokens per 1 USDC, in 18 decimals (e.g., 5000e18)
        uint256 _totalUsdcCap,         // in 6 decimals (e.g., 100_000e6)
        uint256 _perWalletUsdcCap      // in 6 decimals (e.g., 10e6)
    ) ERC20(_name, _symbol) Ownable(_owner) {
        require(_owner != address(0), "owner=0");
        require(_distributor != address(0), "distributor=0");
        require(_tokensPerUsdc > 0, "rate=0");
        require(_totalUsdcCap > 0, "cap=0");
        require(_perWalletUsdcCap > 0, "walletCap=0");

        distributor = _distributor;
        tokensPerUsdc = _tokensPerUsdc;
        totalUsdcCap = _totalUsdcCap;
        perWalletUsdcCap = _perWalletUsdcCap;

        _mint(address(this), _totalSupply); // hold all supply in the contract
    }

    modifier onlyDistributor() {
        require(msg.sender == distributor, "not distributor");
        _;
    }

    function setDistributor(address _d) external onlyOwner {
        require(_d != address(0), "0");
        distributor = _d;
        emit DistributorChanged(_d);
    }

    /**
     * @notice Move tokens from contract to `to` based on `usdcAmount6` (6-dec).
     *         Enforces total cap & per-wallet cap. One call can represent 1 USDC or more.
     */
    function distribute(address to, uint256 usdcAmount6) external onlyDistributor {
        require(to != address(0), "to=0");
        require(usdcAmount6 > 0, "amt=0");

        // enforce caps
        require(usdcCounted + usdcAmount6 <= totalUsdcCap, "total cap reached");
        require(usdcByWallet[to] + usdcAmount6 <= perWalletUsdcCap, "wallet cap reached");

        // compute token amount: tokens = (usdcAmount6 * tokensPerUsdc) / 1e6
        uint256 tokenAmount = (usdcAmount6 * tokensPerUsdc) / 1e6;

        usdcCounted += usdcAmount6;
        usdcByWallet[to] += usdcAmount6;

        _transfer(address(this), to, tokenAmount);
        emit Distributed(to, usdcAmount6, tokenAmount);
    }

    /** Owner can withdraw leftover tokens (e.g., for LP or liquidity) */
    function ownerWithdraw(address to, uint256 amount) external onlyOwner {
        _transfer(address(this), to, amount);
    }
}
```

---

## 3) Hardhat Setup (root)

**`package.json`**
```json
{
  "name": "licode-x402",
  "private": true,
  "scripts": {
    "build": "hardhat compile",
    "deploy": "hardhat run scripts/deploy.ts --network base",
    "verify": "hardhat run scripts/verify.ts --network base"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^5.0.0",
    "@types/node": "^20.11.0",
    "dotenv": "^16.4.0",
    "hardhat": "^2.22.10",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  },
  "dependencies": {
    "@openzeppelin/contracts": "^5.0.2"
  }
}
```

**`.env.example`**
```
# Base RPC (choose one: Alchemy/Infura/NodeRun/etc)
RPC_URL_BASE="https://mainnet.base.org"
# Deployer key (for contracts) — use a fresh key
DEPLOYER_PRIVATE_KEY="0x..."

# Token params
TOKEN_NAME="LICODE"
TOKEN_SYMBOL="LICODE"
TOTAL_SUPPLY_18="1000000000"     # 1e9 tokens (18-decimals handled in script)
TOKENS_PER_USDC_18="5000"        # 5,000 tokens per 1 USDC (18-decimals handled in script)
TOTAL_USDC_CAP_6="100000000000"  # 100,000 USDC expressed in 6 decimals (100000 * 1e6)
PER_WALLET_USDC_CAP_6="10000000" # 10 USDC per wallet (6 decimals)

# Post-deploy wiring (also used by backend)
DISTRIBUTOR_ADDRESS="0xYourDistributorEOA"
OWNER_ADDRESS="0xYourDeployer"   # needed for verify script if different from distributor
BASESCAN_API_KEY=""              # optional, for contract verification
```

**`hardhat.config.ts`**
```ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv"; dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    base: {
      url: process.env.RPC_URL_BASE || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    }
  },
  etherscan: {
    // If you have a Basescan API key, put it here to auto-verify
    apiKey: process.env.BASESCAN_API_KEY || ""
  }
};
export default config;
```

**`scripts/deploy.ts`**
```ts
import { ethers } from "hardhat";
import * as dotenv from "dotenv"; dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const name = process.env.TOKEN_NAME || "LICODE";
  const symbol = process.env.TOKEN_SYMBOL || "LICODE";

  const totalSupply = ethers.parseUnits(process.env.TOTAL_SUPPLY_18 || "1000000000", 18);
  const tokensPerUsdc = ethers.parseUnits(process.env.TOKENS_PER_USDC_18 || "5000", 18);
  const totalUsdcCap6 = BigInt(process.env.TOTAL_USDC_CAP_6 || "100000000000");
  const perWalletCap6 = BigInt(process.env.PER_WALLET_USDC_CAP_6 || "10000000");

  const owner = process.env.OWNER_ADDRESS || deployer.address;
  const distributor = process.env.DISTRIBUTOR_ADDRESS || deployer.address;

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

main().catch((e) => { console.error(e); process.exit(1); });
```

**`scripts/verify.ts`**
```ts
import { run } from "hardhat";
import { ethers } from "ethers";
import * as dotenv from "dotenv"; dotenv.config();

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

main().catch((e) => { console.error(e); process.exit(1); });
```

> Note: If verification args mismatch, copy the actual deploy args printed in `deploy.ts` and use them in `verify.ts`.

---

## 4) Backend (x402-style) — `backend/`

**`backend/package.json`**
```json
{
  "name": "licode-backend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "ts-node src/server.ts"
  },
  "dependencies": {
    "dotenv": "^16.4.0",
    "ethers": "^6.10.0",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  }
}
```

**`backend/.env.example`**
```
RPC_URL_BASE="https://mainnet.base.org"
TOKEN_ADDRESS="0xYourToken"       # from deploy
USDC_ADDRESS="0xYourUSDCOnBase"   # Example: Base native USDC starts 0x833589fC... (verify!)
TREASURY_ADDRESS="0xYourTreasury"
DISTRIBUTOR_PRIVATE_KEY="0x..."    # funds this signer with a bit of ETH on Base
MINT_USDC_6="1000000"              # 1 USDC in 6-dec units
```

**`backend/src/chain.ts`**
```ts
import { ethers } from "ethers";

export function erc20Iface() {
  return new ethers.Interface([
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ]);
}
```

**`backend/src/server.ts`**
```ts
import express from "express";
import * as dotenv from "dotenv"; dotenv.config();
import { ethers } from "ethers";
import { erc20Iface } from "./chain";

const app = express();
app.use(express.json());

const RPC = process.env.RPC_URL_BASE!;
const provider = new ethers.JsonRpcProvider(RPC);

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS!;
const USDC_ADDRESS = process.env.USDC_ADDRESS!; // set correct Base USDC address
const TREASURY = (process.env.TREASURY_ADDRESS || "").toLowerCase();
const PK = process.env.DISTRIBUTOR_PRIVATE_KEY!;
const signer = new ethers.Wallet(PK, provider);

const token = new ethers.Contract(TOKEN_ADDRESS, new ethers.Interface([
  "function distribute(address to, uint256 usdcAmount6) external",
  "function usdcByWallet(address) view returns (uint256)",
  "function perWalletUsdcCap() view returns (uint256)",
  "function totalUsdcCap() view returns (uint256)",
  "function usdcCounted() view returns (uint256)"
]), signer);

// x402-style 402 response
app.get("/mint", async (req, res) => {
  res.status(402).json({
    message: "Payment Required",
    network: "base",
    currency: "USDC",
    amount6: process.env.MINT_USDC_6 || "1000000",
    payTo: TREASURY
  });
});

// Verify a USDC transfer tx and distribute LICODE
app.post("/verify", async (req, res) => {
  try {
    const { txHash, user } = req.body as { txHash: string; user: string };
    if (!txHash || !user) return res.status(400).json({ error: "missing args" });

    const rcpt = await provider.getTransactionReceipt(txHash);
    if (!rcpt || rcpt.status !== 1) return res.status(400).json({ error: "tx not confirmed" });

    const USDC = new ethers.Contract(USDC_ADDRESS, erc20Iface(), provider);
    let paid6 = 0n;

    // scan logs for USDC Transfer(user -> TREASURY)
    for (const log of rcpt.logs) {
      if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue;
      try {
        const parsed = USDC.interface.parseLog({ data: log.data, topics: log.topics });
        if (parsed?.name === "Transfer") {
          const from = parsed.args[0].toLowerCase();
          const to = parsed.args[1].toLowerCase();
          const value = parsed.args[2] as bigint;
          if (from === user.toLowerCase() && to === TREASURY) paid6 += value;
        }
      } catch {}
    }

    const required6 = BigInt(process.env.MINT_USDC_6 || "1000000");
    if (paid6 < required6) return res.status(400).json({ error: "insufficient payment" });

    // Optional: enforce per-wallet cap (read from contract)
    const soFar = await token.usdcByWallet(user);
    const perWallet = await token.perWalletUsdcCap();
    if (soFar + required6 > perWallet) return res.status(400).json({ error: "wallet cap reached" });

    // Distribute (1x unit). For multiple mints, loop or send paid6/required6 times
    const tx = await token.distribute(user, required6);
    await tx.wait();

    res.json({ ok: true, tx: tx.hash });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(3001, () => console.log("Backend on :3001"));
```

> Notes:
> - For **gasless** UX you’d integrate Coinbase’s CDP / paymaster. This scaffold keeps it simple.
> - To support **multi-mint** in one payment, scale `distribute(user, n*required6)` or call in a loop.

---

## 5) Frontend (Next.js) — `frontend/`

**`frontend/package.json`**
```json
{
  "name": "licode-frontend",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  },
  "dependencies": {
    "next": "14.2.4",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "axios": "^1.7.2"
  }
}
```

**`frontend/next.config.js`**
```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;
```

**`frontend/app/page.tsx`**
```tsx
'use client';
import { useState } from 'react';
import axios from 'axios';

export default function Page() {
  const [step, setStep] = useState<'idle'|'needpay'|'sent'|'verifying'|'done'|'err'>('idle');
  const [payTo, setPayTo] = useState('');
  const [amount6, setAmount6] = useState('1000000');
  const [tx, setTx] = useState('');
  const [addr, setAddr] = useState('');
  const [msg, setMsg] = useState('');

  const askToMint = async () => {
    const r = await axios.get('/api/mint'); // proxy to backend or same origin
    if (r.status === 402) {
      setPayTo(r.data.payTo);
      setAmount6(r.data.amount6);
      setStep('needpay');
    }
  };

  const submitTx = async () => {
    setStep('verifying');
    try {
      const r = await axios.post('/api/verify', { txHash: tx, user: addr });
      if (r.data.ok) { setStep('done'); setMsg(`Minted! Distributor tx: ${r.data.tx}`); }
      else { setStep('err'); setMsg(r.data.error || 'Failed'); }
    } catch (e:any) { setStep('err'); setMsg(e.message); }
  };

  return (
    <main className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">LICODE Mint</h1>
      <p>Mint 1 USDC ➝ 5,000 LICODE on Base</p>

      <button className="px-4 py-2 rounded bg-black text-white" onClick={askToMint}>Mint 1 USDC</button>

      {step === 'needpay' && (
        <div className="border p-3 rounded">
          <p className="font-mono">PayTo (Treasury): {payTo}</p>
          <p>Amount: 1 USDC (send from your wallet on Base)</p>
          <p className="text-sm text-gray-500">Paste your payment tx hash and your address below once sent.</p>
        </div>
      )}

      <div className="space-y-2">
        <input className="border p-2 w-full" placeholder="Your wallet address" value={addr} onChange={e=>setAddr(e.target.value)} />
        <input className="border p-2 w-full" placeholder="USDC payment tx hash" value={tx} onChange={e=>setTx(e.target.value)} />
        <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={submitTx}>Verify & Receive</button>
      </div>

      {msg && <p className="text-sm">{msg}</p>}
    </main>
  );
}
```

> For local dev, proxy `/api/*` to the backend (e.g., Next.js `rewrites` or deploy backend to `/api`).

---

## 6) Uniswap V3 — Add Liquidity on Base

**UI-first (recommended for safety):**
1. Go to the official Uniswap interface on Base.
2. Create a pool **LICODE/USDC**. Select a **fee tier** (start with 1%).
3. Choose a **wide price range** for initial liquidity.
4. Deposit your planned USDC (from treasury) and corresponding LICODE.
5. Confirm tx(s). Optionally lock LP NFT via a third-party locker.

**Script scaffold (advanced):** set these in `.env` and integrate the Uniswap NFPM address for Base, then use their SDK. (Deliberately omitted here to avoid misconfigured addresses—safer to use the official UI.)

---

## 7) End-to-End Instructions

### 7.1 Prereqs
- Node 18+
- A fresh **deployer** EOA with a little ETH on Base
- A **treasury** EOA for USDC receipts (can be the same as deployer, but better separate)
- A **distributor** EOA with a bit of ETH on Base
- A reliable Base RPC URL

### 7.2 Install & Build (root)
```bash
pnpm i   # or npm i / yarn
pnpm build
```

### 7.3 Configure
1. Copy `.env.example` → `.env` and fill in variables (set `OWNER_ADDRESS` to the deployer, `DISTRIBUTOR_ADDRESS`, rate/caps, etc.).
2. In `backend/.env.example` → `backend/.env`, set `TOKEN_ADDRESS`, `USDC_ADDRESS`, `TREASURY_ADDRESS`, `DISTRIBUTOR_PRIVATE_KEY`.
   - ⚠️ **USDC_ADDRESS**: put the **official USDC on Base** address you trust.

### 7.4 Deploy Token
```bash
pnpm run deploy     # runs hardhat deploy to Base
# record the contract address; export TOKEN_ADDRESS for backend/frontend
```

### 7.5 Start Backend
```bash
cd backend
pnpm i
pnpm run dev
# exposes /mint (402) and /verify endpoints on :3001
```

### 7.6 Frontend Dev
```bash
cd ../frontend
pnpm i
# Add a proxy (next.config or vercel.json) so /api -> http://localhost:3001
pnpm dev
```

### 7.7 Launch Plan
- Publish the rules (1 USDC → 5,000 LICODE; caps; per-wallet limit; treasury address; contract address).
- Encourage tiny test mints first.
- After cap or window, add **LP on Uniswap V3** (Base). Publish the pool.

---

## 8) Gas & Budget Notes (ballpark)
- USDC transfer (user): ~$0.02–$0.10 on Base
- Distribution transfer (project): ~$0.02–$0.20 per mint
- If 10k mints, reserve ~$200–$2,000 in gas for distributions (varies with Base conditions).

---

## 9) Hardening / Next Steps
- Add **signature-based claims** to shift gas to users.
- Integrate Coinbase **Paymaster/CDP** for gasless UX.
- Add **rate-limits**, **reCAPTCHA**, and **allowlist** windows.
- Publish **Dune** dashboard for transparency.
- Add **LP lock** and ownership renounce/Timelock as appropriate.

---

## 10) Checklist Summary
- [ ] Set treasury & distributor addresses
- [ ] Deploy LICODE token
- [ ] Wire backend with token + USDC + treasury
- [ ] Publish mint rules page
- [ ] Test with Base Sepolia (recommended) then mainnet
- [ ] Execute LP on Uniswap V3
- [ ] Communicate risks and finalize docs

---

**That’s it.** This scaffold is intentionally minimal but production‑minded. You can drop it into a repo and iterate. If you want me to expand **LP scripting** or add a **claim model**, say the word and I’ll append those sections.
