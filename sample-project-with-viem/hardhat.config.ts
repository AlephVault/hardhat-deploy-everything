import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "hardhat-enquirer-plus";
import "hardhat-common-tools";
import "hardhat-blueprints";
import "hardhat-ignition-deploy-everything";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
};

export default config;
