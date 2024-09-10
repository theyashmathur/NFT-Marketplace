const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const baseURI = "https://example.com/";
    const contractURI = "https://example.com/";
    const rentingProtocol = "0x25FBdd1dd05a4bb6509bb77E8f02B349DFd8dFbf"

    const NFTBundler = await ethers.getContractFactory("NFTBundler");
    const bundlingProtocol = await upgrades.deployProxy(NFTBundler, [baseURI, contractURI, rentingProtocol], { initializer: 'initializeNFTBundler', kind: 'uups' });
    await bundlingProtocol.deployed();
    
    console.log("NFT Bundling Protocol deployed to:", bundlingProtocol.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });