const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { BigNumber } = require("ethers");

function print(...args) {
    console.log(...args);
}

const DOMAIN_NAME = "NFTSpace Marketplace";
const DOMAIN_VERSION = "0.0.1";

function getDomain(chainId, contractAddress) {
    return {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: chainId,
        verifyingContract: contractAddress
    }
};

function getNFTCollectionDomain(chainId, contractAddress) {
    return {
        name: "NFT Collection",
        version: "0.0.1",
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

async function deployRentingProtocol() {
    const NFTRenting = await ethers.getContractFactory("NFTRenting");
    const rentingProtocol = await upgrades.deployProxy(NFTRenting, { initializer: 'initialize', kind: 'uups' });

    return rentingProtocol;
}

async function deployNFTCollection(rentingProtocolAddress, collectionCreator, beneficiary) {
    const NFTCollection = await ethers.getContractFactory("NftCollection");
    const nftCollection = upgrades.deployProxy(NFTCollection, [
        collectionCreator,
        "NFT Collection",
        "NFTC",
        "ipfs://xxx/",
        "ipfs://yyy/",
        beneficiary,
        1,
        100,
        rentingProtocolAddress,
    ], { initializer: 'initialize', kind: 'uups' });

    return nftCollection;
}

const sellBySig = {
    SellBySig: [
        { name: "seller",          type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "settlementPrice", type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ],
};

const sellBySigMultiple = {
    SellBySigMultiple: [
        { name: "seller",          type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "amount",          type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "settlementPrice", type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ],
};

const offerSigType = {
    OfferSig: [
        { name: "buyer",           type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "settlementPrice", type: "uint256" },
        { name: "deadline",        type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ],
};

const offerSigMultiple = {
    OfferSigMultiple: [
        { name: "buyer",           type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "amount",          type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "settlementPrice", type: "uint256" },
        { name: "deadline",        type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ],
};

const sellByAuction = {
    SellByAuction: [
        { name: "seller",          type: "address" },
        { name: "tokenContract",   type: "address"},
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "minimumBidPrice", type: "uint256" },
        { name: "reservePrice",    type: "uint256" },
        { name: "expirationDate",  type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ],
};

const sellByAuctionMultiple = {
    SellByAuctionMultiple: [
        { name: "seller",          type: "address" },
        { name: "tokenContract",   type: "address"},
        { name: "tokenId",         type: "uint256" },
        { name: "amount",          type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "minimumBidPrice", type: "uint256" },
        { name: "reservePrice",    type: "uint256" },
        { name: "expirationDate",  type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ],
};

const bidSignature = {
    BidSignature: [
        { name: "bidder",          type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "bidValue",        type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ],
};

const bidSignatureMultiple = {
    BidSignatureMultiple: [
        { name: "bidder",          type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "amount",          type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "bidValue",        type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ],
};

describe("NFTSpace Marketplace", function() {
    let Marketplace;
    let marketplaceContract;
    let SettlementToken;
    let settlementToken;
    let ERC721ForTests;
    let ERC721TokenContract;
    let ERC1155ForTests;
    let ERC1155TokenContract;

    let owner;
    let seller;
    let seller2;
    let buyer;
    let bidder;
    let badActor;
    let beneficiary;
    
    let domain;
    let deadline;

    const tokenId = 10;
    const nonce = 1;
    const settlementPrice = 10000;
    const commission = 100;
    const toBeneficiary = settlementPrice * commission / 1000;
    const toSeller = settlementPrice - toBeneficiary;

    before(async function() {
        [owner, seller, seller2, buyer, bidder, badActor, beneficiary] = await ethers.getSigners();
        Marketplace = await ethers.getContractFactory("Marketplace");

        SettlementToken = await ethers.getContractFactory("SettlementToken");
        ERC1155ForTests = await ethers.getContractFactory("ERC1155ForTests");
        ERC721ForTests = await ethers.getContractFactory("ERC721ForTests");

        print("Owner: " + owner.address);
        print("Seller: " + seller.address);
        print("Seller2: " + seller2.address)
        print("Buyer: " + buyer.address);
        print("Bidder: " + bidder.address);
        print("Bad Actor: " + badActor.address);
        print("Beneficiary: " + beneficiary.address);
    });

    beforeEach(async function() {
        marketplaceContract = await upgrades.deployProxy(Marketplace, { initializer: 'initialize', kind: 'uups' });
        await marketplaceContract.deployed();

        settlementToken = await SettlementToken.deploy();
        await settlementToken.deployed();

        ERC1155TokenContract = await ERC1155ForTests.deploy();
        await ERC1155TokenContract.deployed();

        ERC721TokenContract = await ERC721ForTests.deploy();
        await ERC721TokenContract.deployed();

        const chainId = (await ethers.provider.getNetwork()).chainId;
        domain = getDomain(chainId, marketplaceContract.address);
        deadline = (await time.latest()) + 1000;
    });

    it("Should allow fund manager to set settlement token status", async function() {
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);

        expect(await marketplaceContract.settlementTokenStatusMap(settlementToken.address)).to.equal(true);
    });

    it("Should not allow fund manager to set zero address settlement token status", async function() {
        await expect(marketplaceContract.setSettlementTokenStatus(ethers.constants.AddressZero, true)).to.be.revertedWith("Wrong ERC20 contract: address can't be 0");
    });

    it("Should not allow non-fund-manager to set settlement token status", async function() {
        await expect(marketplaceContract.connect(badActor).setSettlementTokenStatus(settlementToken.address, true)).to.be.revertedWith("Account has no fund manager role");
    });

    it("Should allow fund manager to set marketplace commission", async function() {
        await marketplaceContract.setMarketplaceCommissionPermille(commission);

        expect(await marketplaceContract.marketplaceCommissionPermille()).to.be.equal(commission);
    });

    it("Should not allow non-fund-manager to set marketplace commission", async function() {
        await expect(marketplaceContract.connect(badActor).setMarketplaceCommissionPermille(commission)).to.be.revertedWith("Account has no fund manager role");
    });

    it("Should not allow to set zero commission", async function() {
        await expect(marketplaceContract.setMarketplaceCommissionPermille(0)).to.be.revertedWith("Commission must be greater than 0");
    });

    it("Should allow fund manager to set marketplace commissions beneficiary", async function() {
        await marketplaceContract.setMarketplaceBeneficiary(beneficiary.address);

        expect(await marketplaceContract.marketplaceCommisionBeneficiary()).to.be.equal(beneficiary.address);
    });

    it("Should not allow non-fund-manager to set marketplace commissions beneficiary", async function() {
        await expect(marketplaceContract.connect(badActor).setMarketplaceBeneficiary(beneficiary.address)).to.be.revertedWith("Account has no fund manager role");
    });

    it("Should not allow to set 0 address as a beneficiary", async function() {
        await expect(marketplaceContract.setMarketplaceBeneficiary(ethers.constants.AddressZero)).to.be.revertedWith("Beneficiary can't be 0 address");
    });

    it("Should allow seller to cancel the signed sell message: SellBySig", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(seller).cancelSellSig(sellSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should not allow non seller to cancel the signed sell message: SellBySig", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(badActor).cancelSellSig(sellSig)).to.be.revertedWith("Only message signer can cancel signature");
    });

    it("should not allow to re-cancel the signed message: SellBySig", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(seller).cancelSellSig(sellSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);

        await expect(marketplaceContract.connect(seller).cancelSellSig(sellSig)).to.be.revertedWith("Signature is already cancelled");
    });

    it("Should not allow non signer to cancel the signed message", async function() {
        const value = {
            seller: badActor.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: badActor.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(badActor).cancelSellSig(sellSig)).to.be.revertedWith("Signers mismatch");
    });

    it("Should allow seller to cancel the signed sell message: SellBySigMultiple", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);
        const sellSigMulti = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(seller).cancelSellSigMultiple(sellSigMulti);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow buyer to cancel the signed offer message: OfferSig", async function() {
        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigType, value);
        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(buyer).cancelOfferSig(offerSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow buyer to cancel the signed offer message: OfferSigMultiple", async function() {
        const value = {
            buyer: buyer.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigMultiple, value);
        const offerSigMulti = {
            buyer: buyer.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(buyer).cancelOfferSigMultiple(offerSigMulti);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow auction seller to cancel the signed auction message: SellByAuction", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            minimumBidPrice: settlementPrice,
            reservePrice: settlementPrice,
            expirationDate: deadline,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellByAuction, value);
        const auctionSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            minimumBidPrice: settlementPrice,
            reservePrice: settlementPrice,
            expirationDate: deadline,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(seller).cancelAuctionSig(auctionSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow auction seller to cancel the signed auction message: SellByAuctionMultiple", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            minimumBidPrice: settlementPrice,
            reservePrice: settlementPrice,
            expirationDate: deadline,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellByAuctionMultiple, value);
        const auctionSig = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            minimumBidPrice: settlementPrice,
            reservePrice: settlementPrice,
            expirationDate: deadline,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(seller).cancelAuctionSigMultiple(auctionSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow bidder to cancel the signed bid message: BidSignature", async function() {
        const value = {
            bidder: bidder.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
        };

        const signature = await bidder._signTypedData(domain, bidSignature, value);
        const bidSig = {
            bidder: bidder.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(bidder).cancelBidSig(bidSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow bidder to cancel the signed bid message: BidSignatureMultiple", async function() {
        const value = {
            bidder: bidder.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
        };

        const signature = await bidder._signTypedData(domain, bidSignatureMultiple, value);
        const bidSig = {
            bidder: bidder.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(bidder).cancelBidSigMulti(bidSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow to buy NFT for ERC20 tokens by using a signature", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await settlementToken.transfer(buyer.address, settlementPrice);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await marketplaceContract.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceContract.setMarketplaceBeneficiary(beneficiary.address);
        await settlementToken.connect(buyer).approve(marketplaceContract.address, settlementPrice);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(buyer).buyBySig(sellSig);
        
        expect(await ERC721TokenContract.ownerOf(tokenId)).to.equal(buyer.address);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(toSeller);
        expect(await settlementToken.balanceOf(beneficiary.address)).to.equal(toBeneficiary);
    });

    it("Should allow to buy NFT for ETH by using a signature", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await marketplaceContract.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceContract.setMarketplaceBeneficiary(beneficiary.address);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        const sellerBalance = BigNumber.from(await ethers.provider.getBalance(seller.address));
        const beneficiaryBalance = BigNumber.from(await ethers.provider.getBalance(beneficiary.address));

        await marketplaceContract.connect(buyer).buyBySig(sellSig, {value: settlementPrice});

        const expectedSellerBalance = sellerBalance.add(toSeller);
        const expectedBeneficiaryBalance = beneficiaryBalance.add(toBeneficiary);
        
        expect(await ERC721TokenContract.ownerOf(tokenId)).to.equal(buyer.address);
        expect(await ethers.provider.getBalance(seller.address)).to.equal(expectedSellerBalance);
        expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(expectedBeneficiaryBalance);
    });

    it("Should not allow to buy NFT if signature is cancelled", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };
        
        await marketplaceContract.connect(seller).cancelSellSig(sellSig);
        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("Signature is cancelled");
    });

    it("Should not allow to buy NFT if the ERC721 conract doesn't exist", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ethers.constants.AddressZero,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ethers.constants.AddressZero,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("wrong NFT Collection address");
    });
    
    it("Should not allow to buy NFT if the buyer is the owner of NFT", async function() {
        await ERC721TokenContract.mint(buyer.address, tokenId);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("user is already the owner of this NFT");
    });

    it("Should not allow to buy NFT that doesn't exist", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("Should not allow to buy NFT if the seller is not the token owner", async function() {
        await ERC721TokenContract.mint(badActor.address, tokenId);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("seller is no longer the owner of this NFT");
    });

    it("Should not allow to buy NFT if marketplace is not approved to manage seller's tokens", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("marketplace is not approved as an operator");
    });

    it("Should not allow to buy NFT if the message signer is not the seller in the message", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await badActor._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("seller mismatch");
    });

    it("Should not allow to buy NFT if the buyer did not send money", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("not enough funds");
    });

    it("Should not allow to buy NFT if the settlement token is not approved", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("ERC20 token is not approved as a settlement token");
    });

    it("Should not allow to buy NFT if the marketplace is not approved to spend buyer's ERC20 tokens", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should not allow to buy NFT if buyer has no enough funds", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.connect(buyer).approve(marketplaceContract.address, settlementPrice);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySig, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceContract.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should allow to buy many NFTs for ERC20 tokens by using multiple signatures", async function() {
        const buyAmount = 6;
        const totalPrice = buyAmount * settlementPrice;

        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(buyer.address, totalPrice);
        await settlementToken.connect(buyer).approve(marketplaceContract.address, totalPrice);
        await marketplaceContract.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceContract.setMarketplaceBeneficiary(beneficiary.address);
        
        await ERC1155TokenContract.mint(seller.address, tokenId, 5);
        await ERC1155TokenContract.mint(seller2.address, tokenId, 10);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await ERC1155TokenContract.connect(seller2).setApprovalForAll(marketplaceContract.address, true);

        const value1 = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const value2 = {
            seller: seller2.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 10,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature1 = await seller._signTypedData(domain, sellBySigMultiple, value1);
        const signature2 = await seller2._signTypedData(domain, sellBySigMultiple, value2);

        const sigHash1 = ethers.utils.keccak256(signature1);
        const sigHash2 = ethers.utils.keccak256(signature2);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature1,
        },
        {
            seller: seller2.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 10,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature2,
        }];

        const commissionFromSeller1 = (5 * settlementPrice) * commission / 1000;
        const toSeller1 = (5 * settlementPrice) - commissionFromSeller1;
        const commissionFromSeller2 = settlementPrice * commission / 1000;
        const toSeller2 = settlementPrice - commissionFromSeller2;
        const totalCommission = commissionFromSeller1 + commissionFromSeller2;

        await marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti);

        expect(await ERC1155TokenContract.balanceOf(buyer.address, tokenId)).to.equal(buyAmount);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(toSeller1);
        expect(await settlementToken.balanceOf(seller2.address)).to.equal(toSeller2);
        expect(await settlementToken.balanceOf(beneficiary.address)).to.equal(totalCommission);
        expect(await marketplaceContract.sigCancelledMap(sigHash1)).to.be.equal(true);
        expect(await marketplaceContract.sigCancelledMap(sigHash2)).to.be.equal(false);
        expect(await marketplaceContract.fullySpendERC1155(sigHash1)).to.be.equal(true);
        expect(await marketplaceContract.amountAvailableErc1155(sigHash2)).to.be.equal(9);
    });

    it("Should allow to buy many NFTs for ETH by using multiple signatures", async function() {
        const buyAmount = 6;
        const totalPrice = buyAmount * settlementPrice;

        await marketplaceContract.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceContract.setMarketplaceBeneficiary(beneficiary.address);

        await ERC1155TokenContract.mint(seller.address, tokenId, 5);
        await ERC1155TokenContract.mint(seller2.address, tokenId, 10);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await ERC1155TokenContract.connect(seller2).setApprovalForAll(marketplaceContract.address, true);

        const value1 = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const value2 = {
            seller: seller2.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 10,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature1 = await seller._signTypedData(domain, sellBySigMultiple, value1);
        const signature2 = await seller2._signTypedData(domain, sellBySigMultiple, value2);

        const sigHash1 = ethers.utils.keccak256(signature1);
        const sigHash2 = ethers.utils.keccak256(signature2);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature1,
        },
        {
            seller: seller2.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 10,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature2,
        }];

        const seller1Balance = BigNumber.from(await ethers.provider.getBalance(seller.address));
        const seller2Balance = BigNumber.from(await ethers.provider.getBalance(seller2.address));
        const beneficiaryBalance = BigNumber.from(await ethers.provider.getBalance(beneficiary.address));

        const commissionFromSeller1 = (5 * settlementPrice) * commission / 1000;
        const toSeller1 = (5 * settlementPrice) - commissionFromSeller1;
        const commissionFromSeller2 = settlementPrice * commission / 1000;
        const toSeller2 = settlementPrice - commissionFromSeller2;
        const totalCommission = commissionFromSeller1 + commissionFromSeller2;

        const expectedSeller1Balance = seller1Balance.add(toSeller1);
        const expectedSeller2Balance = seller2Balance.add(toSeller2);
        const expectedBeneficiaryBalance = beneficiaryBalance.add(totalCommission);

        await marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti, {value: totalPrice});

        expect(await ERC1155TokenContract.balanceOf(buyer.address, tokenId)).to.equal(buyAmount);
        expect(await marketplaceContract.sigCancelledMap(sigHash1)).to.be.equal(true);
        expect(await marketplaceContract.sigCancelledMap(sigHash2)).to.be.equal(false);
        expect(await marketplaceContract.fullySpendERC1155(sigHash1)).to.be.equal(true);
        expect(await marketplaceContract.amountAvailableErc1155(sigHash2)).to.be.equal(9);
        expect(await ethers.provider.getBalance(seller.address)).to.equal(expectedSeller1Balance);
        expect(await ethers.provider.getBalance(seller2.address)).to.equal(expectedSeller2Balance);
        expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(expectedBeneficiaryBalance);
    });

    it("Should not allow buying less than one token", async function() {
        const sellSigMulti = []

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, 0, sellSigMulti)).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should not allow buying without signatures", async function() {
        const sellSigMulti = []

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, 1, sellSigMulti)).to.be.revertedWith("Signatures are empty");
    });

    it("Should not allow buying NFT if the provided ERC1155 contract is address zero", async function() {
        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        }];

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ethers.constants.AddressZero, 1, sellSigMulti)).to.be.revertedWith("wrong NFT Collection address");
    });
    
    it("Should not allow buying NFT if the buyer doesn't send enough ETH", async function() {
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        const buyAmount = 5;

        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        }];

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.revertedWith("Insufficient funds");
    });

    it("Should not allow buying NFT for ERC20 tokens if the settlement token is not approved", async function() {
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        const buyAmount = 5;

        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        }];

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.revertedWith("ERC20 token not approved as a settlement token");
    });

    it("Should not allow buying NFT if the marketplace is not approved to spend buyer's ERC20 tokens", async function() {
        const buyAmount = 5;
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        }];

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.revertedWith("ERC20: insufficient allowance");
    });
    
    it("Should not allow buying NFT if the buyer doesn't have enough ERC20 tokens", async function() {
        const buyAmount = 5;
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.connect(buyer).approve(marketplaceContract.address, buyAmount * settlementPrice);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        }];

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should not allow buying NFT if the provided signatures don't have enough tokens", async function() {
        const buyAmount = 6;
        const totalPrice = buyAmount * settlementPrice

        await ERC1155TokenContract.mint(seller.address, tokenId, 5);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.connect(buyer).approve(marketplaceContract.address, totalPrice);
        await settlementToken.transfer(buyer.address, totalPrice);

        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        }];

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.revertedWith("Something went wrong: make sure the signatures have enough available tokens and the marketplace is approved to manage them.");
    });

    it("Should not allow buying NFT if the marketplace is not approved to manage them", async function() {
        const buyAmount = 5;

        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        }];

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.
        revertedWith("Something went wrong: make sure the signatures have enough available tokens and the marketplace is approved to manage them.");
    });

    it("Should not allow buying NFT if the signatures are cancelled", async function() {
        const buyAmount = 5;

        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, sellBySigMultiple, value);
        const sellSigMulti = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceContract.connect(seller).cancelSellSigMultiple(sellSigMulti);
        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, [sellSigMulti])).to.be.
        revertedWith("Something went wrong: make sure the signatures have enough available tokens and the marketplace is approved to manage them.");
    });

    it("Should not allow buying NFT by using multiple signatures if the message signer is not the seller in the message", async function() {
        const buyAmount = 5;

        const value = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };
        const signature = await badActor._signTypedData(domain, sellBySigMultiple, value);

        const sellSigMulti = [{
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: 5,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        }];

        await expect(marketplaceContract.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.
        revertedWith("Something went wrong: make sure the signatures have enough available tokens and the marketplace is approved to manage them.");
    });

    it("Should allow accepting offer by using acceptOfferSig", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(buyer.address, settlementPrice);
        await settlementToken.connect(buyer).approve(marketplaceContract.address, settlementPrice);

        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigType, value);
        const sigHash = ethers.utils.keccak256(signature);

        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };
        await marketplaceContract.connect(seller).acceptOfferSig(offerSig);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(settlementPrice);
        expect(await ERC721TokenContract.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("Should not allow accepting offer by using acceptOfferSig if the signature is canceled", async function() {
        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigType, value);
        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };
        
        await marketplaceContract.connect(buyer).cancelOfferSig(offerSig);
        await expect(marketplaceContract.connect(seller).acceptOfferSig(offerSig)).to.be.revertedWith("Signature is cancelled");
    });

    it("Should not allow users to accept their own offers", async function() {
        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigType, value);
        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };
        
        await expect(marketplaceContract.connect(buyer).acceptOfferSig(offerSig)).to.be.revertedWith("user cannot accept their own offer");
    });

    it("Should not allow to accept an offer if the buyer is already the owner of the NFT", async function() {
        await ERC721TokenContract.mint(buyer.address, tokenId);

        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigType, value);
        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };
        
        await expect(marketplaceContract.connect(seller).acceptOfferSig(offerSig)).to.be.revertedWith("Buyer is already the owner of this NFT");
    });

    it("Should not allow to accept an offer if the user is not the owner of the NFT", async function() {
        await ERC721TokenContract.mint(badActor.address, tokenId);

        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigType, value);
        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };
        
        await expect(marketplaceContract.connect(seller).acceptOfferSig(offerSig)).to.be.revertedWith("User is not the owner of this NFT");
    });

    it ("Should not allow to accept an offer if the marketplace is not approved to manage the user's tokens", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);

        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigType, value);
        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };
        
        await expect(marketplaceContract.connect(seller).acceptOfferSig(offerSig)).to.be.revertedWith("Marketplace is not approved to manage the user's tokens");
    });

    it("Should not allow to accept an offer if the message signer is not the buyer in the message", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);

        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await badActor._signTypedData(domain, offerSigType, value);
        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };
        
        await expect(marketplaceContract.connect(seller).acceptOfferSig(offerSig)).to.be.revertedWith("buyer mismatch");
    });

    it("Should allow accepting multiple offers by using acceptOfferSigMulti", async function() {
        const amount = 5;
        await ERC1155TokenContract.mint(seller.address, tokenId, amount);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(buyer.address, settlementPrice);
        await settlementToken.connect(buyer).approve(marketplaceContract.address, settlementPrice);

        const value = {
            buyer: buyer.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: amount,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, offerSigMultiple, value);
        const sigHash = ethers.utils.keccak256(signature);

        const offerSig = {
            buyer: buyer.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: amount,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
            signature: signature,
        };
        await marketplaceContract.connect(seller).acceptOfferSigMulti(offerSig);

        expect(await marketplaceContract.sigCancelledMap(sigHash)).to.equal(true);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(settlementPrice);
        expect(await settlementToken.balanceOf(buyer.address)).to.equal(0);
        expect(await ERC1155TokenContract.balanceOf(buyer.address, tokenId)).to.equal(amount);
        expect(await ERC1155TokenContract.balanceOf(seller.address, tokenId)).to.equal(0);
    });

    it("Should allow accepting auction bid by using acceptBid", async function() {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(bidder.address, settlementPrice);
        await settlementToken.connect(bidder).approve(marketplaceContract.address, settlementPrice);

        const valueAuction = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            minimumBidPrice: settlementPrice,
            reservePrice: settlementPrice,
            expirationDate: deadline,
            nonce: nonce,
        };

        const valueBid = {
            bidder: bidder.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
        };

        const signatureAuction = await seller._signTypedData(domain, sellByAuction, valueAuction);
        const signatureBid = await bidder._signTypedData(domain, bidSignature, valueBid);

        const auctionSigHash = ethers.utils.keccak256(signatureAuction);
        const bidSigHash = ethers.utils.keccak256(signatureBid);

        const auctionSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            minimumBidPrice: settlementPrice,
            reservePrice: settlementPrice,
            expirationDate: deadline,
            nonce: nonce,
            signature: signatureAuction,
        };

        const bidSig = {
            bidder: bidder.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
            signature: signatureBid,
        };

        await time.increaseTo(deadline + 1);
        await marketplaceContract.acceptBid(bidSig, auctionSig);

        expect(await marketplaceContract.sigCancelledMap(bidSigHash)).to.equal(true);
        expect(await marketplaceContract.sigCancelledMap(auctionSigHash)).to.equal(true);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(settlementPrice);
        expect(await settlementToken.balanceOf(bidder.address)).to.equal(0);
        expect(await ERC721TokenContract.ownerOf(tokenId)).to.equal(bidder.address);
    });

    it("Should allow accepting auction bids by using acceptBidMultiple", async function() {
        const amount = 5;
        await ERC1155TokenContract.mint(seller.address, tokenId, amount);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceContract.address, true);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(bidder.address, settlementPrice);
        await settlementToken.connect(bidder).approve(marketplaceContract.address, settlementPrice);

        const valueAuction = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: amount,
            settlementToken: settlementToken.address,
            minimumBidPrice: settlementPrice,
            reservePrice: settlementPrice,
            expirationDate: deadline,
            nonce: nonce,
        };

        const valueBid = {
            bidder: bidder.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: amount,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
        };

        const signatureAuction = await seller._signTypedData(domain, sellByAuctionMultiple, valueAuction);
        const signatureBid = await bidder._signTypedData(domain, bidSignatureMultiple, valueBid);

        const auctionSigHash = ethers.utils.keccak256(signatureAuction);
        const bidSigHash = ethers.utils.keccak256(signatureBid);

        const auctionSig = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: amount,
            settlementToken: settlementToken.address,
            minimumBidPrice: settlementPrice,
            reservePrice: settlementPrice,
            expirationDate: deadline,
            nonce: nonce,
            signature: signatureAuction,
        };

        const bidSig = {
            bidder: bidder.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            amount: amount,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
            signature: signatureBid,
        };

        await time.increaseTo(deadline + 1);
        await marketplaceContract.acceptBidMultiple(bidSig, auctionSig);

        expect(await marketplaceContract.sigCancelledMap(bidSigHash)).to.equal(true);
        expect(await marketplaceContract.sigCancelledMap(auctionSigHash)).to.equal(true);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(settlementPrice);
        expect(await settlementToken.balanceOf(bidder.address)).to.equal(0);
        expect(await ERC1155TokenContract.balanceOf(bidder.address, tokenId)).to.equal(amount);
        expect(await ERC1155TokenContract.balanceOf(seller.address, tokenId)).to.equal(0);
    });

    it("Should allow to mint and buy using signature", async function() {
        const rentingProtocol = await deployRentingProtocol();
        const nftCollection = await deployNFTCollection(rentingProtocol.address, owner.address, beneficiary.address);
        const adminRole = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.grantRole(adminRole, seller.address);
        await nftCollection.connect(seller).setApprovalForAll(marketplaceContract.address, true);
    
        const mintMessage = {
            from: seller.address,
            tokenId: tokenId,
            nonce: nonce    
        };

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const nftCollectionDomain = getNFTCollectionDomain(chainId, nftCollection.address);
        const mintSignature = await seller._signTypedData(nftCollectionDomain, types, mintMessage);

        const mintSig = {
            from: seller.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: mintSignature,
        };

        await settlementToken.transfer(buyer.address, settlementPrice);
        await marketplaceContract.setSettlementTokenStatus(settlementToken.address, true);
        await marketplaceContract.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceContract.setMarketplaceBeneficiary(beneficiary.address);
        await settlementToken.connect(buyer).approve(marketplaceContract.address, settlementPrice);

        const buyMessage = {
            seller: seller.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const buySignature = await seller._signTypedData(domain, sellBySig, buyMessage);

        const buySig = {
            seller: seller.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: buySignature,
        };

        await marketplaceContract.connect(buyer).mintWithSignatureAndBuyBySig(mintSig, buySig);
        expect(await nftCollection.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("Should not allow to mint and buy with signatures if provided token contract doesn't support ERC721 interface", async function() {
        const mintMessage = {
            from: seller.address,
            tokenId: tokenId,
            nonce: nonce    
        };

        const mintSignature = await seller._signTypedData(domain, types, mintMessage);
        const mintSig = {
            from: seller.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: mintSignature,
        };

        const buyMessage = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const buySignature = await seller._signTypedData(domain, sellBySig, buyMessage);
        const buySig = {
            seller: seller.address,
            tokenContract: ERC1155TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: buySignature,
        };

        await expect(marketplaceContract.connect(buyer).mintWithSignatureAndBuyBySig(mintSig, buySig)).to.be.revertedWith("wrong NFT Collection address");
    });
});