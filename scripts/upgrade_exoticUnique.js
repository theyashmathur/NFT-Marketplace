const { ethers, upgrades } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying contracts with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const ExoticUniqueContractFactoryV2 = await ethers.getContractFactory("ExoticUniqueV2");
    console.log("Upgrading ExoticUnique...");
    const exoticUniqueContract = await upgrades.upgradeProxy("0x26CA1d5789Bb7Aa6F55b1a8b34cF2508DFc2d748", ExoticUniqueContractFactoryV2);
    console.log("ExoticUnique upgraded");
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
  