const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { setEmitFlags } = require("typescript");

const DOMAIN_NAME = "Shared SFT Collection";
const DOMAIN_VERSION = "0.0.1";

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

let SharedSFTCollection;
let sharedSFTCollection;

let collectionCreator;
let alice;
let bob;
let beneficiary;
let badActor;
let accounts;

let domain;

async function signMint(from, tokenId, amount, signer) {
    const message = {
        from: from,
        tokenId: tokenId,
        amount: amount,
        nonce: ethers.BigNumber.from(1)
    }

    const signature = await signer._signTypedData(domain, SignedMintType, message);    
    return signature;
}

async function signMintBatch(from, tokenIds, amounts, signer) {
    const message = {
        from: from,
        tokenIds: tokenIds,
        amounts: amounts,
        nonce: ethers.BigNumber.from(1)
    }

    const signature = await signer._signTypedData(domain, SignedMintBatchType, message);    
    return signature;
}

before(async function() {
    SharedSFTCollection = await ethers.getContractFactory("SFTSharedCollection");

    [collectionCreator, alice, bob, beneficiary, badActor] = await ethers.getSigners();
    accounts = [collectionCreator, alice, bob, beneficiary, badActor];

    console.log("Collection creator address:", collectionCreator.address);
    console.log("Alice address:", alice.address);
    console.log("Bob address:", bob.address);
    console.log("Beneficiary address:", beneficiary.address);
    console.log("Bad actor address:", badActor.address);
});

beforeEach(async function() {
    sharedSFTCollection = await upgrades.deployProxy(SharedSFTCollection, [
        collectionCreator.address,
        "ipfs://xxx/",
        "ipfs://yyy/",
        beneficiary.address,
        1,
        100
    ], { initializer: 'initializeSharedSFTContract', kind: 'uups' });

    const chainId = (await ethers.provider.getNetwork()).chainId;
    domain = {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: chainId,
        verifyingContract: sharedSFTCollection.address
    };
});

describe("Shared SFT Collection", async function() {
    it("Should allow anyone to mint tokens", async function() {
        let token = 0;
        const amount = 3;

        for (const account of accounts) {
            await sharedSFTCollection.connect(account).mint(token, amount);
            expect(await sharedSFTCollection.balanceOf(account.address, token)).to.equal(amount);

            ++token;
        }
    });

    it("Should allow anyone to mint a batch of tokens", async function() {
        const tokenIds = [1, 2, 3, 4, 5];
        const amounts = [3, 3, 3, 3, 3];
        
        for (const account of accounts) {
            await sharedSFTCollection.connect(account).mintBatch(tokenIds, amounts);

            for (let i = 0; i < tokenIds.length; ++i) {
                expect(await sharedSFTCollection.balanceOf(account.address, tokenIds[i])).to.equal(amounts[i]);
            }
        }
    });

    it("Should allow anyone to mint tokens with signature", async function() {
        let token = 0;
        const amount = 3;

        for (const account of accounts) {
            const signature = await signMint(account.address, token, amount, account);
            const signedMessage = {
                from: account.address,
                tokenId: token,
                amount: amount,
                nonce: ethers.BigNumber.from(1),
                signature: signature
            };

            await sharedSFTCollection.connect(account).mintWithSignature(signedMessage);
            expect(await sharedSFTCollection.balanceOf(account.address, token)).to.equal(amount);
            expect(await sharedSFTCollection.cancelledSignatures(signature)).to.equal(true);

            ++token;
        }
    });

    it("Should not allow to mint tokens with signature if 'from is address zero'", async function() {
        const tokenId = 10;
        const amount = 3;

        const message = {
            from: ethers.constants.AddressZero,
            tokenId: tokenId,
            amount: amount,
            nonce: ethers.BigNumber.from(1),
            signature: ethers.utils.randomBytes(32)
        };

        await expect(sharedSFTCollection.mintWithSignature(message)).to.be.revertedWith("invalid from address");
    });

    it("Should not allow to mint tokens if the message signer is not the future owner", async function() {
        const token = 10;
        const amount = 3;

        const signature = await signMint(alice.address, token, amount, bob);
        const signedMessage = {
            from: alice.address,
            tokenId: token,
            amount: amount,
            nonce: ethers.BigNumber.from(1),
            signature: signature
        };

        await expect(sharedSFTCollection.mintWithSignature(signedMessage)).to.be.revertedWith("signer mismatch");
    });

    it("Should allow anyone to mint a batch tokens with signature", async function() {
        const tokenIds = [1, 2, 3, 4, 5];
        const amounts = [3, 3, 3, 3, 3];

        for (const account of accounts) {
            const signature = await signMintBatch(account.address, tokenIds, amounts, account);
            const signedMessage = {
                from: account.address,
                tokenIds: tokenIds,
                amounts: amounts,
                nonce: ethers.BigNumber.from(1),
                signature: signature
            };

            await sharedSFTCollection.connect(account).mintBatchWithSignature(signedMessage);

            for (let i = 0; i < tokenIds.length; ++i) {
                expect(await sharedSFTCollection.balanceOf(account.address, tokenIds[i])).to.equal(amounts[i]);
            }
            expect(await sharedSFTCollection.cancelledSignatures(signature)).to.equal(true);
        }
    });

    it("Should not allow to mint a batch of tokens with signature if 'from is address zero'", async function() {
        const tokenIds = [1, 2, 3, 4];
        const amounts = [3, 3, 3, 3];

        const message = {
            from: ethers.constants.AddressZero,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(1),
            signature: ethers.utils.randomBytes(32)
        };

        await expect(sharedSFTCollection.mintBatchWithSignature(message)).to.be.revertedWith("invalid from address");
    });

    it("Should not allow to mint a batch of tokens if the message signer is not the future owner", async function() {
        const tokenIds = [1, 2, 3, 4, 5];
        const amounts = [3, 3, 3, 3, 3];

        const signature = await signMintBatch(alice.address, tokenIds, amounts, bob);
        const signedMessage = {
            from: alice.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(1),
            signature: signature
        };

        await expect(sharedSFTCollection.mintBatchWithSignature(signedMessage)).to.be.revertedWith("signer mismatch");
    });

    it("Should not allow to mint with signature if the signature is cancelled", async () => {
        let token = 0;
        const amount = 3;

        const signature = await signMint(alice.address, token, amount, alice);
        const signedMessage = {
            from: alice.address,
            tokenId: token,
            amount: amount,
            nonce: ethers.BigNumber.from(1),
            signature: signature
        };

        await sharedSFTCollection.connect(alice).cancelMintSignature(signedMessage);
        await expect(sharedSFTCollection.connect(alice).mintWithSignature(signedMessage)).to.be.revertedWith("Signature is cancelled");
    });

    it("Should not allow to mint a batch of tokens with signature if the signature is cancelled", async () => {
        const tokenIds = [1, 2, 3, 4, 5];
        const amounts = [3, 3, 3, 3, 3];

        const signature = await signMintBatch(alice.address, tokenIds, amounts, alice);
        const signedMessage = {
            from: alice.address,
            tokenIds: tokenIds,
            amounts: amounts,
            nonce: ethers.BigNumber.from(1),
            signature: signature
        };

        await sharedSFTCollection.connect(alice).cancelMintBatchSignature(signedMessage);
        await expect(sharedSFTCollection.connect(alice).mintBatchWithSignature(signedMessage)).to.be.revertedWith("Signature is cancelled");
    });

});