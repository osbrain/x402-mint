import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    base: {
      url: process.env.RPC_URL_BASE || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    },
    baseGoerli: {
      url: process.env.RPC_URL_BASE_GOERLI || "https://goerli.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84531
    },
    baseSepolia: {
      url: process.env.RPC_URL_BASE_GOERLI || "https://sepolia.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532
    }
  },
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY || ""
  }
};

export default config;
