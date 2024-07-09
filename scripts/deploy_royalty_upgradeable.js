const { ethers, upgrades } = require("hardhat");
const fs = require('fs');
const { promisify } = require('util');
require('dotenv').config();

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log(
    "Deploying contracts with the account:",
    deployer.address
  );
    
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const Royalty = await ethers.getContractFactory("Royalty");
  const royalty = await upgrades.deployProxy(Royalty, [process.env.BASE_URI, process.env.CONTRACT_URI], { initializer: 'initializeRoyalty', kind: 'uups' });
  await royalty.deployed();
  
  console.log("Royalty contract deployed to:", royalty.address);
    
  const addresses = [
    `ROYALTY = ${royalty.address}`
  ]
    
  const data = '\n' + addresses.join('\n');
  const writeFile = promisify(fs.appendFile);
  const filePath = '.env';
  
  return writeFile(filePath, data)
      .then(() => {
      console.log('Addresses recorded.');
      })
      .catch((error) => {
          console.error('Error logging addresses:', error);
          throw error;
      });

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });