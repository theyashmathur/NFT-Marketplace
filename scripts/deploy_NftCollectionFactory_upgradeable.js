const { ethers, upgrades } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying contracts with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const NftCollectionFactory = await ethers.getContractFactory("NftCollectionFactory");
    console.log("Deploying NftCollectionFactory...");
    // the array contains all the function arguments for the initializer function
    // the initializer function could be anything
    // example: await upgrades.deployProxy(TokenizedEuro, ["Euro", "EUR", 2], { initializer: 'initialize' });
    const nftCollectionFactory = await upgrades.deployProxy(NftCollectionFactory, ["0x246F73aa983eb6bD3E7A9b7dEd86a521D93A970d", "0x246F73aa983eb6bD3E7A9b7dEd86a521D93A970d", "0x246F73aa983eb6bD3E7A9b7dEd86a521D93A970d"], { initializer: 'initialize', kind: 'uups' });
    await nftCollectionFactory.deployed();
    console.log("NftCollectionFactory deployed to:", nftCollectionFactory.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
