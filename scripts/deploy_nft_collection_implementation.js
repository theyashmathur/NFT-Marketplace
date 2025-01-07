const { ethers } = require("hardhat");

async function main() {

    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying NFT Collection implementation with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const NFTCollection = await ethers.getContractFactory("NftCollection");
    const nftCollection = await upgrades.deployProxy(NFTCollection, [
            "0xDbe0453602F9B940C4ae0057Cc25B6cf8ff3f200",
            "NFT Collection",
            "NFTC",
            "ipfs://xxx/",
            "ipfs://yyy/",
            "0xDbe0453602F9B940C4ae0057Cc25B6cf8ff3f200",
            1,
            100,
            "0x868026419b28b42dCfA38177c528073Ed740a1ad",
        ], { initializer: 'initialize', kind: 'uups' });
    await nftCollection.deployed();

    console.log("NFT Collection deployed to: ", nftCollection.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
