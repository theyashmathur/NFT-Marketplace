const { ethers } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying NFT Collection implementation with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const NFTCollection = await ethers.getContractFactory("NftCollection");
    const nftCollection = await NFTCollection.deploy();
    await nftCollection.deployed();

    console.log("NFT Collection deployed to: ", nftCollection.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
