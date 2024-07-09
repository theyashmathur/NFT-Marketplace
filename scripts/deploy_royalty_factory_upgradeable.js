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

  const RoyaltyFactory = await ethers.getContractFactory("RoyaltyFactory");
  console.log("array:", process.env.WHITELIST.split(', '));
  const royaltyFactory = await upgrades.deployProxy(RoyaltyFactory, [process.env.ROYALTY, process.env.WHITELIST.split(', ')], { initializer: 'initialize', kind: 'uups' });
  await royaltyFactory.deployed();
    
  console.log("Royalty contract deployed to:", royaltyFactory.address);
    
  const addresses = [
    `ROYALTY_FACTORY = ${royaltyFactory.address}`
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