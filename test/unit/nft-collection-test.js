const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DOMAIN_NAME = "ex-ex-ex";
const DOMAIN_VERSION = "0.0.1";

function getDomain(chainId, contractAddress) {
    return {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: chainId,
        verifyingContract: contractAddress
    }
};

const types = {
    SignedMint: [
        { name: "from", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "nonce", type: "uint256" },
    ]
};

const OWNABLE_REVERT_NOT_THE_OWNER = "Ownable: caller is not the owner";
const ERC721_REVERT_TOKEN_ALREADY_MINTED = "ERC721: token already minted";

const RBAC_REVERT_ACCOUNT_MISSING_ROLE_REGEX = /AccessControl: account 0x[0-9a-fA-F]{40} is missing role 0x[0-9a-fA-F]{64}/
const RBAC_REVERT_ACCOUNT_NOT_ADMIN = "Account has no admin role";
const REVERT_OVERFLOW_OR_UNDERFLOW = "panic code 17"
const ERC721_REVERT_TRANSFER_CALLER_NOT_OWNER = "ERC721: caller is not token owner nor approved"

const REVERT_METADATA_FROZEN = "Metadata frozen";
const REVERT_METADATA_ALREADY_FROZEN = "Metadata already frozen";
const REVERT_ROYALITIES_LIMIT = "Royalties must be up to 50%";
const REVERT_TOKEN_ID_DOES_NOT_EXIST = "Token id does not exist";
const REVERT_IMPLEMENTATION_DOES_NOT_EXIST = "Implementation does not exist";

let NftCollectionFactory;
let NftCollection;

let NFTRenting;
let rentingProtocol;

let NftHolder;
let NftCollectionV1000;
let NftCollectionV2000;

let alice;
let bob;
let collectionCreator;
let beneficiary;
let badActor;
let collectionInit;

async function deployNftHolder() {
    const nftHolder = await NftHolder.deploy();
    await nftHolder.deployed();
    return nftHolder
}

async function deployNftCollectionFactory(deployImpl = true) {
    const admin = deployer
    const upgrader = deployer
    const collection_implementation_provider = deployer
    const nftCollectionFactoryProxy = await upgrades.deployProxy(NftCollectionFactory, [admin.address, upgrader.address, collection_implementation_provider.address], { initializer: 'initialize', kind: 'uups' });
    await nftCollectionFactoryProxy.deployed()

    if (deployImpl) {
        const nftCollectionImpl = await NftCollection.deploy();
        await nftCollectionImpl.deployed();
        await nftCollectionFactoryProxy.addNftCollectionUpgrade(nftCollectionImpl.address);
    }
    return nftCollectionFactoryProxy;
}

async function nftCollectionFromAddress(address) {
    const nftCollection = await ethers.getContractAt("NftCollection", address);
    return nftCollection;
}

async function deployNftCollection(collection) {
    nftCollectionProxy = await upgrades.deployProxy(NftCollection, [
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

async function signLazyMint(from, tokenId, nonce, signer) {
    const message = {
        from: from,
        tokenId: tokenId,
        nonce: nonce
    }

    const chainId = await web3.eth.getChainId();
    const domain = getDomain(chainId, nftCollection.address);
    const signature = await signer._signTypedData(domain, types, message);
    return signature;
}

function packLazyMint(from, tokenId, nonce, signature) {
    return web3.eth.abi.encodeParameters(
        ['address', 'uint256', 'uint256', 'bytes memory'],
        [from, tokenId, nonce, signature]
    );
}

async function packAndSignMint(from, newTokenId, nonce, signer) {
    let signature = await signLazyMint(from, newTokenId, nonce, signer);
    let data = packLazyMint(from, newTokenId, nonce, signature);
    return { data, signature }
}

before(async function () {
    NftCollection = await ethers.getContractFactory("NftCollection");
    NftCollectionFactory = await ethers.getContractFactory("NftCollectionFactory");
    NFTRenting = await ethers.getContractFactory("NFTRenting");
    rentingProtocol = await upgrades.deployProxy(NFTRenting, { initializer: 'initialize', kind: 'uups' });

    // Test Contracts
    NftHolder = await ethers.getContractFactory("NftHolder");
    NftCollectionV1000 = await ethers.getContractFactory("NftCollectionV1000");
    NftCollectionV2000 = await ethers.getContractFactory("NftCollectionV2000");
    NftCollectionFactoryV1000 = await ethers.getContractFactory("NftCollectionFactoryV1000");

    [deployer, collectionCreator, beneficiary, admin, upgrader, badActor, alice, bob] = await ethers.getSigners();

    console.log("Collection creator:", collectionCreator.address);
    console.log("Beneficiary:", beneficiary.address);
    console.log("Admin:", admin.address);
    console.log("Upgrader:", upgrader.address);
    console.log("Bad actor:", badActor.address);
    console.log("Alice:", alice.address);
    console.log("Bob Creator:", bob.address);
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
})

describe("Nft Collection", async function () {

    it("Should deploy the nft collection", async function () {

        nftCollection = await deployNftCollection(collectionInit);

        expect(await nftCollection.collectionCreator()).to.equal(collectionInit.collectionCreator);
        expect(await nftCollection.name()).to.equal(collectionInit.name);
        expect(await nftCollection.symbol()).to.equal(collectionInit.symbol);
        expect(await nftCollection.baseUri()).to.equal(collectionInit.baseURI);
        expect(await nftCollection.contractUri()).to.equal(collectionInit.contractUri);
        expect(await nftCollection.beneficiary()).to.equal(collectionInit.beneficiary);
    });

    it("Should store collection creator", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        expect(await nftCollection.collectionCreator()).to.equal(collectionInit.collectionCreator);
    });

    it("Should store beneficiary and royalties", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        expect(await nftCollection.beneficiary()).to.equal(collectionInit.beneficiary);
        expect(await nftCollection.royaltyPercentNominator()).to.equal(collectionInit.royaltyPercentNominator);
        expect(await nftCollection.royaltyPercentDenominator()).to.equal(collectionInit.royaltyPercentDenominator);
    });

    it("Should have admin as the admin role", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        adminRole = await nftCollection.DEFAULT_ADMIN_ROLE()
        expect(await nftCollection.hasRole(
            adminRole, collectionInit.collectionCreator)).to.equal(true);
    });

    it("Should only allow owner to update token uri", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        expect(await nftCollection.baseUri()).to.equal(collectionInit.baseURI);

        const newBaseUri = "ipfs://zzz/"

        await expect(
            nftCollection.connect(badActor).setBaseURI(newBaseUri)
        ).to.be.revertedWith(RBAC_REVERT_ACCOUNT_NOT_ADMIN);

        expect(await nftCollection.baseUri()).to.equal(collectionInit.baseURI);

        const tx = await nftCollection.connect(collectionCreator).setBaseURI(newBaseUri);
        await tx.wait();

        expect(await nftCollection.baseUri()).to.equal(newBaseUri);
    });

    it("Should only allow owner to update contract uri", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        expect(await nftCollection.contractUri()).to.equal(collectionInit.contractUri);

        const newBaseUri = "ipfs://zzz/"

        await expect(
            nftCollection.connect(badActor).setContractURI(newBaseUri)
        ).to.be.revertedWith(RBAC_REVERT_ACCOUNT_NOT_ADMIN);

        expect(await nftCollection.baseUri()).to.equal(collectionInit.baseURI);

        const tx = await nftCollection.connect(collectionCreator).setContractURI(newBaseUri);
        await tx.wait();

        expect(await nftCollection.contractUri()).to.equal(newBaseUri);
    });

    it("Should only allow owner to mint", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        const newTokenId = 10

        await expect(
            nftCollection.connect(badActor).mint(newTokenId)
        ).to.be.revertedWith(RBAC_REVERT_ACCOUNT_NOT_ADMIN);

        const tx = await nftCollection.connect(collectionCreator).mint(newTokenId);
        receipt = await tx.wait();

        expect(await nftCollection.ownerOf(newTokenId)).to.equal(collectionCreator.address);
    });

    it("Should mint token with expected metadata", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        const newTokenId = 10

        const tx = await nftCollection.connect(collectionCreator).mint(newTokenId);
        receipt = await tx.wait();

        expect(await nftCollection.ownerOf(newTokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.tokenURI(newTokenId)).to.equal(collectionInit.baseURI + newTokenId);
    });

    it("Should get correct royalty info", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        tokenId = 10;

        salePrice = "100000000000000000";
        salePriceBn = ethers.BigNumber.from("100000000000000000");
        nominatorBn = ethers.BigNumber.from(collectionInit.royaltyPercentNominator);
        denominatorBn = ethers.BigNumber.from(collectionInit.royaltyPercentDenominator);
        expectedRoylatyBn = salePriceBn.mul(nominatorBn).div(denominatorBn);
        expectedRoylaty = expectedRoylatyBn.toString()

        let currentBeneficiary;
        let royalty;

        await expect(
            nftCollection.royaltyInfo(tokenId, salePrice)
        ).to.be.revertedWith(REVERT_TOKEN_ID_DOES_NOT_EXIST);

        const tx = await nftCollection.connect(collectionCreator).mint(tokenId);
        receipt = await tx.wait();

        [currentBeneficiary, royalty] = await nftCollection.royaltyInfo(tokenId, salePrice)

        expect(currentBeneficiary).to.equal(collectionInit.beneficiary)
        expect(royalty).to.equal(expectedRoylatyBn)
    });

    // TODO: This test causes the following warning:
    //       "Failed to generate 1 stack trace. Run Hardhat with --verbose to learn more."
    it("Should only allow owner to update beneficiary", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        expect(await nftCollection.beneficiary()).to.equal(collectionInit.beneficiary);

        const newBeneficiary = alice.address;

        await expect(
            nftCollection.connect(badActor).setBeneficiary(newBeneficiary)
        ).to.be.revertedWith(RBAC_REVERT_ACCOUNT_NOT_ADMIN);

        expect(await nftCollection.beneficiary()).to.equal(collectionInit.beneficiary);

        const tx = await nftCollection.connect(collectionCreator).setBeneficiary(newBeneficiary);
        await tx.wait();

        expect(await nftCollection.beneficiary()).to.equal(newBeneficiary);
    });

    it("Should only allow owner to update royalties", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        expect(await nftCollection.royaltyPercentNominator()).to.equal(collectionInit.royaltyPercentNominator);
        expect(await nftCollection.royaltyPercentDenominator()).to.equal(collectionInit.royaltyPercentDenominator);

        const newRoyaltyPercentNominator = 3;
        const newRoyaltyPercentDenominator = 200;

        await expect(
            nftCollection.connect(badActor).setRoyalties(newRoyaltyPercentNominator, newRoyaltyPercentDenominator)
        ).to.be.revertedWith(RBAC_REVERT_ACCOUNT_NOT_ADMIN);

        expect(await nftCollection.royaltyPercentNominator()).to.equal(collectionInit.royaltyPercentNominator);
        expect(await nftCollection.royaltyPercentDenominator()).to.equal(collectionInit.royaltyPercentDenominator);

        const tx = await nftCollection.connect(collectionCreator).setRoyalties(newRoyaltyPercentNominator, newRoyaltyPercentDenominator);
        await tx.wait();

        expect(await nftCollection.royaltyPercentNominator()).to.equal(newRoyaltyPercentNominator);
        expect(await nftCollection.royaltyPercentDenominator()).to.equal(newRoyaltyPercentDenominator);
    });

    it("Should only allow royalties updated to 50%", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        expect(await nftCollection.royaltyPercentNominator()).to.equal(collectionInit.royaltyPercentNominator);
        expect(await nftCollection.royaltyPercentDenominator()).to.equal(collectionInit.royaltyPercentDenominator);

        let newRoyaltyPercentNominator = 0x7fffffff;
        let newRoyaltyPercentDenominator = 0xfffffffd;

        await expect(
            nftCollection.connect(collectionCreator).setRoyalties(newRoyaltyPercentNominator, newRoyaltyPercentDenominator)
        ).to.be.revertedWith(REVERT_ROYALITIES_LIMIT);

        newRoyaltyPercentDenominator = 0xfffffffe;

        const tx = await nftCollection.connect(collectionCreator).setRoyalties(newRoyaltyPercentNominator, newRoyaltyPercentDenominator);
        await tx.wait();

        expect(await nftCollection.royaltyPercentNominator()).to.equal(newRoyaltyPercentNominator);
        expect(await nftCollection.royaltyPercentDenominator()).to.equal(newRoyaltyPercentDenominator);
    });

    it("Should not allow royalty overflow (can uint256 div underflow? - no)", async function () {
        collectionInit.royaltyPercentNominator = "0x02"
        collectionInit.royaltyPercentDenominator = "0x04"
        nftCollection = await deployNftCollection(collectionInit);
        expect(await nftCollection.royaltyPercentNominator()).to.equal(collectionInit.royaltyPercentNominator);
        expect(await nftCollection.royaltyPercentDenominator()).to.equal(collectionInit.royaltyPercentDenominator);

        salePrice = "0x8000000000000000000000000000000000000000000000000000000000000000"

        const tx = await nftCollection.connect(collectionCreator).mint(tokenId);
        receipt = await tx.wait();

        await expect(
            nftCollection.royaltyInfo(tokenId, salePrice)
        ).to.be.revertedWith(REVERT_OVERFLOW_OR_UNDERFLOW);

        salePrice = "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        salePriceBn = ethers.BigNumber.from(salePrice);
        nominatorBn = ethers.BigNumber.from(collectionInit.royaltyPercentNominator);
        denominatorBn = ethers.BigNumber.from(collectionInit.royaltyPercentDenominator);
        expectedRoylatyBn = salePriceBn.mul(nominatorBn).div(denominatorBn);
        expectedRoylaty = expectedRoylatyBn.toString()

        resp = await nftCollection.royaltyInfo(tokenId, salePrice)
        currentBeneficiary = resp[0]
        royalty = resp[1]

        expect(currentBeneficiary).to.equal(collectionInit.beneficiary)
        expect(royalty).to.equal(expectedRoylatyBn)

    });

    it("Should only allow owner to freeze", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        expect(await nftCollection.frozen()).to.equal(false);

        await expect(
            nftCollection.connect(badActor).freeze()
        ).to.be.revertedWith(RBAC_REVERT_ACCOUNT_NOT_ADMIN);

        expect(await nftCollection.frozen()).to.equal(false);

        const tx = await nftCollection.connect(collectionCreator).freeze();
        receipt = await tx.wait();

        expect(await nftCollection.frozen()).to.equal(true);
    });

    it("Should only allow freezing once", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        expect(await nftCollection.frozen()).to.equal(false);

        const tx = await nftCollection.connect(collectionCreator).freeze();
        receipt = await tx.wait();

        expect(await nftCollection.frozen()).to.equal(true);

        await expect(
            nftCollection.connect(collectionCreator).freeze()
        ).to.be.revertedWith(REVERT_METADATA_ALREADY_FROZEN);

        expect(await nftCollection.frozen()).to.equal(true);
    });

    it("Should not be able to update metadata after freeze", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        expect(await nftCollection.frozen()).to.equal(false);

        const newBaseUri = "ipfs://zzz/";

        const tx1 = await nftCollection.connect(collectionCreator).setBaseURI(newBaseUri);
        await tx1.wait();

        expect(await nftCollection.baseUri()).to.equal(newBaseUri);

        const tx2 = await nftCollection.connect(collectionCreator).freeze();
        await tx2.wait();

        expect(await nftCollection.frozen()).to.equal(true);

        const newerBaseUri = "ipfs://aaa/";

        await expect(
            nftCollection.connect(collectionCreator).setBaseURI(newerBaseUri)
        ).to.be.revertedWith(REVERT_METADATA_FROZEN);

        expect(await nftCollection.baseUri()).to.equal(newBaseUri);
    });


    it("Should not allow minting the same token id twice", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        const newTokenId = 10

        const tx = await nftCollection.connect(collectionCreator).mint(newTokenId);
        receipt = await tx.wait();

        await expect(
            nftCollection.connect(collectionCreator).mint(newTokenId)
        ).to.be.revertedWith(ERC721_REVERT_TOKEN_ALREADY_MINTED);
    });


    it("Should allow mint and transfer", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        owner = collectionCreator;
        signer = collectionCreator;
        const newTokenId = 10
        const nonce = 1337

        // signature = await signLazyMint(owner.address, newTokenId, nonce);
        // data = packLazyMint(owner.address, newTokenId, nonce, signature);
        let { data, signature } = await packAndSignMint(owner.address, newTokenId, nonce, signer);

        // const tx = await nftCollection.connect(collectionCreator)["mintWithSignatureAndSafeTransferFrom(address,address,uint256,bytes)"](
        const tx = await nftCollection.connect(collectionCreator).mintWithSignatureAndSafeTransferFrom(
            collectionCreator.address,
            alice.address,
            newTokenId,
            data
        );
        receipt = await tx.wait();

        expect(await nftCollection.ownerOf(newTokenId)).to.equal(alice.address);

        await expect(
            nftCollection.connect(collectionCreator).mint(newTokenId)
        ).to.be.revertedWith(ERC721_REVERT_TOKEN_ALREADY_MINTED);
    });


    it("Should not allow mint and transfer without ownership/allowance to spend from owner", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        owner = collectionCreator;
        signer = collectionCreator;
        const newTokenId = 10
        const nonce = 1337

        let { data, signature } = await packAndSignMint(owner.address, newTokenId, nonce, signer);

        await expect(nftCollection.connect(alice).mintWithSignatureAndSafeTransferFrom(
            collectionCreator.address,
            alice.address,
            newTokenId,
            data
        )).to.be.revertedWith(ERC721_REVERT_TRANSFER_CALLER_NOT_OWNER);
    });


    it("Should not allow mint and transfer if origin is not the collection owner", async function () {
        nftCollection = await deployNftCollection(collectionInit);

        owner = collectionCreator;
        signer = collectionCreator;
        const newTokenId = 10
        const nonce = 1337

        let { data, signature } = await packAndSignMint(owner.address, newTokenId, nonce, signer);

        await expect(nftCollection.connect(alice).mintWithSignatureAndSafeTransferFrom(
            alice.address,
            bob.address,
            newTokenId,
            data
        )).to.be.revertedWith(ERC721_REVERT_TRANSFER_CALLER_NOT_OWNER)
    });


    it("Should allow mint and transfer to smart contracts that can receive ERC721", async function () {
        nftCollection = await deployNftCollection(collectionInit);
        const nftHolder = await deployNftHolder()

        owner = collectionCreator;
        signer = collectionCreator;
        const newTokenId = 10
        const nonce = 1337

        let { data, signature } = await packAndSignMint(owner.address, newTokenId, nonce, signer);

        const tx = await nftCollection.connect(collectionCreator).mintWithSignatureAndSafeTransferFrom(
            collectionCreator.address,
            nftHolder.address,
            newTokenId,
            data
        );
        receipt = await tx.wait();

        expect(await nftCollection.ownerOf(newTokenId)).to.equal(nftHolder.address);
    });

    it("Should upgrade from v1 to v1000 to v2000", async function () {
        const nftCollectionFactory = await deployNftCollectionFactory();

        const nftCollectionImpl = await NftCollection.deploy();
        await nftCollectionImpl.deployed();

        await nftCollectionFactory.addNftCollectionUpgrade(nftCollectionImpl.address);

        const tx = await nftCollectionFactory.createNftCollection(
            NftCollection.interface.encodeFunctionData("initialize", collectionInit.toConstructorArgsArray())
        );
        const receipt = await tx.wait();
        const nftCollectionCreatedEvent = receipt.events.filter((x) => { return x.event == "NftCollectionCreated" });
        const nftCollectionAddress = nftCollectionCreatedEvent[0].args.nftCollection;

        let nftCollection = await nftCollectionFromAddress(nftCollectionAddress);

        expect(await nftCollection.version()).to.equal(1);

        const currentAdmin = collectionCreator;

        // add new implementation v1000
        const nftCollectionV1000Impl = await NftCollectionV1000.deploy();
        await nftCollectionV1000Impl.deployed();
        const tx2 = await nftCollectionFactory.addNftCollectionUpgrade(nftCollectionV1000Impl.address);
        await tx2.wait();

        // upgrade to version v1000
        const tx3 = await nftCollection.connect(currentAdmin).upgradeTo(nftCollectionV1000Impl.address);
        await tx3.wait();
        nftCollection = await NftCollectionV1000.attach(nftCollection.address);
        expect(await nftCollection.version()).to.equal(1000);
        const newstuffV1000 = "lorem ipsum v1000";
        await (await nftCollection.setNewStuffV1000(newstuffV1000)).wait();
        expect(await nftCollection.newStuffLength()).to.equal(newstuffV1000.length);
        expect(await nftCollection.newstuff()).to.equal(newstuffV1000);

        // add new implementation v2000
        const nftCollectionV2000Impl = await NftCollectionV2000.deploy();
        await nftCollectionV2000Impl.deployed();
        const tx4 = await nftCollectionFactory.addNftCollectionUpgrade(nftCollectionV2000Impl.address);
        await tx4.wait();

        // upgrade to version v2000
        const tx5 = await nftCollection.connect(currentAdmin).upgradeTo(nftCollectionV2000Impl.address);
        await tx5.wait();
        nftCollection = await NftCollectionV2000.attach(nftCollection.address);
        expect(await nftCollection.version()).to.equal(2000);
        
        const newstuffV2000 = "lorem ipsum v2000";
        await (await nftCollection.setNewStuffV2000(newstuffV2000)).wait();
        expect(await nftCollection.newStuffLength()).to.equal(newstuffV2000.length);
        expect(await nftCollection.newstuff()).to.equal(newstuffV2000);
        
        const newestStuff = 25;
        await (await nftCollection.setNewestStuff(newestStuff)).wait()
        expect(await nftCollection.newestStuff()).to.equal(newestStuff);
    });

    it("Should only allow admin to upgrade", async function () {
        const nftCollectionFactory = await deployNftCollectionFactory();

        const nftCollectionImpl = await NftCollection.deploy();
        await nftCollectionImpl.deployed();

        await nftCollectionFactory.addNftCollectionUpgrade(nftCollectionImpl.address);

        let tx = await nftCollectionFactory.createNftCollection(
            NftCollection.interface.encodeFunctionData("initialize", collectionInit.toConstructorArgsArray())
        );
        const receipt = await tx.wait();
        const nftCollectionCreatedEvent = receipt.events.filter((x) => { return x.event == "NftCollectionCreated" })
        const nftCollectionAddress = nftCollectionCreatedEvent[0].args.nftCollection

        let nftCollection = await nftCollectionFromAddress(nftCollectionAddress)

        expect(await nftCollection.version()).to.equal(1);

        const currentAdmin = collectionCreator;

        // add new implementation v1000
        const nftCollectionV1000Impl = await NftCollectionV1000.deploy();
        await nftCollectionV1000Impl.deployed();
        tx = await nftCollectionFactory.addNftCollectionUpgrade(nftCollectionV1000Impl.address);
        await tx.wait();

        // bad actor attempts upgrade
        await expect(
            nftCollection.connect(badActor).upgradeTo(nftCollectionV1000Impl.address)
        ).to.be.revertedWith(RBAC_REVERT_ACCOUNT_NOT_ADMIN)

        // upgrade to version v1000
        tx = await nftCollection.connect(currentAdmin).upgradeTo(nftCollectionV1000Impl.address) //, data)
        await tx.wait()
        nftCollection = await NftCollectionV1000.attach(nftCollection.address)
        expect(await nftCollection.version()).to.equal(1000);
        const newstuffV1000 = "lorem ipsum v1000";

        await (await nftCollection.setNewStuffV1000(newstuffV1000)).wait()
        expect(await nftCollection.newStuffLength()).to.equal(newstuffV1000.length);
        expect(await nftCollection.newstuff()).to.equal(newstuffV1000);
    });

    it("Should only allow upgrades from available implementations", async function () {
        const nftCollectionFactory = await deployNftCollectionFactory();

        const nftCollectionImpl = await NftCollection.deploy();
        await nftCollectionImpl.deployed();

        await nftCollectionFactory.addNftCollectionUpgrade(nftCollectionImpl.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        let tx = await nftCollectionFactory.createNftCollection(
            NftCollection.interface.encodeFunctionData("initialize", collectionInit.toConstructorArgsArray())
        );
        const receipt = await tx.wait();
        const nftCollectionCreatedEvent = receipt.events.filter((x) => { return x.event == "NftCollectionCreated" })
        const nftCollectionAddress = nftCollectionCreatedEvent[0].args.nftCollection

        let nftCollection = await nftCollectionFromAddress(nftCollectionAddress)

        expect(await nftCollection.version()).to.equal(1);

        const currentAdmin = collectionCreator;

        // instantiate implementations v1000 and v2000
        const nftCollectionV1000Impl = await NftCollectionV1000.deploy();
        await nftCollectionV1000Impl.deployed();
        const nftCollectionV2000Impl = await NftCollectionV2000.deploy();
        await nftCollectionV2000Impl.deployed();

        // add implementation v1000
        tx = await nftCollectionFactory.addNftCollectionUpgrade(nftCollectionV1000Impl.address);
        await tx.wait();

        // attempt to upgrade to unavailable implementation v2000
        await expect(
            nftCollection.connect(currentAdmin).upgradeTo(nftCollectionV2000Impl.address)
        ).to.be.revertedWith(REVERT_IMPLEMENTATION_DOES_NOT_EXIST)

        // add implementation v2000
        tx = await nftCollectionFactory.addNftCollectionUpgrade(nftCollectionV2000Impl.address);
        await tx.wait();
        
        await nftCollection.connect(currentAdmin).upgradeTo(nftCollectionV2000Impl.address) //, data)
        nftCollection = await NftCollectionV2000.attach(nftCollection.address)
        expect(await nftCollection.version()).to.equal(2000);
    });

    it("Should allow renting operator to rent NFT", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const rentingOperatorRole = await nftCollection.RENTING_OPERATOR_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(rentingOperatorRole, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.hasRole(rentingOperatorRole, alice.address)).to.equal(true);

        const tokenId = 10;
        await nftCollection.connect(collectionCreator).mint(tokenId);
        
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(collectionCreator.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const rentReturnTimestamp = (await time.latest()) + 1000;
        await nftCollection.connect(alice).rentNFT(collectionCreator.address, alice.address, tokenId, rentReturnTimestamp, false);
        
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(alice.address);
        expect(await nftCollection.rentTime(tokenId)).to.equal(rentReturnTimestamp);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);
    });

    it("Should not allow non-renting-operator to rent NFT", async function() {
        nftCollection = await deployNftCollection(collectionInit);

        const tokenId = 10;
        await nftCollection.connect(collectionCreator).mint(tokenId);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(collectionCreator.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const rentReturnTimestamp = (await time.latest()) + 1000;

        const rentingOperatorRole = await nftCollection.RENTING_OPERATOR_ROLE();

        await deployer.sendTransaction(txTo);

        expect(await nftCollection.hasRole(rentingOperatorRole, alice.address)).to.equal(false);
        await expect(nftCollection.connect(alice).rentNFT(collectionCreator.address, alice.address, tokenId, rentReturnTimestamp, false)).to.be.revertedWith("Caller is not the renting protocol");
    });

    it("Should not allow to rent NFT that is already rented", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const rentingOperatorRole = await nftCollection.RENTING_OPERATOR_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(rentingOperatorRole, alice.address);
        await nftCollection.connect(collectionCreator).grantRole(rentingOperatorRole, bob.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.hasRole(rentingOperatorRole, alice.address)).to.equal(true);
        expect(await nftCollection.hasRole(rentingOperatorRole, bob.address)).to.equal(true);

        const tokenId = 10;
        await nftCollection.connect(collectionCreator).mint(tokenId);

        await deployer.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(collectionCreator.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const rentReturnTimestamp = (await time.latest()) + 1000;

        await nftCollection.connect(alice).rentNFT(collectionCreator.address, alice.address, tokenId, rentReturnTimestamp, false);

        await deployer.sendTransaction(txTo);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(alice.address);
        expect(await nftCollection.rentTime(tokenId)).to.equal(rentReturnTimestamp);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);

        await expect(nftCollection.connect(bob).rentNFT(collectionCreator.address, bob.address, tokenId, rentReturnTimestamp, false)).to.be.revertedWith("NFT is currnetly being rented");
    });

    it("Should not allow to rent NFT with wrong owner", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const rentingOperatorRole = await nftCollection.RENTING_OPERATOR_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(rentingOperatorRole, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.hasRole(rentingOperatorRole, alice.address)).to.equal(true);

        const tokenId = 10;
        await nftCollection.connect(collectionCreator).mint(tokenId);

        await deployer.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(collectionCreator.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const rentReturnTimestamp = (await time.latest()) + 1000;
        await expect(nftCollection.connect(alice).rentNFT(bob.address, alice.address, tokenId, rentReturnTimestamp, false)).to.be.revertedWith("Original owner mismatch");
    });

    it("Should not allow to rent NFT if return time is in the past", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const rentingOperatorRole = await nftCollection.RENTING_OPERATOR_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(rentingOperatorRole, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.hasRole(rentingOperatorRole, alice.address)).to.equal(true);

        const tokenId = 10;
        await nftCollection.connect(collectionCreator).mint(tokenId);

        await deployer.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(collectionCreator.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const rentReturnTimestamp = (await time.latest()) - 1000;
        await expect(nftCollection.connect(alice).rentNFT(collectionCreator.address, alice.address, tokenId, rentReturnTimestamp, false)).to.be.revertedWith("return time cannot be set in the past");
    });

    it("Should allow to return NFT if the rental time has expired", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const rentingOperatorRole = await nftCollection.RENTING_OPERATOR_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(rentingOperatorRole, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.hasRole(rentingOperatorRole, alice.address)).to.equal(true);

        const tokenId = 10;
        await nftCollection.connect(collectionCreator).mint(tokenId);

        await deployer.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(collectionCreator.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const rentReturnTimestamp = (await time.latest()) + 1000;
        await nftCollection.connect(alice).rentNFT(collectionCreator.address, alice.address, tokenId, rentReturnTimestamp, false);

        await deployer.sendTransaction(txTo);

        expect(await nftCollection.originalOwners(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(alice.address);
        expect(await nftCollection.rentTime(tokenId)).to.equal(rentReturnTimestamp);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);

        await time.increaseTo(rentReturnTimestamp + 1);
        await nftCollection.connect(alice).returnNFT(tokenId);

        await deployer.sendTransaction(txTo);

        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);
        expect(ethers.BigNumber.from(await nftCollection.temporaryOwner(tokenId))).to.equal(0);
        expect(ethers.BigNumber.from(await nftCollection.rentTime(tokenId))).to.equal(0);
    });

    it("Should not allow return NFT if the rental time has not yet expired", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const rentingOperatorRole = await nftCollection.RENTING_OPERATOR_ROLE();
        await nftCollection.connect(collectionCreator).grantRole(rentingOperatorRole, alice.address);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.hasRole(rentingOperatorRole, alice.address)).to.equal(true);

        const tokenId = 10;
        await nftCollection.connect(collectionCreator).mint(tokenId);

        await deployer.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(collectionCreator.address);
        expect(ethers.BigNumber.from(await nftCollection.originalOwners(tokenId))).to.equal(0);

        const rentReturnTimestamp = (await time.latest()) + 1000;
        await nftCollection.connect(alice).rentNFT(collectionCreator.address, alice.address, tokenId, rentReturnTimestamp, false);

        await deployer.sendTransaction(txTo);
                
        expect(await nftCollection.originalOwners(tokenId)).to.equal(collectionCreator.address);
        expect(await nftCollection.temporaryOwner(tokenId)).to.equal(alice.address);
        expect(await nftCollection.rentTime(tokenId)).to.equal(rentReturnTimestamp);
        expect(await nftCollection.prematureReturnAllowed(tokenId)).to.equal(false);

        await expect(nftCollection.connect(alice).returnNFT(tokenId)).to.be.revertedWith("Rent time has not expired yet");
    });

    it("Should allow to mint using mintWithSignature", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const tokenId = 10;
        const nonce = 1337;

        const owner = collectionCreator;
        const signer = collectionCreator;

        const signature = await signLazyMint(owner.address, tokenId, nonce, signer);
        
        const signedMint = {
            from: owner.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await nftCollection.mintWithSignature(signedMint);

        const txTo = {
            to: ethers.constants.AddressZero,
            value: ethers.utils.parseEther("0"),
        };
        await deployer.sendTransaction(txTo);

        expect(await nftCollection.ownerOf(tokenId)).to.equal(owner.address);
        expect(await nftCollection.cancelledSignatures(signature)).to.equal(true);
    });

    it("Should not allow to mint using mintWithSignature if the signer is not the future onwer", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const tokenId = 10;
        const nonce = 1337;

        const owner = collectionCreator;
        const signer = alice;

        const signature = await signLazyMint(owner.address, tokenId, nonce, signer);
        
        const signedMint = {
            from: owner.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await expect(nftCollection.mintWithSignature(signedMint)).to.be.revertedWith("signer mismatch");
    });

    it("Should not allow non admin to mint using mintWithSignature", async function() {
        nftCollection = await deployNftCollection(collectionInit);
        
        const tokenId = 10;
        const nonce = 1337;

        const owner = alice;
        const signer = alice;

        const signature = await signLazyMint(owner.address, tokenId, nonce, signer);
        
        const signedMint = {
            from: owner.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await expect(nftCollection.mintWithSignature(signedMint)).to.be.revertedWith("Signer not allowed to lazy mint");
    });

    it("Should allow the signer to cancel their signature", async () => {
        nftCollection = await deployNftCollection(collectionInit);

        const tokenId = 10;
        const nonce = 1337;

        const signature = await signLazyMint(collectionCreator.address, tokenId, nonce, collectionCreator);
        
        const signedMint = {
            from: collectionCreator.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await nftCollection.connect(collectionCreator).cancelSignature(signedMint);
        expect(await nftCollection.cancelledSignatures(signature)).to.equal(true);
    });

    it("Should not allow to cancel the signature if it's already cancelled", async () => {
        nftCollection = await deployNftCollection(collectionInit);

        const tokenId = 10;
        const nonce = 1337;

        const signature = await signLazyMint(collectionCreator.address, tokenId, nonce, collectionCreator);
        
        const signedMint = {
            from: collectionCreator.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await nftCollection.connect(collectionCreator).cancelSignature(signedMint);
        await expect(nftCollection.cancelSignature(signedMint)).to.be.revertedWith("Signature is already cancelled");
    })

    it("Should not allow non-signer to cancel signature", async () => {
        nftCollection = await deployNftCollection(collectionInit);

        const tokenId = 10;
        const nonce = 1337;

        const signature = await signLazyMint(collectionCreator.address, tokenId, nonce, collectionCreator);
        
        const signedMint = {
            from: collectionCreator.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await expect(nftCollection.connect(badActor).cancelSignature(signedMint)).to.be.revertedWith("Only the signer can cancell this signature");
    });

    it("Should not allow to mint using mintWithSignature if signature is cancelled", async () => {
        nftCollection = await deployNftCollection(collectionInit);
        
        const tokenId = 10;
        const nonce = 1337;

        const owner = collectionCreator;
        const signer = collectionCreator;

        const signature = await signLazyMint(owner.address, tokenId, nonce, signer);
        
        const signedMint = {
            from: owner.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await nftCollection.connect(signer).cancelSignature(signedMint);
        await expect(nftCollection.mintWithSignature(signedMint)).to.be.revertedWith("Signature is cancelled");
    });
});
