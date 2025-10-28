# LICODE x402 Scaffold

Minimal full-stack implementation that matches `licode_x_402_mint_prd_full_stack_scaffold.md`:

- Hardhat workspace (`contracts/`, `scripts/`, `.env.example`)
- Backend x402 verifier/distributor (`backend/`)
- Next.js mint UI (`frontend/`)

## Quick Start

### 1. Install deps
```bash
pnpm install
(cd backend && pnpm install)
(cd frontend && pnpm install)
```

### 2. Configure envs
- Copy `.env.example` → `.env` and fill in RPC/key/token params.
- Copy `backend/.env.example` → `backend/.env` with `TOKEN_ADDRESS`, `TREASURY_ADDRESS`, `USDC_ADDRESS`, etc.

### 3. Deploy + verify token
```bash
pnpm run deploy
TOKEN_ADDRESS=0x... pnpm run verify
```

### 4. Run services
```bash
# backend
cd backend && pnpm run dev
# frontend (add proxy/rewrites so /api → backend)
cd ../frontend && pnpm run dev
```

### 5. Launch
Publish mint rules, track tx hashes, then add Uniswap V3 liquidity per the PRD guidance.

### Change distributor (optional)
`DISTRIBUTOR_ADDRESS` is the only account allowed to call `distribute()` on `LicodeToken`. To rotate it:
```js
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, ethers.provider);
const token = await ethers.getContractAt("LicodeToken", "0xYourToken", wallet);
const tx = await token.setDistributor("0xNewDistributor");
await tx.wait();
```
After the tx confirms, update `backend/.env` with the new `DISTRIBUTOR_PRIVATE_KEY` so the backend signer matches the contract.

## Operational Notes

- **Distributor does not custody tokens.** The entire LICODE supply mints to the token contract itself (`balanceOf(tokenAddress)` holds the remainder). When the backend's distributor signer calls `distribute(user, usdcAmount6)`, the contract transfers tokens directly from its own balance to the user. You do **not** (and should not) transfer tokens to `DISTRIBUTOR_ADDRESS`; it only needs gas. If the deployer/owner wants to hold tokens, they must withdraw them from the contract using `ownerWithdraw` (see below).
- **Owner can relocate tokens when needed.** Use `ownerWithdraw(to, amount)` (e.g., for LP or treasury wallets) through the helper script below.
- **`USDC_ADDRESS`** tells the backend which ERC‑20 contract to inspect for `Transfer` logs when validating payments. If this value is wrong, every `/verify` call will fail. Examples: Base mainnet uses Circle's native USDC (`0x833589fCD6eDb6E08f4c7cA8C5d6d7a2fd8BADf1`); Base Sepolia commonly uses the faucet token at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- **Frontend UX has three modes.** Users can (1) pay manually and paste their tx hash, (2) scan a QR code that encodes the ERC‑681 payment request, or (3) connect an EVM wallet (MetaMask, Coinbase, etc.) to send USDC directly—after the wallet tx confirms, the app automatically verifies and distributes LICODE.

## Withdrawing LICODE for LP/Treasury

1. Set the helper env vars in `.env`:
   ```env
   WITHDRAW_TO_ADDRESS=0xDestination
   WITHDRAW_AMOUNT_18=1000000   # 1,000,000 LICODE
   TOKEN_ADDRESS=0xYourToken
   ```
2. Run the script with the owner key loaded (same `DEPLOYER_PRIVATE_KEY` that owns the contract):
   ```bash
   pnpm hardhat run scripts/withdraw.ts --network baseSepolia
   # or --network base for mainnet
   ```
3. The script calls `ownerWithdraw(to, amount)` and prints the tx hash once confirmed.

Use this to seed LPs, treasury wallets, or to send a chunk of tokens to another account. Regular mint distributions should always flow through the backend via `distribute()`.
