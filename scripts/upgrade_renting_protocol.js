const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    const RENTING_PROXY = "0xF8d094B91b9Bc1f7a9AbAf85863Da3cffA9bC660";
  
    console.log(
        "Upgrading contracts with the account:",
        deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const newRenting = await ethers.getContractFactory("NFTRenting");
    console.log("Upgrading Renting Protocol...");

    const rentingProtocol = await upgrades.upgradeProxy(RENTING_PROXY, newRenting, { initializer: 'initialize', kind: 'uups' });
    // await rentingProtocol.wait();
    console.log(`Renting Protocol on ${rentingProtocol.address} upgraded`);
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
