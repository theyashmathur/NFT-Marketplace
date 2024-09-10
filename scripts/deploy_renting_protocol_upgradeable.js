const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const NFTRenting = await ethers.getContractFactory("NFTRenting");
    const rentinProtocol = await upgrades.deployProxy(NFTRenting, { initializer: 'initialize', kind: 'uups' });
    await rentinProtocol.deployed();
    
    console.log("Renting Protocol deployed to:", rentinProtocol.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });