const {extendEnvironment} = require("hardhat");

extendEnvironment((hre) => {
    if (!hre.ignition) {
        throw new Error(
            "The hardhat-ignition-deploy-everything module requires @nomicfoundation/hardhat-ignition " +
            "to be installed as a plug-in, along with the plug-in " + (
                hre.viem ? "@nomicfoundation/hardhat-ignition/viem" : "@nomicfoundation/hardhat-ignition-ethers"
            )
        );
    }

    // TODO continue here.
});