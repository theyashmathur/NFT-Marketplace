const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
require('dotenv').config();

let NftCollectionFactory;
let nftCollectionFactory;

let NftCollection;
let SFTCollection;

let NFTRenting;
let rentingProtocol;

let NftCollectionV1000;
let NftCollectionFactoryV1000;
let SFTCollectionV1000;

let owner;
let alice;
let bob;
let collectionCreator;
let beneficiary;
let badActor;

let collectionInit;

async function deployNFTCollection() {
    const nftCollectionProxy = await upgrades.deployProxy(NftCollection, collectionInit.toConstructorArgsArray(), {
        initializer: "initialize",
        kind: "uups"
    });

    const implementationAddress = await upgrades.erc1967.getImplementationAddress(nftCollectionProxy.address);
    return {
        NFTCollectionProxy: nftCollectionProxy,
        implementationAddress: implementationAddress
    };
}

async function deploySFTCollection() {
    const sftCollectionProxy = await upgrades.deployProxy(SFTCollection, [
        collectionInit.collectionCreator,
        collectionInit.name,
        collectionInit.symbol,
        collectionInit.baseURI,
        collectionInit.contractUri,
        collectionInit.beneficiary,
        collectionInit.royaltyPercentNominator,
        collectionInit.royaltyPercentDenominator
    ], {
        initializer: "initialize",
        kind: "uups"
    });

    const implementationAddress = await upgrades.erc1967.getImplementationAddress(sftCollectionProxy.address);
    return {
        SFTCollectionProxy: sftCollectionProxy,
        implementationAddress: implementationAddress
    };
}

before(async function () {
    NftCollection = await ethers.getContractFactory("NftCollection");
    SFTCollection = await ethers.getContractFactory("SFTCollection");
    NftCollectionFactory = await ethers.getContractFactory("NftCollectionFactory");

    NFTRenting = await ethers.getContractFactory("NFTRenting");
    rentingProtocol = await upgrades.deployProxy(NFTRenting, { initializer: 'initialize', kind: 'uups' });

    [owner, alice, bob, collectionCreator, beneficiary, badActor] = await ethers.getSigners();

    NftCollectionV1000 = await ethers.getContractFactory("NftCollectionV1000", { signer: collectionCreator });
    SFTCollectionV1000 = await ethers.getContractFactory("SFTCollectionV1000", { signer: collectionCreator });
    NftCollectionFactoryV1000 = await ethers.getContractFactory("NftCollectionFactoryV1000");

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
    };

    console.log("Owner address:", owner.address);
    console.log("ALice address:", alice.address);
    console.log("Bob address:", bob.address);
    console.log("Collection creator address:", collectionCreator.address);
    console.log("Beneficiary address:", beneficiary.address);
    console.log("Bad actor address:", badActor.address);
});

beforeEach(async function () {
    nftCollectionFactory = await upgrades.deployProxy(NftCollectionFactory, [
        owner.address,
        owner.address,
        owner.address
    ], { initializer: "initialize", kind: "uups" });
});

describe("Nft Collection Factory", async function () {
    it("Should allow to upgrade collection factory contract", async function() {
        const proxy = await upgrades.upgradeProxy(nftCollectionFactory.address, NftCollectionFactoryV1000, [
            owner.address,
            owner.address,
            owner.address
        ], { initializer: "initialize", kind: "uups" });

        expect(proxy.address).to.equal(nftCollectionFactory.address);
        expect(await proxy.newstuff()).to.equal("");

        await proxy.setNewStuff("hello, world!");
        expect(await proxy.newstuff()).to.equal("hello, world!");
    });

    it("Should allow to add new nft collection implementation contract", async function() {
        const nftCollection = await deployNFTCollection();

        console.log("NFT Collection proxy address:", nftCollection.NFTCollectionProxy.address);
        console.log("NFT Collection implementation address:", nftCollection.implementationAddress);

        const tx = await nftCollectionFactory.addNftCollectionUpgrade(nftCollection.implementationAddress);

        expect(await nftCollectionFactory.currentNftCollectionImpl()).to.equal(nftCollection.implementationAddress);
        expect(await nftCollectionFactory.NFTCollectionVersion()).to.equal(ethers.BigNumber.from(2));
        expect(await nftCollectionFactory.implToVersion(nftCollection.implementationAddress)).to.equal(ethers.BigNumber.from(1));
        expect(await nftCollectionFactory.versionToImpl(1)).to.equal(nftCollection.implementationAddress);
        expect(await nftCollectionFactory.isImplAvailable(nftCollection.implementationAddress)).to.equal(true);

        expect(tx).to.emit(nftCollectionFactory, "NftCollectionImplementationAdded").withArgs([
            ethers.BigNumber.from(1),
            nftCollection.implementationAddress
        ]);
    });

    it("Should not allow to add new nft collection implementation contract if the caller has no collecion implementation provider role", async function() {
        await expect(nftCollectionFactory.connect(badActor).addNftCollectionUpgrade(ethers.constants.AddressZero)).to.be.revertedWith("Account nas no collection implementation provider role");
    });

    it("Should not allow to add new nft collection implementation contract if provided contract doesn't support erc721", async function() {
        await expect(nftCollectionFactory.addNftCollectionUpgrade(nftCollectionFactory.address)).to.be.revertedWith("Provided contract doesn't support erc721");
    });

    it("Should allow to add new sft collection implementation contract", async function() {
        const sftCollection = await deploySFTCollection();

        console.log("SFT Collection proxy address:", sftCollection.SFTCollectionProxy.address);
        console.log("SFT Collection implementation address:", sftCollection.implementationAddress);

        const tx = await nftCollectionFactory.addSFTCollectionUpgrade(sftCollection.implementationAddress);

        expect(await nftCollectionFactory.currentSFTCollectionImpl()).to.equal(sftCollection.implementationAddress);
        expect(await nftCollectionFactory.SFTCollectionVersion()).to.equal(ethers.BigNumber.from(2));
        expect(await nftCollectionFactory.implToSFTVersion(sftCollection.implementationAddress)).to.equal(ethers.BigNumber.from(1));
        expect(await nftCollectionFactory.SFTversionToImpl(1)).to.equal(sftCollection.implementationAddress);
        expect(await nftCollectionFactory.isImplAvailable(sftCollection.implementationAddress)).to.equal(true);

        expect(tx).to.emit(nftCollectionFactory, "SFTCollectionImplementationAdded").withArgs([
            ethers.BigNumber.from(1),
            sftCollection.implementationAddress
        ]);
    });

    it("Should not allow to add new sft collection implementation contract if the caller has no collecion implementation provider role", async function() {
        await expect(nftCollectionFactory.connect(badActor).addSFTCollectionUpgrade(ethers.constants.AddressZero)).to.be.revertedWith("Account nas no collection implementation provider role");
    });

    it("Should not allow to add new sft collection implementation contract if provided contract doesn't support erc1155", async function() {
        await expect(nftCollectionFactory.addSFTCollectionUpgrade(nftCollectionFactory.address)).to.be.revertedWith("Provided contract doesn't support erc1155");
    });

    it("Should allow to create nft collection", async function() {
        const nftCollection = await deployNFTCollection();
        await nftCollectionFactory.addNftCollectionUpgrade(nftCollection.implementationAddress);

        const data = NftCollection.interface.encodeFunctionData("initialize", collectionInit.toConstructorArgsArray());
        
        const createdCollection = await nftCollectionFactory.callStatic.createNftCollection(data);
        const tx = await nftCollectionFactory.createNftCollection(data);
       
        const collectionCreated = await nftCollectionFactory.createdNftCollections(0);

        expect(collectionCreated).to.equal(createdCollection);
        expect(tx).to.emit(nftCollectionFactory, "NftCollectionCreated").withArgs([ethers.BigNumber.from(0), createdCollection]);
    });

    it("Should allow to create nft collection", async function() {
        const sftCollection = await deploySFTCollection();
        await nftCollectionFactory.addSFTCollectionUpgrade(sftCollection.implementationAddress);

        const data = SFTCollection.interface.encodeFunctionData("initialize", [
            collectionInit.collectionCreator,
            collectionInit.name,
            collectionInit.symbol,
            collectionInit.baseURI,
            collectionInit.contractUri,
            collectionInit.beneficiary,
            collectionInit.royaltyPercentNominator,
            collectionInit.royaltyPercentDenominator    
        ]);
        
        const createdCollection = await nftCollectionFactory.callStatic.createSFTCollection(data);
        const tx = await nftCollectionFactory.createSFTCollection(data);
       
        const collectionCreated = await nftCollectionFactory.createdSFTCollections(0);

        expect(collectionCreated).to.equal(createdCollection);
        expect(tx).to.emit(nftCollectionFactory, "SFTCollectionCreated").withArgs([ethers.BigNumber.from(0), createdCollection]);
    });

    it("Should allow to remove nft collection implementation", async function() {
        const nftCollection = await deployNFTCollection();
        await nftCollectionFactory.addNftCollectionUpgrade(nftCollection.implementationAddress);

        const newNftCollection = await deployNFTCollection();
        await nftCollectionFactory.addNftCollectionUpgrade(newNftCollection.implementationAddress);

        expect(await nftCollectionFactory.currentNftCollectionImpl()).to.equal(newNftCollection.implementationAddress);
        expect(await nftCollectionFactory.NFTCollectionVersion()).to.equal(ethers.BigNumber.from(3));
        expect(await nftCollectionFactory.implToVersion(newNftCollection.implementationAddress)).to.equal(ethers.BigNumber.from(2));
        expect(await nftCollectionFactory.versionToImpl(2)).to.equal(newNftCollection.implementationAddress);
        expect(await nftCollectionFactory.isImplAvailable(newNftCollection.implementationAddress)).to.equal(true);

        await nftCollectionFactory.removeNftCollectionUpgrade(1);
        expect(await nftCollectionFactory.isImplAvailable(newNftCollection.implementationAddress)).to.equal(false);
    });

    it("Should not allow to remove nft collection implementation if the caller has no implementation provider role", async function() {
        await expect(nftCollectionFactory.connect(badActor).removeNftCollectionUpgrade(1)).to.be.revertedWith("Account nas no collection implementation provider role");
    });

    it("Should not allow to remove current nft collection implementation", async function() {
        const nftCollection = await deployNFTCollection();
        await nftCollectionFactory.addNftCollectionUpgrade(nftCollection.implementationAddress);

        await expect(nftCollectionFactory.removeNftCollectionUpgrade(1)).to.be.revertedWith("Cannot remove current nft collection implementation version");
    });

    it("Should not allow to remove nft collection implementation if the provided version does non exist", async function() {
        await expect(nftCollectionFactory.removeNftCollectionUpgrade(15)).to.be.revertedWith("There is no such version");
    })

    it("Should allow to remove sft collection implementation", async function() {
        const sftCollection = await deploySFTCollection();
        await nftCollectionFactory.addSFTCollectionUpgrade(sftCollection.implementationAddress);

        const newSFTCollection = await deploySFTCollection();
        await nftCollectionFactory.addSFTCollectionUpgrade(newSFTCollection.implementationAddress);

        expect(await nftCollectionFactory.currentSFTCollectionImpl()).to.equal(newSFTCollection.implementationAddress);
        expect(await nftCollectionFactory.SFTCollectionVersion()).to.equal(ethers.BigNumber.from(3));
        expect(await nftCollectionFactory.implToSFTVersion(newSFTCollection.implementationAddress)).to.equal(ethers.BigNumber.from(2));
        expect(await nftCollectionFactory.SFTversionToImpl(2)).to.equal(newSFTCollection.implementationAddress);
        expect(await nftCollectionFactory.isImplAvailable(newSFTCollection.implementationAddress)).to.equal(true);

        await nftCollectionFactory.removeSFTCollectionUpgrade(1);
        expect(await nftCollectionFactory.isImplAvailable(newSFTCollection.implementationAddress)).to.equal(false);
    });

    it("Should not allow to remove sft collection implementation if the caller has no implementation provider role", async function() {
        await expect(nftCollectionFactory.connect(badActor).removeSFTCollectionUpgrade(1)).to.be.revertedWith("Account nas no collection implementation provider role");
    });

    it("Should not allow to remove current sft collection implementation", async function() {
        const sftCollection = await deploySFTCollection();
        await nftCollectionFactory.addSFTCollectionUpgrade(sftCollection.implementationAddress);

        await expect(nftCollectionFactory.removeSFTCollectionUpgrade(1)).to.be.revertedWith("Cannot remove current SFT collection implementation version");
    });

    it("Should not allow to remove sft collection implementation if the provided version does non exist", async function() {
        await expect(nftCollectionFactory.removeSFTCollectionUpgrade(15)).to.be.revertedWith("There is no such version");
    });

});
