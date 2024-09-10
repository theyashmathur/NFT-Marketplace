const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const DOMAIN_NAME = "NFTSpace NFT Renting Protocol";
const DOMAIN_VERSION = "0.0.3";

function getDomain(chainId, contractAddress) {
    return {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: chainId,
        verifyingContract: contractAddress
    }
};

const type = {
    rentBySig: [
        { name: "originalOwner", type: "address" },
        { name: "tokenContract", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "dailyPrice", type: "uint256" },
        { name: "prematureReturnAllowed", type: "bool" },
        { name: "minimumDays", type: "uint256" },
        { name: "maximumDays", type: "uint256" },
        { name: "multipleRentSessionsAllowed", type: "bool" },
        { name: "rentListingExpiry", type: "uint256" },
        { name: "nonce", type: "uint256" },
    ],
};

let rentingProtocol;
let nftBundler;

let owner;
let alice;
let bob;
let beneficiary;
let badActor;

async function deployNFTCollection(creator, name, symbol) {
    const NFTCollection = await ethers.getContractFactory("NftCollection");

    const nftCollection = await upgrades.deployProxy(NFTCollection, [
        creator.address,
        name,
        symbol,
        "ipfs://xxx/",
        "ipfs://yyy/",
        beneficiary.address,
        1,
        100,
        rentingProtocol.address
    ], { initializer: "initialize", kind: "uups" });

    return nftCollection;
}

async function deployERC1155() {
    const ERC1155 = await ethers.getContractFactory("ERC1155ForTests");
    const erc1155 = await ERC1155.deploy();
    await erc1155.deployed();

    return erc1155;
}

before(async function() {
    [owner, alice, bob, beneficiary, badActor] = await ethers.getSigners();

    const RentingProtocol = await ethers.getContractFactory("NFTRenting");
    rentingProtocol = await upgrades.deployProxy(RentingProtocol, { initializer: 'initialize', kind: 'uups' });

    console.log("owner address:", owner.address);
    console.log("Alice address:", alice.address);
    console.log("Bob address:", bob.address);
    console.log("Beneficiary address:", beneficiary.address);
    console.log("Bad actor address:", badActor.address);
    console.log("Renting Protocol address:", rentingProtocol.address);
});

beforeEach(async function() {
    const NFTBundler = await ethers.getContractFactory("NFTBundler");
    nftBundler = await upgrades.deployProxy(NFTBundler, [
        "ipfs://xxx/",
        "ipfs://yyy/",
        rentingProtocol.address
    ], { initializer: "initializeNFTBundler", kind: "uups" });
});

describe("NFT Bundler", async function() {
    it("Should allow to wrap ERC721 token", async function() {
        const collection = await deployNFTCollection(alice, "NFT Collection", "NFTC");
        
        const tokenId = 10;
        await collection.connect(alice).mint(tokenId);
        await collection.connect(alice).approve(nftBundler.address, tokenId);
    
        const tokenContracts = [collection.address];
        const tokenIds = [tokenId];
        const amounts = [1];
    
        const wrappedTokenId = await nftBundler.tokenId();
        const tx = await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
    
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        
        expect(await collection.ownerOf(tokenId)).to.equal(nftBundler.address);
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(alice.address);
    
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creator).to.equal(alice.address);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creationDate).to.equal(blockTimestamp);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).burnDate).to.equal(0);
    
        await expect(tx).to.emit(nftBundler, "BundleToken");
        await expect(tx).to.emit(nftBundler, "BundleTokenMetadata");
    });
    
    it("Should allow to wrap ERC721 tokens from one collection", async function() {
        const collection = await deployNFTCollection(alice, "NFT Collection", "NFTC");
        
        let tokenIds = [];
        for (let tokenId = 0; tokenId < 10; ++tokenId) {
            tokenIds[tokenId] = tokenId;
    
            await collection.connect(alice).mint(tokenId);
            await collection.connect(alice).approve(nftBundler.address, tokenId);    
        }
    
        const tokenContracts = new Array(10).fill(collection.address);
        const amounts = new Array(10).fill(1);
    
        const wrappedTokenId = await nftBundler.tokenId();
        const tx = await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
    
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
            
        for (const tokenId of tokenIds) {
            expect(await collection.ownerOf(tokenId)).to.equal(nftBundler.address);
        }
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(alice.address);
    
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creator).to.equal(alice.address);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creationDate).to.equal(blockTimestamp);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).burnDate).to.equal(0);
    
        await expect(tx).to.emit(nftBundler, "BundleToken");
        await expect(tx).to.emit(nftBundler, "BundleTokenMetadata");
    });
    
    it("Should allow to wrap ERC721 tokens from different collections", async function() {
        const tokenId = 10;
        let tokenContracts = [];
        let collections = [];
    
        for (let i = 0; i < 10; ++i) {
            const collection = await deployNFTCollection(alice, "NFT Collection", "NFTC");
    
            tokenContracts[i] =  collection.address;
            collections[i] = collection;
    
            await collection.connect(alice).mint(tokenId);
            await collection.connect(alice).approve(nftBundler.address, tokenId);
        }
    
        const amounts = new Array(10).fill(1);
        let tokenIds = new Array(10).fill(tokenId);
    
        const wrappedTokenId = await nftBundler.tokenId();
        const tx = await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
    
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
            
        for (const collection of collections) {
            expect(await collection.ownerOf(tokenId)).to.equal(nftBundler.address);
        }
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(alice.address);
    
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creator).to.equal(alice.address);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creationDate).to.equal(blockTimestamp);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).burnDate).to.equal(0);
    
        await expect(tx).to.emit(nftBundler, "BundleToken");
        await expect(tx).to.emit(nftBundler, "BundleTokenMetadata");
    });
    
    it("Should allow to wrap wrapped token", async function() {
        const collection = await deployNFTCollection(alice, "NFT Collection", "NFTC");
        
        let tokenId = 10;
        await collection.connect(alice).mint(tokenId);
        await collection.connect(alice).approve(nftBundler.address, tokenId);
    
        const tokenContracts = [collection.address];
        const tokenIds = [tokenId];
        const amounts = [1];
    
        const wrappedTokenId = await nftBundler.tokenId();
        await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
    
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
    
        expect(await collection.ownerOf(tokenId)).to.equal(nftBundler.address);
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(alice.address);
    
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creator).to.equal(alice.address);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creationDate).to.equal(blockTimestamp);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).burnDate).to.equal(0);
    
        await nftBundler.connect(alice).approve(nftBundler.address, wrappedTokenId);
        const newWrappedTokenId = await nftBundler.tokenId();
        await nftBundler.connect(alice).createWrappedToken([nftBundler.address], [wrappedTokenId], amounts);
    
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(nftBundler.address);
        expect(await nftBundler.ownerOf(newWrappedTokenId)).to.equal(alice.address);
    });
    
    it("Should allow to wrap ERC1155 tokens from one collection", async function() {
        const collection = await deployERC1155();
    
        const tokenId = 10;
        const amount = 10;
    
        await collection.mint(alice.address, tokenId, amount);
        await collection.connect(alice).setApprovalForAll(nftBundler.address, true);
    
        const tokenContracts = [collection.address];
        const tokenIds = [tokenId];
        const amounts = [amount];
    
        const wrappedTokenId = await nftBundler.tokenId();
        const tx = await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
    
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
    
        expect(await collection.balanceOf(nftBundler.address, tokenId)).to.equal(amount);
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(alice.address);
    
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creator).to.equal(alice.address);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creationDate).to.equal(blockTimestamp);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).burnDate).to.equal(0);
    
        await expect(tx).to.emit(nftBundler, "BundleToken");
        await expect(tx).to.emit(nftBundler, "BundleTokenMetadata");
    });
    
    it("Should allow to wrap ERC1155 tokens from different collections", async function() {
        const tokenId = 10;
        const amount = 10;
        let tokenContracts = [];
        let collections = [];
    
        for (let i = 0; i < 10; ++i) {
            const collection = await deployERC1155();
    
            tokenContracts[i] =  collection.address;
            collections[i] = collection;
    
            await collection.mint(alice.address, tokenId, amount);
            await collection.connect(alice).setApprovalForAll(nftBundler.address, true);
        }
    
        const amounts = new Array(10).fill(amount);
        const tokenIds = new Array(10).fill(tokenId);
    
        const wrappedTokenId = await nftBundler.tokenId();
        const tx = await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
    
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
            
        for (const collection of collections) {
            expect(await collection.balanceOf(nftBundler.address, tokenId)).to.equal(amount);
        }
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(alice.address);
    
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creator).to.equal(alice.address);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creationDate).to.equal(blockTimestamp);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).burnDate).to.equal(0);
    
        await expect(tx).to.emit(nftBundler, "BundleToken");
        await expect(tx).to.emit(nftBundler, "BundleTokenMetadata");
    });
    
    it("Should allow to wrap ERC721 and ERC1155 tokens together", async function() {
        const ERC721Collection = await deployNFTCollection(alice, "NFT Collection", "NFTC");
        const ERC1155collections = await deployERC1155();
        
        const tokenId = 10;
        const amount = 10;
    
        await ERC721Collection.connect(alice).mint(tokenId);
        await ERC721Collection.connect(alice).approve(nftBundler.address, tokenId);
    
        await ERC1155collections.mint(alice.address, tokenId, amount);
        await ERC1155collections.connect(alice).setApprovalForAll(nftBundler.address, true);
    
        const tokenContracts = [ERC721Collection.address, ERC1155collections.address];
        const tokenIds = [tokenId, tokenId];
        const amounts = [1, amount];
    
        const wrappedTokenId = await nftBundler.tokenId();
        const tx = await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
    
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        
        expect(await ERC721Collection.ownerOf(tokenId)).to.equal(nftBundler.address);
        expect(await ERC1155collections.balanceOf(nftBundler.address, tokenId)).to.equal(amount);
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(alice.address);
    
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creator).to.equal(alice.address);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).creationDate).to.equal(blockTimestamp);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).burnDate).to.equal(0);
    
        await expect(tx).to.emit(nftBundler, "BundleToken");
        await expect(tx).to.emit(nftBundler, "BundleTokenMetadata");
    });
    
    it("Should allow bundling to be paused", async function() {
        await nftBundler.setIsBundling(true);
    
        expect(await nftBundler.isBundlingPaused()).to.equal(true);
    });
    
    it("Should not allow bundling to be paused if the caller has no the pauser role", async function() {
        await expect(nftBundler.connect(badActor).setIsBundling(true)).to.be.reverted;
    });
    
    it("Should not allow to wrap tokens if bundling is paused", async function() {
        await nftBundler.setIsBundling(true);
    
        await expect(nftBundler.connect(alice).createWrappedToken([], [], [])).to.be.revertedWith("Bundling of NFTs has been paused by the admin.");
    });
    
    it("Should not allow to wrap tokens if the provided arrays have different sizes", async function() {
        await expect(nftBundler.connect(alice).createWrappedToken([], [1], [])).to.be.revertedWith("The arrays provided have different sizes");
    });
    
    it("Should not allow to wrap tokens if the provided contract is not a token contract", async function() {
        await expect(nftBundler.connect(alice).createWrappedToken([rentingProtocol.address], [1], [1])).to.be.revertedWith("provided address doesn't support token interfaces");
    });
    
    it("Should allow to unwrap wrapped tokens", async function() {
        const collection = await deployNFTCollection(alice, "NFT Collection", "NFTC");
        
        const tokenId = 10;
        await collection.connect(alice).mint(tokenId);
        await collection.connect(alice).approve(nftBundler.address, tokenId);
    
        const tokenContracts = [collection.address];
        const tokenIds = [tokenId];
        const amounts = [1];
    
        const wrappedTokenId = await nftBundler.tokenId();
        await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
        
        expect(await collection.ownerOf(tokenId)).to.equal(nftBundler.address);
        expect(await nftBundler.ownerOf(wrappedTokenId)).to.equal(alice.address);
    
        await nftBundler.connect(alice).approve(nftBundler.address, wrappedTokenId);
        const tx = await nftBundler.connect(alice).unbundleWrappedToken(wrappedTokenId);
    
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
    
        expect(await collection.ownerOf(tokenId)).to.equal(alice.address);
        expect((await nftBundler.getBundledToken(wrappedTokenId)).burnDate).to.equal(blockTimestamp);
        
        await expect(tx).to.emit(nftBundler, "UnbundleToken");
        await expect(tx).to.emit(nftBundler, "UnbundleTokenMetadata");
    });
    
    it("Shoudl allow unbundling to be paused", async function() {
        await nftBundler.setIsUnbundling(true);
    
        expect(await nftBundler.isUnbundlingPaused()).to.equal(true);
    });
    
    it("Should not allow unbundling to be paused if the caller has no the pauser role", async function() {
        await expect(nftBundler.connect(badActor).setIsUnbundling(true)).to.be.reverted;
    });
    
    it("Should not allow to unwrap tokens if unbundling is paused", async function() {
        await nftBundler.setIsUnbundling(true);
    
        await expect(nftBundler.connect(alice).unbundleWrappedToken(0)).to.be.revertedWith("Unbundling of NFTs has been paused by the admin.");
    });
    
    it("Should not allow to unwrap tokens if the caller is not the tokens owner", async function() {
        const collection = await deployNFTCollection(alice, "NFT Collection", "NFTC");
        
        const tokenId = 10;
        await collection.connect(alice).mint(tokenId);
        await collection.connect(alice).approve(nftBundler.address, tokenId);
    
        const tokenContracts = [collection.address];
        const tokenIds = [tokenId];
        const amounts = [1];
    
        const wrappedTokenId = await nftBundler.tokenId();
        await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);
    
        await expect(nftBundler.connect(badActor).unbundleWrappedToken(wrappedTokenId)).to.be.revertedWith("Only owner can unbundle a token.");
    });

    it("Should allow to rent wrapped token", async function() {
        const collection = await deployNFTCollection(alice, "NFT Collection", "NFTC");
        
        const tokenId = 10;
        const rentalPeriod = 5;
        const minimumDays = 3;
        const maximumDays = 7;
        const SECONDS_IN_DAY = 86400;
        const rentListingExpiry = ((await ethers.provider.getBlock('latest')).timestamp) + (3 * SECONDS_IN_DAY);
        const dailyPrice = ethers.utils.parseEther("1");
        const totalPrice = dailyPrice * rentalPeriod;

        await collection.connect(alice).mint(tokenId);
        await collection.connect(alice).approve(nftBundler.address, tokenId);
    
        const tokenContracts = [collection.address];
        const tokenIds = [tokenId];
        const amounts = [1];
    
        const wrappedTokenId = await nftBundler.tokenId();
        await nftBundler.connect(alice).createWrappedToken(tokenContracts, tokenIds, amounts);

        const rentingOperatorRole = await nftBundler.RENTING_OPERATOR_ROLE();
        await nftBundler.grantRole(rentingOperatorRole, rentingProtocol.address);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);

        const value = {
            originalOwner: alice.address,
            tokenContract: nftBundler.address,
            tokenId: wrappedTokenId,
            settlementToken: ethers.constants.AddressZero,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
        };

        const signature = await alice._signTypedData(domain, type, value);
        const rentListingSignature = {
            originalOwner: alice.address,
            tokenContract: nftBundler.address,
            tokenId: wrappedTokenId,
            settlementToken: ethers.constants.AddressZero,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            nonce: ethers.BigNumber.from(0),
            rentListingExpiry: rentListingExpiry,
            signature: signature,
        };

        await rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature, { value: totalPrice.toString() });
        const rentReturnTimestamp = ((await ethers.provider.getBlock('latest')).timestamp) + (rentalPeriod * SECONDS_IN_DAY);

        expect(await nftBundler.originalOwners(wrappedTokenId)).to.equal(alice.address);
        expect(await nftBundler.temporaryOwner(wrappedTokenId)).to.equal(owner.address);
        expect(await nftBundler.rentTime(wrappedTokenId)).to.equal(rentReturnTimestamp);
    });
});