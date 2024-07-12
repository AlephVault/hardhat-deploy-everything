import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "hardhat-enquirer-plus";
import "hardhat-common-tools";
import "hardhat-blueprints";
import "hardhat-ignition-deploy-everything";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      chainId: 31337,
      accounts: {
        mnemonic: "dentist whale pattern drastic time black cigar bike person destroy punch hungry",
        accountsBalance: "10000000000000000000000",
        count: 100
      }
    },
    testnet: {
      chainId: 80002,
      url: "https://rpc-amoy.polygon.technology",
      accounts: {
        mnemonic: "dentist whale pattern drastic time black cigar bike person destroy punch hungry",
        // mnemonic: process.env.MNEMONIC || 'invalid-mnemonic-please-set-one',
        count: 100
      }
    },
    mainnet: {
      chainId: 137,
      url: "https://polygon-mainnet.infura.io",
      accounts: {
        mnemonic: "dentist whale pattern drastic time black cigar bike person destroy punch hungry",
        // mnemonic: process.env.MNEMONIC || 'invalid-mnemonic-please-set-one',
        count: 100
      }
    }
  }
};

export default config;
