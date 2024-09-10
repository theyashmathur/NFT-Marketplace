const { ethers, upgrades } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying contracts with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const Hosoi = await ethers.getContractFactory("Hosoi");
    console.log("Deploying Hosoi...");
    // the array contains all the function arguments for the initializer function
    // the initializer function could be anything
    // example: await upgrades.deployProxy(TokenizedEuro, ["Euro", "EUR", 2], { initializer: 'initialize' });
    const hosoi = await upgrades.deployProxy(Hosoi, [], { initializer: 'initialize', kind: 'uups' });
    await hosoi.deployed();
    console.log("Hosoi deployed to:", hosoi.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
  
