const { ethers, upgrades } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying contracts with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const Nusas = await ethers.getContractFactory("NUSAS");
    console.log("Deploying NUSAS...");
    // the array contains all the function arguments for the initializer function
    // the initializer function could be anything
    // example: await upgrades.deployProxy(TokenizedEuro, ["Euro", "EUR", 2], { initializer: 'initialize' });
    const nusas = await upgrades.deployProxy(Nusas, [], { initializer: 'initialize', kind: 'uups' });
    await nusas.deployed();
    console.log("NUSAS deployed to:", nusas.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
  
