const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const DOMAIN_NAME = "Shared NFT Collection";
const DOMAIN_VERSION = "0.0.1";

const types = {
    SignedMint: [
        { name: "from", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "nonce", type: "uint256" },
    ]
};

var SharedNFTCollection = {};
var sharedNFTCollection = {};
var rentingProtocol = {}

var collectionCreator = {};
var alice = {};
var bob = {};
var beneficiary = {};
var badActor = {};

var accounts = {};

function getDomain(chainId) {
    return {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: chainId,
        verifyingContract: sharedNFTCollection.address,
    }
};

async function signMint(from, tokenId, nonce, signer) {
    const message = {
        from: from,
        tokenId: tokenId,
        nonce: nonce
    }

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = getDomain(chainId);
    const signature = await signer._signTypedData(domain, types, message);
    
    return signature;
}

async function packAndSignMint(from, tokenId, nonce, signer) {
    let signature = await signMint(from, tokenId, nonce, signer);
    let data = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'bytes memory'],
        [from, tokenId, nonce, signature]
    );

    return data;
}

before(async function() {
    SharedNFTCollection = await ethers.getContractFactory("NftSharedCollection");

    const RentingProtocol = await ethers.getContractFactory("NFTRenting");
    rentingProtocol = await upgrades.deployProxy(RentingProtocol, { initializer: 'initialize', kind: 'uups' });

    [collectionCreator, alice, bob, beneficiary, badActor] = await ethers.getSigners();
    accounts = [collectionCreator, alice, bob, beneficiary, badActor];

    console.log("Collection creator address:", collectionCreator.address);
    console.log("Alice address:", alice.address);
    console.log("Bob address:", bob.address);
    console.log("Beneficiary address:", beneficiary.address);
    console.log("Bad actor address:", badActor.address);
});

beforeEach(async function() {
    sharedNFTCollection = await upgrades.deployProxy(SharedNFTCollection, [
        collectionCreator.address,
        "ipfs://xxx/",
        "ipfs://yyy/",
        beneficiary.address,
        1,
        100,
        rentingProtocol.address
    ], { initializer: "initializeSharedCollection", kind: "uups" });
});

describe("Shared NFT Collection", async function() {
    it("Should allow anyone to mint", async function() {
        let token = 0;

        for(const account of accounts) {
            const tx = await sharedNFTCollection.connect(account).mint(token);
            await tx.wait();

            const txTo = {
                to: ethers.constants.AddressZero,
                value: ethers.utils.parseEther("0"),
            };
            await collectionCreator.sendTransaction(txTo);
    
            expect(await sharedNFTCollection.ownerOf(token)).to.equal(account.address);

            ++token;
        }
    });

    it("Should allow anyone to mint using mintWithSignature", async function() {
        let token = 0;
        let nonce = 0;

        for(const account of accounts) {
            const signature = await signMint(account.address, token, nonce, account);
            const signedMint = {
                from: account.address,
                tokenId: token,
                nonce: nonce,
                signature: signature,
            };

            const tx = await sharedNFTCollection.connect(account).mintWithSignature(signedMint);
            await tx.wait();

            const txTo = {
                to: ethers.constants.AddressZero,
                value: ethers.utils.parseEther("0"),
            };
            await collectionCreator.sendTransaction(txTo);
    
            expect(await sharedNFTCollection.ownerOf(token)).to.equal(account.address);
            expect(await sharedNFTCollection.cancelledSignatures(signature)).to.equal(true);

            ++token;
            ++nonce;
        }
    });

    it("Should not allow to mint using mintWithSignature if the signer is not the future onwer", async function() {
        const tokenId = 10;
        const nonce = 1;

        const signature = await signMint(alice.address, tokenId, nonce, bob);
        const signedMint = {
            from: alice.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await expect(sharedNFTCollection.mintWithSignature(signedMint)).to.be.revertedWith("signer mismatch");
    });

    it("Should not allow to mint using mintWithSignature if the signature is cancelled", async () => {
        const tokenId = 10;
        const nonce = 1;

        const signature = await signMint(alice.address, tokenId, nonce, alice);
        const signedMint = {
            from: alice.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: signature,
        };

        await sharedNFTCollection.connect(alice).cancelSignature(signedMint);
        await expect(sharedNFTCollection.connect(alice).mintWithSignature(signedMint)).to.be.revertedWith("Signature is cancelled");
    });
});