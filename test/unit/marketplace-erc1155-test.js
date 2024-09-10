const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DOMAIN_NAME = "NFTSpace Marketplace";
const DOMAIN_VERSION = "0.0.1";

const tokenId = 10;
const nonce = 1;
const settlementPrice = 10000;
const commission = 100;
const toBeneficiary = settlementPrice * commission / 1000;
const toSeller = settlementPrice - toBeneficiary;

const SellType = {
    SellSigMultiple: [
        { name: "sellSig",         type: "SellSignature" },
        { name: "amount",          type: "uint256" },
    ],
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
    OfferSigMultiple: [
        { name: "offerSig",        type: "OfferSignature" },
        { name: "amount",          type: "uint256" },
    ],
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
    AuctionSignatureMultiple: [
        { name: "auctionSig",      type: "AuctionSignature" },
        { name: "amount",          type: "uint256" },
    ],
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
    BidSignatureMultiple: [
        { name: "bidSig",          type: "BidSignature" },
        { name: "amount",          type: "uint256" },
    ],
    BidSignature: [
        { name: "bidder",          type: "address" },
        { name: "tokenContract",   type: "address" },
        { name: "tokenId",         type: "uint256" },
        { name: "settlementToken", type: "address" },
        { name: "bidValue",        type: "uint256" },
        { name: "nonce",           type: "uint256" },
    ]
};

let MarketplaceERC1155;
let marketplaceERC1155;

let SettlementToken;
let settlementToken;
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

describe("Marketplace ERC1155 contract", async () => {
    before(async () => {
        MarketplaceERC1155 = await ethers.getContractFactory("MarketplaceERC1155");
        
        SettlementToken = await ethers.getContractFactory("SettlementToken");
        ERC1155ForTests = await ethers.getContractFactory("ERC1155ForTests");
    
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
        marketplaceERC1155 = await upgrades.deployProxy(MarketplaceERC1155, [], { initializer: "initMarketplaceERC1155", kind: "uups" });
        await marketplaceERC1155.deployed();
    
        settlementToken = await SettlementToken.deploy();
        await settlementToken.deployed();
    
        ERC1155TokenContract = await ERC1155ForTests.deploy();
        await ERC1155TokenContract.deployed();
    
        const chainId = (await ethers.provider.getNetwork()).chainId;
        domain = {
            name: DOMAIN_NAME,
            version: DOMAIN_VERSION,
            chainId: chainId,
            verifyingContract: marketplaceERC1155.address
        };
    
        deadline = (await ethers.provider.getBlock('latest')).timestamp + 1000;
    });
    
    it("Should allow seller to cancel the signed sell message: SellBySigMultiple", async () => {
        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,    
            },
            amount: 5,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSigMulti = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature,
            },
            amount: 5,
        };

        await marketplaceERC1155.connect(seller).cancelSellSigMultiple(sellSigMulti);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceERC1155.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow buyer to cancel the signed offer message: OfferSigMultiple", async () => {
        const value = {
            offerSig: {
                buyer: buyer.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                deadline: deadline,
                nonce: nonce,    
            },
            amount: 5,
        };

        const signature = await buyer._signTypedData(domain, OfferType, value);
        const offerSigMulti = {
            offerSig: {
                buyer: buyer.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                deadline: deadline,
                nonce: nonce,
                signature: signature, 
            },
            amount: 5,
        };

        await marketplaceERC1155.connect(buyer).cancelOfferSigMultiple(offerSigMulti);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceERC1155.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow auction seller to cancel the signed auction message: SellByAuctionMultiple", async () => {
        const value = {
            auctionSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                minimumBidPrice: settlementPrice,
                reservePrice: settlementPrice,
                expirationDate: deadline,
                nonce: nonce,    
            },
            amount: 5,
        };

        const signature = await seller._signTypedData(domain, SellAuctionType, value);
        const auctionSig = {
            auctionSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                minimumBidPrice: settlementPrice,
                reservePrice: settlementPrice,
                expirationDate: deadline,
                nonce: nonce,
                signature: signature, 
            },
            amount: 5,
        };

        await marketplaceERC1155.connect(seller).cancelAuctionSigMultiple(auctionSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceERC1155.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow bidder to cancel the signed bid message: BidSignatureMultiple", async () => {
        const value = {
            bidSig: {
                bidder: bidder.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                bidValue: settlementPrice,
                nonce: nonce,     
            },
            amount: 5,
        };

        const signature = await bidder._signTypedData(domain, BidType, value);
        const bidSig = {
            bidSig: {
                bidder: bidder.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                bidValue: settlementPrice,
                nonce: nonce,
                signature: signature, 
            },
            amount: 5,
        };

        await marketplaceERC1155.connect(bidder).cancelBidSigMulti(bidSig);
        const sigHash = ethers.utils.keccak256(signature);

        expect(await marketplaceERC1155.sigCancelledMap(sigHash)).to.equal(true);
    });

    it("Should allow to buy many NFTs for ERC20 tokens by using multiple signatures", async () => {
        const buyAmount = 6;
        const totalPrice = buyAmount * settlementPrice;

        await marketplaceERC1155.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(buyer.address, totalPrice);
        await settlementToken.connect(buyer).approve(marketplaceERC1155.address, totalPrice);
        await marketplaceERC1155.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceERC1155.setMarketplaceBeneficiary(beneficiary.address);
        
        await ERC1155TokenContract.mint(seller.address, tokenId, 5);
        await ERC1155TokenContract.mint(seller2.address, tokenId, 10);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);
        await ERC1155TokenContract.connect(seller2).setApprovalForAll(marketplaceERC1155.address, true);

        const value1 = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,     
            },
            amount: 5,
        };
        const value2 = {
            sellSig: {
                seller: seller2.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,      
            },
            amount: 10,
        };

        const signature1 = await seller._signTypedData(domain, SellType, value1);
        const signature2 = await seller2._signTypedData(domain, SellType, value2);

        const sigHash1 = ethers.utils.keccak256(signature1);
        const sigHash2 = ethers.utils.keccak256(signature2);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature1,  
            },
            amount: 5,
        },
        {
            sellSig: {
                seller: seller2.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature2,  
            },
            amount: 10,
        }];

        const commissionFromSeller1 = (5 * settlementPrice) * commission / 1000;
        const toSeller1 = (5 * settlementPrice) - commissionFromSeller1;
        const commissionFromSeller2 = settlementPrice * commission / 1000;
        const toSeller2 = settlementPrice - commissionFromSeller2;
        const totalCommission = commissionFromSeller1 + commissionFromSeller2;

        await marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti);

        expect(await ERC1155TokenContract.balanceOf(buyer.address, tokenId)).to.equal(buyAmount);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(toSeller1);
        expect(await settlementToken.balanceOf(seller2.address)).to.equal(toSeller2);
        expect(await settlementToken.balanceOf(beneficiary.address)).to.equal(totalCommission);
        expect(await marketplaceERC1155.sigCancelledMap(sigHash1)).to.be.equal(true);
        expect(await marketplaceERC1155.sigCancelledMap(sigHash2)).to.be.equal(false);
        expect(await marketplaceERC1155.fullySpendERC1155(sigHash1)).to.be.equal(true);
        expect(await marketplaceERC1155.amountAvailableErc1155(sigHash2)).to.be.equal(9);
    });

    it("Should allow to buy many NFTs for native token by using multiple signatures", async () => {
        const buyAmount = 6;
        const totalPrice = buyAmount * settlementPrice;

        await marketplaceERC1155.setMarketplaceCommissionPermille(commission); // 10%
        await marketplaceERC1155.setMarketplaceBeneficiary(beneficiary.address);

        await ERC1155TokenContract.mint(seller.address, tokenId, 5);
        await ERC1155TokenContract.mint(seller2.address, tokenId, 10);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);
        await ERC1155TokenContract.connect(seller2).setApprovalForAll(marketplaceERC1155.address, true);

        const value1 = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: ethers.constants.AddressZero,
                settlementPrice: settlementPrice,
                nonce: nonce,      
            },
            amount: 5,
        };
        const value2 = {
            sellSig: {
                seller: seller2.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: ethers.constants.AddressZero,
                settlementPrice: settlementPrice,
                nonce: nonce,    
            },
            amount: 10,
        };

        const signature1 = await seller._signTypedData(domain, SellType, value1);
        const signature2 = await seller2._signTypedData(domain, SellType, value2);

        const sigHash1 = ethers.utils.keccak256(signature1);
        const sigHash2 = ethers.utils.keccak256(signature2);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: ethers.constants.AddressZero,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature1   
            },
            amount: 5,
        },
        {
            sellSig: {
                seller: seller2.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: ethers.constants.AddressZero,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature2
            },
            amount: 10,
        }];

        const seller1Balance = ethers.BigNumber.from(await ethers.provider.getBalance(seller.address));
        const seller2Balance = ethers.BigNumber.from(await ethers.provider.getBalance(seller2.address));
        const beneficiaryBalance = ethers.BigNumber.from(await ethers.provider.getBalance(beneficiary.address));

        const commissionFromSeller1 = (5 * settlementPrice) * commission / 1000;
        const toSeller1 = (5 * settlementPrice) - commissionFromSeller1;
        const commissionFromSeller2 = settlementPrice * commission / 1000;
        const toSeller2 = settlementPrice - commissionFromSeller2;
        const totalCommission = commissionFromSeller1 + commissionFromSeller2;

        const expectedSeller1Balance = seller1Balance.add(toSeller1);
        const expectedSeller2Balance = seller2Balance.add(toSeller2);
        const expectedBeneficiaryBalance = beneficiaryBalance.add(totalCommission);

        await marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti, {value: totalPrice});

        expect(await ERC1155TokenContract.balanceOf(buyer.address, tokenId)).to.equal(buyAmount);
        expect(await marketplaceERC1155.sigCancelledMap(sigHash1)).to.be.equal(true);
        expect(await marketplaceERC1155.sigCancelledMap(sigHash2)).to.be.equal(false);
        expect(await marketplaceERC1155.fullySpendERC1155(sigHash1)).to.be.equal(true);
        expect(await marketplaceERC1155.amountAvailableErc1155(sigHash2)).to.be.equal(9);
        expect(await ethers.provider.getBalance(seller.address)).to.equal(expectedSeller1Balance);
        expect(await ethers.provider.getBalance(seller2.address)).to.equal(expectedSeller2Balance);
        expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(expectedBeneficiaryBalance);
    });

    it("Should not allow buying less than one token", async () => {
        const sellSigMulti = [];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, 0, sellSigMulti)).to.be.reverted;
    });

    it("Should not allow buying without signatures", async () => {
        const sellSigMulti = [];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, 1, sellSigMulti)).to.be.reverted;
    });

    it("Should not allow buying NFT if the provided ERC1155 contract is address zero", async () => {
        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,    
            },
            amount: 5,
        };
        const signature = await seller._signTypedData(domain, SellType, value);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature
            },
            amount: 5,
        }];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ethers.constants.AddressZero, 1, sellSigMulti)).to.be.reverted;
    });

    it("Should not allow buying NFT if the buyer doesn't send enough native token", async () => {
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);
        const buyAmount = 5;

        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: ethers.constants.AddressZero,
                settlementPrice: settlementPrice,
                nonce: nonce,    
            },
            amount: 5,
        };
        const signature = await seller._signTypedData(domain, SellType, value);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: ethers.constants.AddressZero,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature  
            },
            amount: 5,
        }];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.reverted;
    });

    it("Should not allow buying NFT for ERC20 tokens if the settlement token is not approved", async () => {
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);
        const buyAmount = 5;

        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,     
            },
            amount: 5,
        };
        const signature = await seller._signTypedData(domain, SellType, value);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature
            },
            amount: 5,
        }];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.reverted;
    });

    it("Should not allow buying NFT if the marketplace is not approved to spend buyer's ERC20 tokens", async () => {
        const buyAmount = 5;
        await marketplaceERC1155.setSettlementTokenStatus(settlementToken.address, true);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);

        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,     
            },
            amount: 5,
        };
        const signature = await seller._signTypedData(domain, SellType, value);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature
            },
            amount: 5,
        }];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should not allow buying NFT if the buyer doesn't have enough ERC20 tokens", async () => {
        const buyAmount = 5;
        await marketplaceERC1155.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.connect(buyer).approve(marketplaceERC1155.address, buyAmount * settlementPrice);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);

        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,      
            },
            amount: 5,
        };
        const signature = await seller._signTypedData(domain, SellType, value);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature 
            },
            amount: 5,
        }];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should not allow buying NFT if the provided signatures don't have enough tokens", async () => {
        const buyAmount = 6;
        const totalPrice = buyAmount * settlementPrice

        await ERC1155TokenContract.mint(seller.address, tokenId, 5);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);
        await marketplaceERC1155.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.connect(buyer).approve(marketplaceERC1155.address, totalPrice);
        await settlementToken.transfer(buyer.address, totalPrice);

        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,      
            },
            amount: 5,
        };
        const signature = await seller._signTypedData(domain, SellType, value);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature            
            },
            amount: 5,
        }];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.reverted;
    });

    it("Should not allow buying NFT if the marketplace is not approved to manage them", async () => {
        const buyAmount = 5;

        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,    
            },
            amount: 5,
        };
        const signature = await seller._signTypedData(domain, SellType, value);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature
            },
            amount: 5,
        }];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.reverted;
    });

    it("Should not allow buying NFT if the signatures are cancelled", async () => {
        const buyAmount = 5;

        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,    
            },
            amount: 5,
        };

        const signature = await seller._signTypedData(domain, SellType, value);
        const sellSigMulti = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature
            },
            amount: 5,
        };

        await marketplaceERC1155.connect(seller).cancelSellSigMultiple(sellSigMulti);
        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, [sellSigMulti])).to.be.reverted;
    });

    it("Should not allow buying NFT by using multiple signatures if the message signer is not the seller in the message", async () => {
        const buyAmount = 5;

        const value = {
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,    
            },
            amount: 5,
        };
        const signature = await badActor._signTypedData(domain, SellType, value);

        const sellSigMulti = [{
            sellSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                nonce: nonce,
                signature: signature
            },
            amount: 5,
        }];

        await expect(marketplaceERC1155.connect(buyer).buyBySigMulti(ERC1155TokenContract.address, buyAmount, sellSigMulti)).to.be.reverted;
    });

    it("Should allow accepting multiple offers by using acceptOfferSigMulti", async () => {
        const amount = 5;

        await ERC1155TokenContract.mint(seller.address, tokenId, amount);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);
        await marketplaceERC1155.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(buyer.address, settlementPrice);
        await settlementToken.connect(buyer).approve(marketplaceERC1155.address, settlementPrice);

        const value = {
            offerSig: {
                buyer: buyer.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                deadline: deadline,
                nonce: nonce,    
            },
            amount: amount,
        };

        const signature = await buyer._signTypedData(domain, OfferType, value);
        const sigHash = ethers.utils.keccak256(signature);

        const offerSig = {
            offerSig: {
                buyer: buyer.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                settlementPrice: settlementPrice,
                deadline: deadline,
                nonce: nonce,
                signature: signature
            },
            amount: amount,
        };
        await marketplaceERC1155.connect(seller).acceptOfferSigMulti(offerSig);

        expect(await marketplaceERC1155.sigCancelledMap(sigHash)).to.equal(true);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(settlementPrice);
        expect(await settlementToken.balanceOf(buyer.address)).to.equal(0);
        expect(await ERC1155TokenContract.balanceOf(buyer.address, tokenId)).to.equal(amount);
        expect(await ERC1155TokenContract.balanceOf(seller.address, tokenId)).to.equal(0);
    });

    it("Should allow accepting auction bids by using acceptBidMultiple", async () => {
        const amount = 5;

        await ERC1155TokenContract.mint(seller.address, tokenId, amount);
        await ERC1155TokenContract.connect(seller).setApprovalForAll(marketplaceERC1155.address, true);
        await marketplaceERC1155.setSettlementTokenStatus(settlementToken.address, true);
        await settlementToken.transfer(bidder.address, settlementPrice);
        await settlementToken.connect(bidder).approve(marketplaceERC1155.address, settlementPrice);

        const valueAuction = {
            auctionSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                minimumBidPrice: settlementPrice,
                reservePrice: settlementPrice,
                expirationDate: deadline,
                nonce: nonce,    
            },
            amount: amount,
        };

        const valueBid = {
            bidSig: {
                bidder: bidder.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                bidValue: settlementPrice,
                nonce: nonce,
            },
            amount: amount,
        };

        const signatureAuction = await seller._signTypedData(domain, SellAuctionType, valueAuction);
        const signatureBid = await bidder._signTypedData(domain, BidType, valueBid);

        const auctionSigHash = ethers.utils.keccak256(signatureAuction);
        const bidSigHash = ethers.utils.keccak256(signatureBid);

        const auctionSig = {
            auctionSig: {
                seller: seller.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                minimumBidPrice: settlementPrice,
                reservePrice: settlementPrice,
                expirationDate: deadline,
                nonce: nonce,
                signature: signatureAuction
            },
            amount: amount,
        };

        const bidSig = {
            bidSig: {
                bidder: bidder.address,
                tokenContract: ERC1155TokenContract.address,
                tokenId: tokenId,
                settlementToken: settlementToken.address,
                bidValue: settlementPrice,
                nonce: nonce,
                signature: signatureBid
            },
            amount: amount,
        };

        await time.increaseTo(deadline + 1);
        await marketplaceERC1155.acceptBidMultiple(bidSig, auctionSig);

        expect(await marketplaceERC1155.sigCancelledMap(bidSigHash)).to.equal(true);
        expect(await marketplaceERC1155.sigCancelledMap(auctionSigHash)).to.equal(true);
        expect(await settlementToken.balanceOf(seller.address)).to.equal(settlementPrice);
        expect(await settlementToken.balanceOf(bidder.address)).to.equal(0);
        expect(await ERC1155TokenContract.balanceOf(bidder.address, tokenId)).to.equal(amount);
        expect(await ERC1155TokenContract.balanceOf(seller.address, tokenId)).to.equal(0);
    });
});