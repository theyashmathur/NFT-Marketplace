const { ethers } = require('hardhat');

async function main() {
    const [seller, buyer] = await ethers.getSigners();

    console.log(seller.address, buyer);

    
}

main();
