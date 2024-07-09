const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DOMAIN_NAME = "NFTSpace Marketplace";
const DOMAIN_VERSION = "0.0.1"

const tokenId = 10;
const nonce = 1;
const settlementPrice = 10000;
const commission = 100;
const toBeneficiary = settlementPrice * commission / 1000;
const toSeller = settlementPrice - toBeneficiary;

const SellType = {
    SellSignature: [
        { name: "seller",          type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "settlementPrice", type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ]
};

const OfferType = {
    OfferSignature: [
        { name: "buyer",           type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "settlementPrice", type: "uint256" },
        { name: "deadline",        type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ]
};

const SellAuctionType = {
    AuctionSignature: [
        { name: "seller",          type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "minimumBidPrice", type: "uint256" },
        { name: "reservePrice",    type: "uint256" },
        { name: "expirationDate",  type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ]
};

const BidType = {
    BidSignature: [
        { name: "bidder",          type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "bidValue",        type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ]
};

const MintType = {
    SignedMint: [
        { name: "from",            type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ]
};

async function deployRentingProtocol() {
    const NFTRenting = await ethers.getContractFactory("NFTRenting");
    const rentingProtocol = await upgrades.deployProxy(NFTRenting, { initializer: 'initialize', kind: 'uups' });

    return rentingProtocol;
};

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
};

function getNFTCollectionDomain(chainId, contractAddress) {
    return {
        name: "NFT Collection",
        version: "0.0.1",
        chainId: chainId,
        verifyingContract: contractAddress
    }
};

let MarketplaceBase;
let marketplaceBase;

let SettlementToken;
let settlementToken;
let ERC721ForTests;
let ERC721TokenContract;

let owner;
let seller;
let seller2;
let buyer;
let bidder;
let badActor;
let beneficiary;

let domain;
let deadline;


describe("Marketplace Base contract", async () => {
    before(async () => {
        MarketplaceBase = await ethers.getContractFactory("MarketplaceBase");
        
        SettlementToken = await ethers.getContractFactory("SettlementToken");
        ERC721ForTests = await ethers.getContractFactory("ERC721ForTests");
    
        [owner, seller, seller2, buyer, bidder, badActor, beneficiary] = await ethers.getSigners();
    
        console.log("Owner: " + owner.address);
        console.log("Seller: " + seller.address);
        console.log("Seller2: " + seller2.address)
        console.log("Buyer: " + buyer.address);
        console.log("Bidder: " + bidder.address);
        console.log("Bad Actor: " + badActor.address);
        console.log("Beneficiary: " + beneficiary.address);
    });
    
    beforeEach(async () => {
        marketplaceBase = await upgrades.deployProxy(MarketplaceBase, [], { initializer: "initialize", kind: "uups" });
        await marketplaceBase.deployed();
    
        settlementToken = await SettlementToken.deploy();
        await settlementToken.deployed();
    
        ERC721TokenContract = await ERC721ForTests.deploy();
        await ERC721TokenContract.deployed();
    
        const chainId = (await ethers.provider.getNetwork()).chainId;
        domain = {
            name: DOMAIN_NAME,
            version: DOMAIN_VERSION,
            chainId: chainId,
            verifyingContract: marketplaceBase.address
        };
    
        deadline = (await ethers.provider.getBlock('latest')).timestamp + 1000;
    });
    
    it("Should allow fund manager to set settlement token", async () => {
        await marketplaceBase.setSettlementTokenStatus(settlementToken.address, true);

        expect(await marketplaceBase.settlementTokenStatusMap(settlementToken.address)).to.equal(true);
    });

    it("Should not allow non fund manager to set settlement token", async () => {
        await expect(marketplaceBase.connect(badActor).setSettlementTokenStatus(settlementToken.address, true)).to.be.reverted;
    });

    it("Should not allow to provide address zero as the settlement token address", async () => {
        await expect(marketplaceBase.setSettlementTokenStatus(ethers.constants.AddressZero, true)).to.be.reverted;
    });

    it("Should allow fund manager to set commission permille", async () => {
        await marketplaceBase.setMarketplaceCommissionPermille(100);

        expect(await marketplaceBase.marketplaceCommissionPermille()).to.equal(ethers.BigNumber.from(100));
    });

    it("Should not allow non fun manager to set commission permille", async () => {
        await expect(marketplaceBase.connect(badActor).setMarketplaceCommissionPermille(100)).to.be.reverted;
    });

    it("Should not allow to set 0 commission permille", async () => {
        await expect(marketplaceBase.setMarketplaceCommissionPermille(0)).to.be.reverted;
    });

    it("Should not allow to set commission permille higher than 500", async () => {
        await expect(marketplaceBase.setMarketplaceCommissionPermille(600)).to.be.reverted;
    });

    it("Should allow fund manager to set beneficiary", async () => {
        await marketplaceBase.setMarketplaceBeneficiary(beneficiary.address);

        expect(await marketplaceBase.marketplaceCommissionBeneficiary()).to.equal(beneficiary.address);
    });

    it("Should not allow non funding manager to set beneficiary", async () => {
        await expect(marketplaceBase.connect(badActor).setMarketplaceBeneficiary(beneficiary.address)).to.be.reverted;
    });

    it("Should not allow to provide address zero as the beneficiary", async () => {
        await expect(marketplaceBase.setMarketplaceBeneficiary(ethers.constants.AddressZero)).to.be.reverted;
    });

    it("Should allow seller to cancel the signed sell message: SellBySig", async () => {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceBase.connect(seller).cancelSellSig(sellSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceBase.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should not allow non seller to cancel the signed sell message: SellBySig", async () => {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(badActor).cancelSellSig(sellSig)).to.be.reverted;
    });

    it("should not allow to re-cancel the cancelled message: SellBySig", async () => {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceBase.connect(seller).cancelSellSig(sellSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceBase.sigCancelledMap(sigHash)).to.equal(true);

        await expect(marketplaceBase.connect(seller).cancelSellSig(sellSig)).to.be.reverted;
    });

    it("Should not allow non signer to cancel the signed message", async () => {
        const value = {
            seller: badActor.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: badActor.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(badActor).cancelSellSig(sellSig)).to.be.reverted;
    });

    it("Should allow buyer to cancel the signed offer message: OfferSig", async () => {
        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, OfferType, value);
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

        await marketplaceBase.connect(buyer).cancelOfferSig(offerSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceBase.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow auction seller to cancel the signed auction message: SellByAuction", async () => {
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

        const signature = await seller._signTypedData(domain, SellAuctionType, value);
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

        await marketplaceBase.connect(seller).cancelAuctionSig(auctionSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceBase.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow bidder to cancel the signed bid message: BidSignature", async () => {
        const value = {
            bidder: bidder.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
        };

        const signature = await bidder._signTypedData(domain, BidType, value);
        const bidSig = {
            bidder: bidder.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            bidValue: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceBase.connect(bidder).cancelBidSig(bidSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceBase.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow to buy NFT for ERC20 tokens by using a signature", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);
        await settlementToken.transfer(buyer.address, settlementPrice);
        await marketplaceBase.setSettlementTokenStatus(settlementToken.address, true);
        await marketplaceBase.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceBase.setMarketplaceBeneficiary(beneficiary.address);
        await settlementToken.connect(buyer).approve(marketplaceBase.address, settlementPrice);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await marketplaceBase.connect(buyer).buyBySig(sellSig);
        
        expect(await ERC721TokenContract.ownerOf(tokenId)).to.equal(buyer.address);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(toSeller);
        expect(await settlementToken.balanceOf(beneficiary.address)).to.equal(toBeneficiary);
    });

    it("Should allow to buy NFT for native tokens by using a signature", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);
        await marketplaceBase.setSettlementTokenStatus(settlementToken.address, true);
        await marketplaceBase.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceBase.setMarketplaceBeneficiary(beneficiary.address);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        const sellerBalance = ethers.BigNumber.from(await ethers.provider.getBalance(seller.address));
        const beneficiaryBalance = ethers.BigNumber.from(await ethers.provider.getBalance(beneficiary.address));

        await marketplaceBase.connect(buyer).buyBySig(sellSig, {value: settlementPrice});

        const expectedSellerBalance = sellerBalance.add(toSeller);
        const expectedBeneficiaryBalance = beneficiaryBalance.add(toBeneficiary);
        
        expect(await ERC721TokenContract.ownerOf(tokenId)).to.equal(buyer.address);
        expect(await ethers.provider.getBalance(seller.address)).to.equal(expectedSellerBalance);
        expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(expectedBeneficiaryBalance);
    });

    it("Should not allow to buy NFT if signature is cancelled", async () => {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };
        
        await marketplaceBase.connect(seller).cancelSellSig(sellSig);
        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.reverted;
    });

    it("Should not allow to buy NFT if the ERC721 conract doesn't exist", async () => {
        const value = {
            seller: seller.address,
            tokenContract: ethers.constants.AddressZero,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ethers.constants.AddressZero,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.reverted;
    });
    
    it("Should not allow to buy NFT if the buyer is the owner of NFT", async () => {
        await ERC721TokenContract.mint(buyer.address, tokenId);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.reverted;
    });

    it("Should not allow to buy NFT that doesn't exist", async () => {
        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("Should not allow to buy NFT if the seller is not the token owner", async () => {
        await ERC721TokenContract.mint(badActor.address, tokenId);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.reverted;
    });

    it("Should not allow to buy NFT if marketplace is not approved to manage seller's tokens", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.reverted;
    });

    it("Should not allow to buy NFT if the message signer is not the seller in the message", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await badActor._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.reverted;
    });

    it("Should not allow to buy NFT if the buyer did not send money", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: ethers.constants.AddressZero,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.reverted;
    });

    it("Should not allow to buy NFT if the settlement token is not approved", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.reverted;
    });

    it("Should not allow to buy NFT if the marketplace is not approved to spend buyer's ERC20 tokens", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);
        await marketplaceBase.setSettlementTokenStatus(settlementToken.address, true);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should not allow to buy NFT if buyer has no enough funds", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);
        await marketplaceBase.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.connect(buyer).approve(marketplaceBase.address, settlementPrice);

        const value = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSig = {
            seller: seller.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: signature,
        };

        await expect(marketplaceBase.connect(buyer).buyBySig(sellSig)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should allow accepting offer by using acceptOfferSig", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);
        await marketplaceBase.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(buyer.address, settlementPrice);
        await settlementToken.connect(buyer).approve(marketplaceBase.address, settlementPrice);

        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, OfferType, value);
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
        await marketplaceBase.connect(seller).acceptOfferSig(offerSig);

        expect(await marketplaceBase.sigCancelledMap(sigHash)).to.equal(true);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(settlementPrice);
        expect(await ERC721TokenContract.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("Should not allow accepting offer by using acceptOfferSig if the signature is canceled", async () => {
        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, OfferType, value);
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
        
        await marketplaceBase.connect(buyer).cancelOfferSig(offerSig);
        await expect(marketplaceBase.connect(seller).acceptOfferSig(offerSig)).to.be.reverted;
    });

    it("Should not allow users to accept their own offers", async () => {
        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await buyer._signTypedData(domain, OfferType, value);
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
        
        await expect(marketplaceBase.connect(buyer).acceptOfferSig(offerSig)).to.be.reverted;
    });

    it("Should not allow to accept an offer if the buyer is already the owner of the NFT", async () => {
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

        const signature = await buyer._signTypedData(domain, OfferType, value);
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
        
        await expect(marketplaceBase.connect(seller).acceptOfferSig(offerSig)).to.be.reverted;
    });

    it("Should not allow to accept an offer if the user is not the owner of the NFT", async () => {
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

        const signature = await buyer._signTypedData(domain, OfferType, value);
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
        
        await expect(marketplaceBase.connect(seller).acceptOfferSig(offerSig)).to.be.reverted;
    });

    it ("Should not allow to accept an offer if the marketplace is not approved to manage the user's tokens", async () => {
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

        const signature = await buyer._signTypedData(domain, OfferType, value);
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
        
        await expect(marketplaceBase.connect(seller).acceptOfferSig(offerSig)).to.be.reverted;
    });

    it("Should not allow to accept an offer if the message signer is not the buyer in the message", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);

        const value = {
            buyer: buyer.address,
            tokenContract: ERC721TokenContract.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            deadline: deadline,
            nonce: nonce,
        };

        const signature = await badActor._signTypedData(domain, OfferType, value);
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
        
        await expect(marketplaceBase.connect(seller).acceptOfferSig(offerSig)).to.be.reverted;
    });

    it("Should allow accepting auction bid by using acceptBid", async () => {
        await ERC721TokenContract.mint(seller.address, tokenId);
        await ERC721TokenContract.connect(seller).setApprovalForAll(marketplaceBase.address, true);
        await marketplaceBase.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(bidder.address, settlementPrice);
        await settlementToken.connect(bidder).approve(marketplaceBase.address, settlementPrice);

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

        const signatureAuction = await seller._signTypedData(domain, SellAuctionType, valueAuction);
        const signatureBid = await bidder._signTypedData(domain, BidType, valueBid);

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
        await marketplaceBase.acceptBid(bidSig, auctionSig);

        expect(await marketplaceBase.sigCancelledMap(bidSigHash)).to.equal(true);
        expect(await marketplaceBase.sigCancelledMap(auctionSigHash)).to.equal(true);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(settlementPrice);
        expect(await settlementToken.balanceOf(bidder.address)).to.equal(0);
        expect(await ERC721TokenContract.ownerOf(tokenId)).to.equal(bidder.address);
    });

    it("Should allow to mint and buy using signature", async () => {
        const rentingProtocol = await deployRentingProtocol();
        const nftCollection = await deployNFTCollection(rentingProtocol.address, owner.address, beneficiary.address);
        const adminRole = await nftCollection.DEFAULT_ADMIN_ROLE();
        await nftCollection.grantRole(adminRole, seller.address);
        await nftCollection.connect(seller).setApprovalForAll(marketplaceBase.address, true);
    
        const mintMessage = {
            from: seller.address,
            tokenId: tokenId,
            nonce: nonce    
        };

        const chainId = (await ethers.provider.getNetwork()).chainId;
        const nftCollectionDomain = getNFTCollectionDomain(chainId, nftCollection.address);
        const mintSignature = await seller._signTypedData(nftCollectionDomain, MintType, mintMessage);

        const mintSig = {
            from: seller.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: mintSignature,
        };

        await settlementToken.transfer(buyer.address, settlementPrice);
        await marketplaceBase.setSettlementTokenStatus(settlementToken.address, true);
        await marketplaceBase.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceBase.setMarketplaceBeneficiary(beneficiary.address);
        await settlementToken.connect(buyer).approve(marketplaceBase.address, settlementPrice);

        const buyMessage = {
            seller: seller.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const buySignature = await seller._signTypedData(domain, SellType, buyMessage);

        const buySig = {
            seller: seller.address,
            tokenContract: nftCollection.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: buySignature,
        };

        await marketplaceBase.connect(buyer).mintWithSignatureAndBuyBySig(mintSig, buySig);
        expect(await nftCollection.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("Should not allow to mint and buy with signatures if provided token contract doesn't support ERC721 interface", async () => {
        const mintMessage = {
            from: seller.address,
            tokenId: tokenId,
            nonce: nonce    
        };

        const mintSignature = await seller._signTypedData(domain, MintType, mintMessage);
        const mintSig = {
            from: seller.address,
            tokenId: tokenId,
            nonce: nonce,
            signature: mintSignature,
        };

        const buyMessage = {
            seller: seller.address,
            tokenContract: settlementToken.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
        };

        const buySignature = await seller._signTypedData(domain, SellType, buyMessage);
        const buySig = {
            seller: seller.address,
            tokenContract: settlementToken.address,
            tokenId: tokenId,
            settlementToken: settlementToken.address,
            settlementPrice: settlementPrice,
            nonce: nonce,
            signature: buySignature,
        };

        await expect(marketplaceBase.connect(buyer).mintWithSignatureAndBuyBySig(mintSig, buySig)).to.be.reverted;
    });
});