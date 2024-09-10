const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function getAccount(idx = 0) {
    const accounts = await hre.ethers.getSigners();
    return accounts[idx];
}

function print(...args) {
    console.log(...args);
}


const DOMAIN_NAME = "NFTSpace NFT Renting Protocol";
const DOMAIN_VERSION = "0.0.3";

const rentalPeriod = 5;
const minimumDays = 3;
const maximumDays = 7;
const SECONDS_IN_DAY = 86400;
const tokenId = 10;
const dailyPrice = ethers.BigNumber.from(1);
const totalPrice = dailyPrice * rentalPeriod;

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

var NftCollection = {}
var NFTRenting = {}
var rentingProtocol = {};
var SettlementToken = {}
var collectionInit = {};

var alice = {};
var bob = {};
var collectionCreator = {};
var beneficiary = {};
var badActor = {};
var collectionInit = {};

var rentListingExpiry = {};

async function deployNftCollection(collection) {
    const nftCollectionProxy = await upgrades.deployProxy(NftCollection, [
        collection.collectionCreator,
        collection.name,
        collection.symbol,
        collection.baseURI,
        collection.contractUri,
        collection.beneficiary,
        collection.royaltyPercentNominator,
        collection.royaltyPercentDenominator,
        collection.rentingProtocolAddress,
    ], { initializer: 'initialize', kind: 'uups' });
    return nftCollectionProxy;
}

async function deploySettlementToken() {
    const settlementToken = await SettlementToken.deploy();
    await settlementToken.deployed();

    return settlementToken;
}

before(async function() {
    NftCollection = await ethers.getContractFactory("NftCollection");
    SettlementToken = await ethers.getContractFactory("SettlementToken");
    NFTRenting = await ethers.getContractFactory("NFTRenting");
    rentingProtocol = await upgrades.deployProxy(NFTRenting, { initializer: 'initialize', kind: 'uups' });

    accountCount = 0;
    collectionCreator = await getAccount(accountCount++);
    beneficiary = await getAccount(accountCount++);
    admin = await getAccount(accountCount++);
    upgrader = await getAccount(accountCount++);
    badActor = await getAccount(accountCount++);
    alice = await getAccount(accountCount++);
    bob = await getAccount(accountCount++);

    print("Total accounts generated: " + accountCount);
    print("Collection Creator: " + collectionCreator.address);
    print("Beneficiary Creator: " + beneficiary.address);
    print("Admin Creator: " + admin.address);
    print("Upgrader Creator: " + upgrader.address);
    print("Bad Actor Creator: " + badActor.address);
    print("Alice Creator: " + alice.address);
    print("Bob Creator: " + bob.address);

})

beforeEach(async function () {
    collectionInit = {
        collectionCreator: collectionCreator.address,
        name: "ex-ex-ex",
        symbol: "XXX",
        baseURI: "ipfs://xxx/",
        contractUri: "ipfs://yyy/",
        beneficiary: beneficiary.address,
        royaltyPercentNominator: 1,
        royaltyPercentDenominator: 100,
        rentingProtocolAddress: rentingProtocol.address,
        admin: admin.address,
        upgrader: upgrader.address,
        toConstructorArgsArray: function () {
            return [
                this.collectionCreator,
                this.name,
                this.symbol,
                this.baseURI,
                this.contractUri,
                this.beneficiary,
                this.royaltyPercentNominator,
                this.royaltyPercentDenominator,
                this.rentingProtocolAddress
            ]
        }
    }

    rentListingExpiry = ((await ethers.provider.getBlock('latest')).timestamp) + (3 * SECONDS_IN_DAY);
})

describe("NFT Renting Protocol", async function() {
    it("Should upgrade", async function() {
        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        const newRenting = await upgrades.upgradeProxy(rentingProtocol.address, NFTRenting, { initializer: 'initialize', kind: 'uups' });

        expect(newRenting.address).to.equal(rentingProtocol.address);
    });

    it("Renting protocol must have a ren operator role", async function() {
        const nftCollection = await deployNftCollection(collectionInit);

        const rentingOperatorRole = await nftCollection.RENTING_OPERATOR_ROLE();
        expect(await nftCollection.hasRole(rentingOperatorRole, rentingProtocol.address)).to.equal(true);
    });

    it("Should allow fee manager to set the fee", async function() {
        const numerator = ethers.BigNumber.from(1);
        const denominator = ethers.BigNumber.from(4);

        await rentingProtocol.setProtocolFeeCustom(numerator, denominator);
    });

    it("Should not allow non-fee-manager to set the fees", async function() {
        const numerator = ethers.BigNumber.from(1);
        const denominator = ethers.BigNumber.from(4);

        await expect(rentingProtocol.connect(badActor).setProtocolFeeCustom(numerator, denominator)).to.be.revertedWith("Caller has no fee manager role");
    });

    it("Should not allow zero denominator fees", async function() {
        const numerator = ethers.BigNumber.from(1);
        const denominator = ethers.BigNumber.from(0);

        await expect(rentingProtocol.setProtocolFeeCustom(numerator, denominator)).to.be.revertedWith("Denominator cannot be 0");
    });

    it("Should not allow fees with a numerator greater than half the denominator", async function() {
        const numerator = ethers.BigNumber.from(3);
        const denominator = ethers.BigNumber.from(4);

        await expect(rentingProtocol.setProtocolFeeCustom(numerator, denominator)).to.be.revertedWith("Numerator must not be more than half the value of denominator");
    });

    it("Should allow fee manager to set fee in basis points", async function() {
        const bps = ethers.BigNumber.from(3000);

        await rentingProtocol.setProtocolFeeBasisPoints(bps);
    });

    it("Should not allow non-fee-manager to set fee in basis points", async function() {
        const bps = ethers.BigNumber.from(3000);

        await expect(rentingProtocol.connect(badActor).setProtocolFeeBasisPoints(bps)).to.be.revertedWith("Caller has no fee manager role");
    });

    it("Should not allow to set the fees with basis points greater than 5000", async function() {
        const bps = ethers.BigNumber.from(6000);

        await expect(rentingProtocol.setProtocolFeeBasisPoints(bps)).to.be.revertedWith("Protocol fee cannot be more than 5000 basis points");
    });

    it("Should allow fee manager to set the fee receiver", async function() {
        await rentingProtocol.setProtocolFeeReceiver(alice.address);
    });

    it("Should not allow non-fee-manager to set the fee receiver", async function() {
        await expect(rentingProtocol.connect(badActor).setProtocolFeeReceiver(alice.address)).to.be.revertedWith("Caller has no fee manager role");
    });

    it("Should allow to rent NFTs using the rentWithSig function", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);
        
        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            nonce: ethers.BigNumber.from(0),
            rentListingExpiry: rentListingExpiry,
            signature: signature,
        };
        await rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature);

        await collectionCreator.sendTransaction(txTo);

        const rentReturnTimestamp = ((await ethers.provider.getBlock('latest')).timestamp) + (rentalPeriod * SECONDS_IN_DAY);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(alice.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.rentTime(tokenId)).to.within(rentReturnTimestamp - 1, rentReturnTimestamp + 1);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);
    });

    it("Should not allow to rent NFT if signature is expiered", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            nonce: ethers.BigNumber.from(0),
            rentListingExpiry: rentListingExpiry,
            signature: signature,
        };

        await time.increaseTo(rentListingExpiry + 1);
        await expect(rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature)).to.be.revertedWith("Signature is expired");
    })

    it("Should not allow to rent NFTs using the rentWithSig function with wrong NFT colection contract", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: ethers.constants.AddressZero,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: ethers.constants.AddressZero,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };

        await expect(rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature)).to.be.revertedWith("invalid token contract address");
    });

    it("Should not allow to rent non-ERC721 token", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: settlementToken.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: settlementToken.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };

        await expect(rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature)).to.be.reverted;
    });

    it("Should not allow to rent NFT that is already rented", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };
        await rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature);

        await collectionCreator.sendTransaction(txTo);

        const rentReturnTimestamp = ((await ethers.provider.getBlock('latest')).timestamp) + (rentalPeriod * SECONDS_IN_DAY);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(alice.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.ownerOf(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.rentTime(tokenId)).to.within(rentReturnTimestamp - 1, rentReturnTimestamp + 1);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);

        const signature2 = await bob._signTypedData(domain, type, value);
        const rentListingSignature2 = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature2,
        };

        await expect(rentingProtocol.connect(bob).rentWithSig(rentalPeriod, rentListingSignature2)).to.be.revertedWith("This NFT is already in an active rent session");
    });

    it("Should not allow to rent your own NFT", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);
        
        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };

        await expect(rentingProtocol.connect(alice).rentWithSig(rentalPeriod, rentListingSignature)).to.be.revertedWith("user is already the owner of this NFT");
    });

    it("Should not allow to rent NFT if the message signer is not the owner of the token", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
        };

        const signature = await collectionCreator._signTypedData(domain, type, value);
        const rentListingSignature = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };

        await expect(rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature)).to.be.revertedWith(`originalOwnerMismatch("${alice.address}", "${collectionCreator.address}")`);
    });

    it("Should not allow to rent if the Renting Protocol doesn't have an approval to transfer settlement tokens", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };

        await expect(rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature)).to.be.revertedWith("rental protocol is not approved to spend user's tokens");
    });

    it("Should allow paying rent with ether", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };
        await rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature, {value: ethers.utils.parseEther((totalPrice).toString())});

        await collectionCreator.sendTransaction(txTo);

        const rentReturnTimestamp = ((await ethers.provider.getBlock('latest')).timestamp) + (rentalPeriod * SECONDS_IN_DAY);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(alice.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.rentTime(tokenId)).to.within(rentReturnTimestamp - 1, rentReturnTimestamp + 1);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);
    });

    it("Should not allow rent NFT if there is not enough ETH", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };

        await expect(rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature)).to.be.revertedWith("not enough funds");
    });

    it("Should allow to return rented NFT", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };
        await rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature);

        await collectionCreator.sendTransaction(txTo);

        const rentReturnTimestamp = ((await ethers.provider.getBlock('latest')).timestamp) + (rentalPeriod * SECONDS_IN_DAY);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(alice.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.rentTime(tokenId)).to.within(rentReturnTimestamp - 1, rentReturnTimestamp + 1);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);

        await time.increaseTo(rentReturnTimestamp + 1);
        await rentingProtocol.returnNFT(nftCollection.address, tokenId);
    });

    it("Should not allow to return rented NFT if the rental time has not yet expired", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        };
        await rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature);

        await collectionCreator.sendTransaction(txTo);

        const rentReturnTimestamp = ((await ethers.provider.getBlock('latest')).timestamp) + (rentalPeriod * SECONDS_IN_DAY);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(alice.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.rentTime(tokenId)).to.within(rentReturnTimestamp - 1, rentReturnTimestamp + 1);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);

        await expect(rentingProtocol.returnNFT(nftCollection.address, tokenId)).to.be.revertedWith("Rent time has not expired yet");
    });

    it("Should not allow to return non-rented NFT", async function() {
        const nftCollection = await deployNftCollection(collectionInit);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await expect(rentingProtocol.returnNFT(nftCollection.address, tokenId)).to.be.revertedWith("No active rent for this NFT");
    });

    it("Should allow signer to cancel their signed message", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);

        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        }

        await rentingProtocol.connect(alice).cancelRentSig(rentListingSignature);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        const sigHash = ethers.utils.keccak256(signature);

        expect(await rentingProtocol.getCanceledSig(sigHash)).to.equal(true);
    });

    it("Should not allow non-token-owner to cancel a rent signature", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);

        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        }

        await expect(rentingProtocol.cancelRentSig(rentListingSignature)).to.be.revertedWith("only original owner can cancel a rent signature");
    });

    it("Should not allow the same signature to be canceled twice", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);

        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        }

        await rentingProtocol.connect(alice).cancelRentSig(rentListingSignature);
        const sigHash = ethers.utils.keccak256(signature);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        expect(await rentingProtocol.getCanceledSig(sigHash)).to.equal(true);
        await expect(rentingProtocol.connect(alice).cancelRentSig(rentListingSignature)).to.be.revertedWith("signature was cancelled already");
    });

    it("Should not allow non-signer to cancel the rent signature", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);

        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
        };

        const signature = await collectionCreator._signTypedData(domain, type, value);
        const rentListingSignature = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        }

        await expect(rentingProtocol.connect(alice).cancelRentSig(rentListingSignature)).to.be.revertedWith(`originalOwnerMismatch("${alice.address}", "${collectionCreator.address}")`);
    });

    it("Should not allow to rent NFT if the signature was canceled", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);

        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            rentListingExpiry: rentListingExpiry,
            nonce: ethers.BigNumber.from(0),
            signature: signature,
        }

        await rentingProtocol.connect(alice).cancelRentSig(rentListingSignature);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        const sigHash = ethers.utils.keccak256(signature);
        expect(await rentingProtocol.getCanceledSig(sigHash)).to.equal(true);

        await expect(rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature)).to.be.revertedWith("singature was cancelled");
    });

    it("Should not allow to transfer (sell) NFT if its rented", async function() {
        const nftCollection = await deployNftCollection(collectionInit);
        const settlementToken = await deploySettlementToken();
        await rentingProtocol.setProtocolFeeBasisPoints(1000);

        const default_admin_role = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(default_admin_role, alice.address);
        
        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await collectionCreator.sendTransaction(txTo);

        await nftCollection.connect(alice).mint(tokenId);

        await collectionCreator.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(alice.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        await settlementToken.approve(rentingProtocol.address, totalPrice);

        await collectionCreator.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await settlementToken.allowance(collectionCreator.address, rentingProtocol.address))).to.equal(totalPrice);

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = getDomain(chainId, rentingProtocol.address);
        
        const value = {
            originalOwner: alice.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
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
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            dailyPrice: dailyPrice,
            prematureReturnAllowed: false,
            minimumDays: minimumDays,
            maximumDays: maximumDays,
            multipleRentSessionsAllowed: false,
            nonce: ethers.BigNumber.from(0),
            rentListingExpiry: rentListingExpiry,
            signature: signature,
        };
        await rentingProtocol.rentWithSig(rentalPeriod, rentListingSignature);

        await collectionCreator.sendTransaction(txTo);

        const rentReturnTimestamp = ((await ethers.provider.getBlock('latest')).timestamp) + (rentalPeriod * SECONDS_IN_DAY);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(alice.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.rentTime(tokenId)).to.within(rentReturnTimestamp - 1, rentReturnTimestamp + 1);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);

        await nftCollection.approve(bob.address, tokenId);

        await collectionCreator.sendTransaction(txTo);

        await expect (nftCollection.connect(bob).transferFrom(collectionCreator.address, badActor.address, tokenId)).to.be.revertedWith("NFT is currently rented by a user.");
    });
})