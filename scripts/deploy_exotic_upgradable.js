const { ethers, upgrades } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying contracts with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const ExoticUniqueContractFactory = await ethers.getContractFactory("ExoticUnique");
    console.log("Deploying ExoticUnique...");
    // the array contains all the function arguments for the initializer function
    // the initializer function could be anything
    // example: await upgrades.deployProxy(TokenizedEuro, ["Euro", "EUR", 2], { initializer: 'initialize' });
    const exoticUniqueContract = await upgrades.deployProxy(ExoticUniqueContractFactory, [], { initializer: 'initialize' });
    await exoticUniqueContract.deployed();
    console.log("ExoticUnique deployed to:", exoticUniqueContract.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
  
