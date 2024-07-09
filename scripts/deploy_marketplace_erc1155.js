const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );
  
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const MarketplaceERC1155 = await ethers.getContractFactory("MarketplaceERC1155");
    const marketplaceERC1155 = await upgrades.deployProxy(MarketplaceERC1155, { initializer: 'initMarketplaceERC1155', kind: 'uups' });
    await marketplaceERC1155.deployed();
    
    console.log("Marketplace ERC1155 deployed to:", marketplaceERC1155.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });