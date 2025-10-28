# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LICODE x402 is a full-stack token minting system on Base blockchain implementing the x402 payment verification pattern. Users pay USDC to mint LICODE tokens at a fixed rate (default: 1 USDC → 5,000 LICODE) with enforced per-wallet and total caps.

**Architecture:**
- **Smart Contract**: ERC-20 token with distributor-based minting (Solidity 0.8.24)
- **Backend**: Express server that verifies USDC payments on-chain and distributes tokens
- **Frontend**: Next.js 14 app with wallet integration (wagmi, viem) and QR code support

## Key Development Commands

### Root (Hardhat)
```bash
pnpm install                    # Install all dependencies
pnpm build                      # Compile contracts
pnpm run deploy                 # Deploy to Base mainnet
pnpm run deploySepolia          # Deploy to Base Sepolia testnet
TOKEN_ADDRESS=0x... pnpm run verify  # Verify contract on Basescan
```

### Backend
```bash
cd backend
pnpm install
pnpm run dev                    # Start Express server on port 3001
```

### Frontend
```bash
cd frontend
pnpm install
pnpm run dev                    # Start Next.js dev server on port 3000
pnpm run build                  # Build for production
pnpm run start                  # Start production server
```

## Architecture Details

### Token Contract Flow
The `LicodeToken` contract (contracts/LicodeToken.sol) is an ERC-20 with these characteristics:
- Entire supply mints to the **contract itself** at deployment
- Only the designated `distributor` EOA can call `distribute()` to transfer tokens to users
- Enforces caps: `totalUsdcCap` (aggregate) and `perWalletUsdcCap` (per user), tracked in 6-decimal USDC units
- Rate conversion: tokens = (usdcAmount6 * tokensPerUsdc) / 1e6
- Owner can call `ownerWithdraw()` to relocate tokens (for LP or treasury)

### Backend Verification Flow (backend/src/server.ts)
1. **GET /mint** → Returns HTTP 402 with payment details (USDC amount, treasury address)
2. **POST /verify** → Accepts `{txHash, user}`:
   - Fetches transaction receipt from Base RPC
   - Scans logs for USDC Transfer events from user → treasury
   - Validates payment amount matches `MINT_USDC_6`
   - Checks per-wallet cap hasn't been exceeded
   - Calls `token.distribute(user, usdcAmount6)` on-chain
   - Returns distributor transaction hash
3. **GET /stats** → Returns contract statistics (supply, minted tokens, caps, etc.)

### Frontend Architecture (frontend/app/)
- **page.tsx**: Main UI with three payment modes:
  - Manual tx hash submission
  - QR code scanning (ERC-681 format)
  - Wallet connection (wagmi) for direct USDC transfer
- **providers.tsx**: WagmiConfig and QueryClient setup for Base network
- **layout.tsx**: Root layout with global providers

### Environment Configuration
The system requires proper `.env` setup at three levels:

**Root `.env` (for Hardhat deployment):**
- `RPC_URL_BASE`, `DEPLOYER_PRIVATE_KEY`
- Token parameters: `TOKEN_NAME`, `TOTAL_SUPPLY_18`, `TOKENS_PER_USDC_18`
- Caps: `TOTAL_USDC_CAP_6`, `PER_WALLET_USDC_CAP_6`
- `DISTRIBUTOR_ADDRESS`, `OWNER_ADDRESS`

**backend/.env:**
- `RPC_URL_BASE`, `TOKEN_ADDRESS`, `USDC_ADDRESS`
- `TREASURY_ADDRESS` (receives USDC payments)
- `DISTRIBUTOR_PRIVATE_KEY` (EOA that calls distribute())
- `MINT_USDC_6` (e.g., "1000000" for 1 USDC)
- `CHAIN_ID` (8453 for Base mainnet, 84532 for Sepolia)

**Critical:** `USDC_ADDRESS` must be the correct USDC token on Base:
- Base mainnet: `0x833589fCD6eDb6E08f4c7C38f3dCF7E808A7C366` (Circle native USDC)
- Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (common testnet)

## Important Operational Details

### Distributor Role
- The distributor EOA **does not custody tokens**
- It only needs gas (ETH) to execute `distribute()` transactions
- All LICODE remains in the contract until distributed
- To change distributor: owner calls `token.setDistributor(newAddress)`, then update `DISTRIBUTOR_PRIVATE_KEY` in backend/.env

### Token Withdrawal for LP/Treasury
Use scripts/withdraw.ts to move tokens from contract to other addresses:
```bash
# Set in root .env:
WITHDRAW_TO_ADDRESS=0xDestination
WITHDRAW_AMOUNT_18=1000000
TOKEN_ADDRESS=0xYourToken

pnpm hardhat run scripts/withdraw.ts --network base
```

### Decimal Handling
- LICODE tokens: 18 decimals (standard ERC-20)
- USDC: 6 decimals
- Contract tracks USDC in 6-decimal units (`usdcAmount6`)
- Conversion happens in `distribute()`: `tokenAmount = (usdcAmount6 * tokensPerUsdc) / 1e6`

### Network Configuration
Hardhat supports three networks:
- `base`: Base mainnet (ChainId 8453)
- `baseSepolia`: Base Sepolia testnet (ChainId 84532)
- `baseGoerli`: Base Goerli (deprecated, ChainId 84531)

## Testing Strategy
Before mainnet deployment:
1. Deploy to Base Sepolia using `pnpm run deploySepolia`
2. Configure backend with Sepolia RPC and testnet USDC address
3. Test full flow: mint request → USDC payment → verification → token distribution
4. Verify caps enforce correctly at both contract and backend levels
5. Test edge cases: insufficient payment, wallet cap exceeded, invalid tx hash

## Technology Stack
- **Contracts**: Solidity 0.8.24, OpenZeppelin 5.0, Hardhat 2.22
- **Backend**: Node.js, Express 4.19, ethers.js 6.10, TypeScript
- **Frontend**: Next.js 14.2, React 18, wagmi 2.13, viem 2.9, TanStack Query 5.59

## Common Gotchas
- Backend `package.json` uses `"type": "commonjs"`, not `"module"` (despite PRD showing ES modules)
- Frontend rewrites/proxies to backend should route `/api/*` to `http://localhost:3001`
- USDC Transfer event scanning is case-sensitive on addresses (backend lowercases all addresses)
- Per-wallet cap check happens both in backend (pre-flight) and contract (enforcement)
- Gas costs: User pays for USDC transfer, project pays for `distribute()` calls
