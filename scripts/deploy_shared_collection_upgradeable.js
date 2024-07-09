const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const NftSharedCollection = await ethers.getContractFactory("NftSharedCollection");
    const nftSharedCollection = await upgrades.deployProxy(NftSharedCollection, [deployer.address, "https://placeholder.com/", "https://placeholder.com/contract", deployer.address, 0, 100, "0x25FBdd1dd05a4bb6509bb77E8f02B349DFd8dFbf"], { initializer: 'initializeSharedCollection', kind: 'uups' });
    await nftSharedCollection.deployed();
    
    console.log("NFT Shared Collection deployed to:", nftSharedCollection.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });