const { ethers } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying SFT Collection implementation with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const SFTCollection = await ethers.getContractFactory("SFTCollection");
    const sftCollection = await SFTCollection.deploy();
    await sftCollection.deployed();

    console.log("NFT Collection deployed to: ", sftCollection.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
