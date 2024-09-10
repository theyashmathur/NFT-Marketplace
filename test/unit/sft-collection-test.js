const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const COLLECTION_NAME = "ex-ex-ex";
const DOMAIN_VERSION = "0.0.1";

const tokenId = 10;
const amount = 3;

const tokenIds = [1, 2, 3, 4];
const amounts = [3, 3, 3, 3];

const SignedMintType = {
    mintWithSig: [
        { name: "from", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
    ]
};

const SignedMintBatchType = {
    mintBatchWithSig: [
        { name: "from", type: "address" },
        { name: "tokenIds", type: "uint256[]" },
        { name: "amounts", type: "uint256[]" },
        { name: "nonce", type: "uint256" },
    ]
};

let SFTCollection;
let sftCollection;

let owner;
let alice;
let bob;
let beneficiary;
let badActor;

let domain;

before(async function() {
    SFTCollection = await ethers.getContractFactory("SFTCollection");

    [owner, alice, bob, beneficiary, badActor] = await ethers.getSigners();

    console.log("Owner address:", owner.address);
    console.log("Alice address:", alice.address);
    console.log("Bob address:", bob.address);
    console.log("Beneficiary address:", beneficiary.address);
    console.log("Bad actor address:", badActor.address);
});

beforeEach(async function() {
    sftCollection = await upgrades.deployProxy(SFTCollection, [
        owner.address,
        COLLECTION_NAME,
        "XXX",
        "ipfs://xxx/",
        "ipfs://yyy/",
        beneficiary.address,
        1,
        100
    ], { initializer: 'initialize', kind: 'uups' });

    const chainId = (await ethers.provider.getNetwork()).chainId;
    domain = {
        name: COLLECTION_NAME,
        version: DOMAIN_VERSION,
        chainId: chainId,
        verifyingContract: sftCollection.address
    };
});

describe("Semi-Fungible Token Contract", async function() {
    it("Should allow admin to freeze metadata", async function() {
        await sftCollection.freeze();

        expect(await sftCollection.frozen()).to.equal(true);
    });

    it("Should not allow non-admin to freeze metadata", async function() {
        await expect(sftCollection.connect(badActor).freeze()).to.be.revertedWith("Account has no admin role");
    });

    it("Should not allow to freeze metadata if its already frozen", async function() {
        await sftCollection.freeze();

        await expect(sftCollection.freeze()).to.be.revertedWith("Metadata already frozen");
    });

    it("Should allow admin to set base uri", async function() {
        const tx = await sftCollection.setBaseURI("hello, world!");

        expect(await sftCollection.baseUri()).to.equal("hello, world!");
        expect(tx).to.emit(sftCollection, "NewBaseURI").withArgs(
            "ipfs://xxx/",
            "hello, world!"
        );
    });

    it("Should not allow non-admin to set base uri", async function() {
        await expect(sftCollection.connect(badActor).setBaseURI("revert")).to.be.revertedWith("Account has no admin role");
    });

    it("Should not allow to set base uri if metadata is frozen", async function() {
        await sftCollection.freeze();

        await expect(sftCollection.setBaseURI("some base uri")).to.be.revertedWith("Metadata frozen");
    });

    it("Should allow admin to set contract uri", async function() {
        const tx = await sftCollection.setContractURI("new contract uri");

        expect(await sftCollection.contractUri()).to.equal("new contract uri");
        expect(tx).to.emit(sftCollection, "NewContractURI").withArgs(
            "ipfs://yyy/",
            "new contract uri"
        );
    });

    it("Should not allow non-admin to set contract uri", async function() {
        await expect(sftCollection.connect(badActor).setContractURI("revert")).to.be.revertedWith("Account has no admin role");
    });

    it("Should allow admin to set beneficiary", async function() {
        await sftCollection.setBeneficiary(alice.address);

        expect(await sftCollection.beneficiary()).to.equal(alice.address);
    });

    it("Should not allow non-admin to set beneficiary", async function() {
        await expect(sftCollection.connect(badActor).setBeneficiary(alice.address)).to.be.revertedWith("Account has no admin role");
    });

    it("Should allow admin to set royalies", async function() {
        await sftCollection.setRoyalties(1, 4);

        expect(await sftCollection.royaltyPercentNominator()).to.equal(1);
        expect(await sftCollection.royaltyPercentDenominator()).to.equal(4);
    });

    it("Should not allow non-admin to set royalties", async function() {
        await expect(sftCollection.connect(badActor).setRoyalties(1, 4)).to.be.revertedWith("Account has no admin role");
    });

    it("Should not allow to set royalties above 50%", async function() {
        await expect(sftCollection.setRoyalties(4, 4)).to.be.revertedWith("Royalties must be up to 50%");
    });

    it("Should allow admin to mint new tokens", async function() {
        await sftCollection.mint(tokenId, amount);

        expect(await sftCollection.balanceOf(owner.address, tokenId)).to.equal(amount);
    });

    it("Should not allow non-admin to mint new tokens", async function() {
        await expect(sftCollection.connect(badActor).mint(tokenId, amount)).to.be.revertedWith("Account has no admin role");
    });

    it("Should allow admin to mint a batch of tokens", async function() {
        await sftCollection.mintBatch(tokenIds, amounts);

        for (let i = 0; i < tokenIds.length; ++i) {
            expect(await sftCollection.balanceOf(owner.address, tokenIds[i])).to.equal(amounts[i]);
        }
    });

    it("Should not allow non-admin to mint a batch of tokens", async function() {
        await expect(sftCollection.connect(badActor).mintBatch(tokenIds, amounts)).to.be.revertedWith("Account has no admin role");
    });

    it("Should allow to mint tokens with signature", async function() {
        const value = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintType, value);
        const message = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await sftCollection.mintWithSignature(message);

        expect(await sftCollection.balanceOf(owner.address, tokenId)).to.equal(amount);
        expect(await sftCollection.cancelledSignatures(signature)).to.equal(true);
    });

    it("Should not allow to mint tokens with signature if 'from' is address zero", async function() {
        const message = {
            from: ethers.constants.AddressZero,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0),
            signature: ethers.utils.randomBytes(32)
        };

        await expect(sftCollection.mintWithSignature(message)).to.be.revertedWith("invalid from address");
    });

    it("Should not allow to mint tokens with signature if the message signer is not in the 'from'", async function() {
        const value = {
            from: alice.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintType, value);
        const message = {
            from: alice.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await expect(sftCollection.mintWithSignature(message)).to.be.revertedWith("signer mismatch");
    });

    it("Should not allow to mint tokens with signature if the message signer has no admin role", async function() {
        const value = {
            from: badActor.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await badActor._signTypedData(domain, SignedMintType, value);
        const message = {
            from: badActor.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await expect(sftCollection.mintWithSignature(message)).to.be.revertedWith("Signer not allowed to lazy mint");
    });

    it("Should allow to mint a batch of tokens with signature", async function() {
        const value = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintBatchType, value);
        const message = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await sftCollection.mintBatchWithSignature(message);

        for (let i = 0; i < tokenIds.length; ++i) {
            expect(await sftCollection.balanceOf(owner.address, tokenIds[i])).to.equal(amounts[i]);
        }
        expect(await sftCollection.cancelledSignatures(signature)).to.equal(true);
    });

    it("Should not allow to mint a batch of tokens with signature if 'from' is address zero", async function() {
        const message = {
            from: ethers.constants.AddressZero,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0),
            signature: ethers.utils.randomBytes(32)
        };

        await expect(sftCollection.mintBatchWithSignature(message)).to.be.revertedWith("invalid from address");
    });

    it("Should not allow to mint a batch of tokens with signature if the message signer is not in the 'from'", async function() {
        const value = {
            from: alice.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintBatchType, value);
        const message = {
            from: alice.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await expect(sftCollection.mintBatchWithSignature(message)).to.be.revertedWith("signer mismatch");
    });

    it("Should not allow to mint a batch of tokens with signature if the message signer has no admin role", async function() {
        const value = {
            from: badActor.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await badActor._signTypedData(domain, SignedMintBatchType, value);
        const message = {
            from: badActor.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await expect(sftCollection.mintBatchWithSignature(message)).to.be.revertedWith("Signer not allowed to lazy mint");
    });

    it("Should allow the signer to cancel their signature", async () => {
        const value = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintType, value);
        const message = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await sftCollection.cancelMintSignature(message);
        expect(await sftCollection.cancelledSignatures(signature)).to.equal(true);
    });

    it("Should not allow to cancel the signature if it's already cancelled", async () => {
        const value = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintType, value);
        const message = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await sftCollection.cancelMintSignature(message);
        await expect(sftCollection.cancelMintSignature(message)).to.be.revertedWith("Signature is already cancelled");
    });

    it("Should not allow non-signer to cancel the signature", async () => {
        const value = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintType, value);
        const message = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await expect(sftCollection.connect(badActor).cancelMintSignature(message)).to.be.revertedWith("Only the signer can cancel this signature");
    })

    it("Should not allow to mint using mintWithSignature if the signature is cancelled", async () => {
        const value = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintType, value);
        const message = {
            from: owner.address,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await sftCollection.cancelMintSignature(message);
        await expect(sftCollection.mintWithSignature(message)).to.be.revertedWith("Signature is cancelled");
    });

    it("Should allow the signer to cancel their mintBatch signature", async () => {
        const value = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintBatchType, value);
        const message = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await sftCollection.cancelMintBatchSignature(message);
        expect(await sftCollection.cancelledSignatures(signature)).to.equal(true);
    });

    it("Should not allow to cancel the mintBatch signature if it's already cancelled", async () => {
        const value = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintBatchType, value);
        const message = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await sftCollection.cancelMintBatchSignature(message);
        await expect(sftCollection.cancelMintBatchSignature(message)).to.be.revertedWith("Signature is already cancelled");
    });

    it("Should not allow non-signer to cancel the mintBatch signature", async () => {
        const value = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintBatchType, value);
        const message = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await expect(sftCollection.connect(badActor).cancelMintBatchSignature(message)).to.be.revertedWith("Only the signer can cancel this signature");
    })

    it("Should not allow to mint a batch of tokens with signature is the signature is cancelled", async () => {
        const value = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0)
        };

        const signature = await owner._signTypedData(domain, SignedMintBatchType, value);
        const message = {
            from: owner.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(0),
            signature: signature
        };

        await sftCollection.cancelMintBatchSignature(message);
        await expect(sftCollection.mintBatchWithSignature(message)).to.be.revertedWith("Signature is cancelled");
    });

    it("Should return token URI", async () => {
        expect(await sftCollection.uri(tokenId)).to.equal(`ipfs://xxx/${tokenId}`);
    });
});