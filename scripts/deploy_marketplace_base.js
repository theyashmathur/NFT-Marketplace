const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const MarketplaceBase = await ethers.getContractFactory("MarketplaceBase");
    const marketplaceBase = await upgrades.deployProxy(MarketplaceBase, { initializer: 'initialize', kind: 'uups' });
    await marketplaceBase.deployed();
    
    console.log("Marketplace Base deployed to:", marketplaceBase.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });