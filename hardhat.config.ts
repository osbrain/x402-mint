import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200  // 优化 gas，200 是平衡部署和运行成本的推荐值
      }
    }
  },
  networks: {
    base: {
      url: process.env.RPC_URL_BASE || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gas: 5000000,        // Gas limit: 500万
      // gasPrice: 1000000,   // 注释掉，使用网络自动估算
      gasMultiplier: 1.5   // 增加到 50% 确保足够
    },
    baseGoerli: {
      url: process.env.RPC_URL_BASE_GOERLI || "https://goerli.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84531,
      gas: 5000000,
      gasMultiplier: 1.5
    },
    baseSepolia: {
      url: process.env.RPC_URL_BASE_GOERLI || "https://sepolia.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532,
      gas: 5000000,
      gasMultiplier: 1.5
    }
  },
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY || ""
  }
};

export default config;
