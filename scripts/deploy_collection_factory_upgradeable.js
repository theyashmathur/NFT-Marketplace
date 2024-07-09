const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const NftCollectionFactory = await ethers.getContractFactory("NftCollectionFactory");
    const collectionFactory = await upgrades.deployProxy(NftCollectionFactory, [deployer.address, deployer.address, deployer.address], { initializer: 'initialize', kind: 'uups' });
    await collectionFactory.deployed();
    
    console.log("Collection Factory deployed to:", collectionFactory.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });