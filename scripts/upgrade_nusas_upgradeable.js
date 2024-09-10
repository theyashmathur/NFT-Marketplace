const { ethers, upgrades } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
    const NUSAS_PROXY = "0x8aab265f4CE3CAb9eA34A267508066e9F0bB1640";
  
    console.log(
      "Upgrading contracts with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const NewNusas = await ethers.getContractFactory("NUSAS");
    console.log("Upgrading NUSAS...");

    const nusas = await upgrades.upgradeProxy(NUSAS_PROXY, NewNusas);
    await nusas.wait();
    console.log(`NUSAS on ${nusas.address} upgraded`);
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
  
