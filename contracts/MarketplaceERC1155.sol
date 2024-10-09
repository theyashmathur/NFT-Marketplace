// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import "./MarketplaceBase.sol";

contract MarketplaceERC1155 is MarketplaceBase {
    bytes32 private constant SELL_MULTIPLE_TYPEHASH = keccak256("SellSigMultiple(SellSignature sellSig,uint256 amount)SellSignature(address seller,address tokenContract,uint256 tokenId,address settlementToken,uint256 settlementPrice,uint256 nonce)");
    bytes32 private constant OFFER_MULTIPLE_TYPEHASH = keccak256("OfferSigMultiple(OfferSignature offerSig,uint256 amount)OfferSignature(address buyer,address tokenContract,uint256 tokenId,address settlementToken,uint256 settlementPrice,uint256 deadline,uint256 nonce)");
    bytes32 private constant AUCTION_MULTIPLE_TYPEHASH = keccak256("AuctionSignatureMultiple(AuctionSignature auctionSig,uint256 amount)AuctionSignature(address seller,address tokenContract,uint256 tokenId,address settlementToken,uint256 minimumBidPrice,uint256 reservePrice,uint256 expirationDate,uint256 nonce)");
    bytes32 private constant BID_MULTIPLE_TYPEHASH = keccak256("BidSignatureMultiple(BidSignature bidSig,uint256 amount)BidSignature(address bidder,address tokenContract,uint256 tokenId,address settlementToken,uint256 bidValue,uint256 nonce)");

    mapping (bytes32 => bool) public fullySpendERC1155;
    mapping (bytes32 => uint256) public amountAvailableErc1155;

    struct SellSigMultiple {
        SellSignature sellSig;
        uint256 amount;
    }

    struct OfferSigMultiple {
        OfferSignature offerSig;
        uint256 amount;
    }

    struct AuctionSignatureMultiple {
        AuctionSignature auctionSig;
        uint256 amount;
    }

    struct BidSignatureMultiple {
        BidSignature bidSig;
        uint256 amount;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initMarketplaceERC1155() public initializer() {
        initialize();
    }

    function _authorizeUpgrade(address) internal view override {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender)
            // "Account has no admin role"
        );
    }

    function cancelSellSigMultiple(SellSigMultiple memory signature) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            SELL_MULTIPLE_TYPEHASH,
            keccak256(abi.encode(
                SELL_TYPEHASH,
                signature.sellSig.seller,
                signature.sellSig.tokenContract,
                signature.sellSig.tokenId,
                signature.sellSig.settlementToken,
                signature.sellSig.settlementPrice,
                signature.sellSig.nonce
            )),
            signature.amount
        )));
        
        _cancelSignature(digest, signature.sellSig.signature, signature.sellSig.seller);
    }

    function cancelOfferSigMultiple(OfferSigMultiple memory offerSigMulti) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            OFFER_MULTIPLE_TYPEHASH,
            keccak256(abi.encode(
                OFFER_TYPEHASH,
                offerSigMulti.offerSig.buyer,
                offerSigMulti.offerSig.tokenContract,
                offerSigMulti.offerSig.tokenId,
                offerSigMulti.offerSig.settlementToken,
                offerSigMulti.offerSig.settlementPrice,
                offerSigMulti.offerSig.deadline,
                offerSigMulti.offerSig.nonce
            )),
            offerSigMulti.amount
        )));

        _cancelSignature(digest, offerSigMulti.offerSig.signature, offerSigMulti.offerSig.buyer);
    }

    function cancelAuctionSigMultiple(AuctionSignatureMultiple memory auctionSigMulti) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            AUCTION_MULTIPLE_TYPEHASH,
            keccak256(abi.encode(
                AUCTION_TYPEHASH,
                auctionSigMulti.auctionSig.seller,
                auctionSigMulti.auctionSig.tokenContract,
                auctionSigMulti.auctionSig.tokenId,
                auctionSigMulti.auctionSig.settlementToken,
                auctionSigMulti.auctionSig.minimumBidPrice,
                auctionSigMulti.auctionSig.reservePrice,
                auctionSigMulti.auctionSig.expirationDate,
                auctionSigMulti.auctionSig.nonce
            )),
            auctionSigMulti.amount
        )));

        _cancelSignature(digest, auctionSigMulti.auctionSig.signature, auctionSigMulti.auctionSig.seller);
    }

    function cancelBidSigMulti(BidSignatureMultiple memory bidSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            BID_MULTIPLE_TYPEHASH,
            keccak256(abi.encode(
                BID_TYPEHASH,
                bidSig.bidSig.bidder,
                bidSig.bidSig.tokenContract,
                bidSig.bidSig.tokenId,
                bidSig.bidSig.settlementToken,
                bidSig.bidSig.bidValue,
                bidSig.bidSig.nonce
            )),
            bidSig.amount
        )));

        _cancelSignature(digest, bidSig.bidSig.signature, bidSig.bidSig.bidder);
    }

    function buyBySigMulti(address tokenAddress, uint256 buyAmount, SellSigMultiple[] memory signatures) public payable {
        require(buyAmount > 0
        // , "Amount must be greater than 0"
        );
        require(signatures.length > 0
        // , "Signatures are empty"
        );
        require(address(tokenAddress) != address(0) && IERC165(tokenAddress).supportsInterface(type(IERC1155).interfaceId)
        // , "wrong NFT Collection address"
        );
        
        IERC1155 token = IERC1155(tokenAddress);
        uint256 remainingAmount = buyAmount;
        uint256 receivedAmount = msg.value;

        for(uint i = 0; i < signatures.length && remainingAmount > 0 ;  i++) {
            bytes32 sigHash = keccak256(signatures[i].sellSig.signature);

            if (sigCancelledMap[sigHash]) {
                continue;
            }

            if (fullySpendERC1155[sigHash]) {
                continue;
            }

            uint256 signatureRemainingAmount = signatures[i].amount;
            if (amountAvailableErc1155[sigHash] > 0) {
                signatureRemainingAmount = (amountAvailableErc1155[sigHash]);
            }

            if (!token.isApprovedForAll(signatures[i].sellSig.seller, address(this))) {
                continue;
            }

            bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
                SELL_MULTIPLE_TYPEHASH,
                keccak256(abi.encode(
                    SELL_TYPEHASH,
                    signatures[i].sellSig.seller,
                    signatures[i].sellSig.tokenContract,
                    signatures[i].sellSig.tokenId,
                    signatures[i].sellSig.settlementToken,
                    signatures[i].sellSig.settlementPrice,
                    signatures[i].sellSig.nonce
                )),
                signatures[i].amount
            )));
            
            address signer = ECDSA.recover(digest, signatures[i].sellSig.signature);
            if (signer != signatures[i].sellSig.seller) {
               continue;
            }

            uint256 transferAmount;
            if (remainingAmount >= signatureRemainingAmount) {
                transferAmount = signatureRemainingAmount;
                fullySpendERC1155[sigHash] = true;
                sigCancelledMap[sigHash] = true;

                emit SignatureCancelled(signer, sigHash);
            } else {
                amountAvailableErc1155[sigHash] = signatureRemainingAmount - remainingAmount;
                transferAmount = remainingAmount;
            }

            uint256 finalPrice = transferAmount * signatures[i].sellSig.settlementPrice;
            uint256 marketplaceCommision = finalPrice * marketplaceCommissionPermille / 1000;
            uint256 amountToSeller = finalPrice - marketplaceCommision;

            if (signatures[i].sellSig.settlementToken == address(0)) {
                require(receivedAmount >= finalPrice
                // , "Insufficient funds"
                );
                receivedAmount -= finalPrice;

                payable(signatures[i].sellSig.seller).transfer(amountToSeller);
                payable(marketplaceCommissionBeneficiary).transfer(marketplaceCommision);
            } else {
                IERC20 settlementToken = IERC20(signatures[i].sellSig.settlementToken);

                require(settlementTokenStatusMap[address(settlementToken)]
                // , "ERC20 token not approved as a settlement token"
                );
                require(settlementToken.transferFrom(msg.sender, signatures[i].sellSig.seller, amountToSeller)
                // , "marketplace is not approved to spend the settlement tokens out of the user's balance"
                );
                require(settlementToken.transferFrom(msg.sender, marketplaceCommissionBeneficiary, marketplaceCommision)
                // , "marketplace is not approved to spend the settlement tokens out of the user's balance"
                );
            }
            
            token.safeTransferFrom(signatures[i].sellSig.seller, msg.sender, signatures[i].sellSig.tokenId, transferAmount, "");
            remainingAmount -= transferAmount;

            emit BoughtWithSig(signatures[i].sellSig.seller, msg.sender, signatures[i].sellSig.settlementToken, finalPrice);
        }

        require(
            remainingAmount == 0
            // "Something went wrong: make sure the signatures have enough available tokens and the marketplace is approved to manage them."
        );
        if (receivedAmount > 0) {
            payable(msg.sender).transfer(receivedAmount);
        }
    }

    function acceptOfferSigMulti(OfferSigMultiple memory offerSig) public payable  {
        bytes32 sigHash = keccak256(offerSig.offerSig.signature);
        require(!sigCancelledMap[sigHash]
        // , "Signature is cancelled"
        );

        require(offerSig.offerSig.buyer != msg.sender
        // , "user cannot accept their own offer"
        );

        require(address(offerSig.offerSig.tokenContract) != address(0) && IERC165(offerSig.offerSig.tokenContract).supportsInterface(type(IERC1155).interfaceId)
        // , "wrong NFT Collection address"
        );
        IERC1155 token = IERC1155(offerSig.offerSig.tokenContract);        
        uint256 senderbalance = token.balanceOf(msg.sender, offerSig.offerSig.tokenId);
        require(senderbalance > 0
        // , "User is not the owner of these tokens"
        );
        require(token.isApprovedForAll(msg.sender, address(this))
        // , "Marketplace is not approved to manage the user's tokens"
        );

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            OFFER_MULTIPLE_TYPEHASH,
            keccak256(abi.encode(
                OFFER_TYPEHASH,
                offerSig.offerSig.buyer,
                offerSig.offerSig.tokenContract,
                offerSig.offerSig.tokenId,
                offerSig.offerSig.settlementToken,
                offerSig.offerSig.settlementPrice,
                offerSig.offerSig.deadline,
                offerSig.offerSig.nonce
            )),
            offerSig.amount
        )));

        address signer = ECDSA.recover(digest, offerSig.offerSig.signature);
        require(signer == offerSig.offerSig.buyer
        // , "buyer mismatch"
        );

        uint256 marketplaceCommision = offerSig.offerSig.settlementPrice * marketplaceCommissionPermille / 1000;

        IERC20 settlementToken = IERC20(offerSig.offerSig.settlementToken);
        require(settlementTokenStatusMap[address(settlementToken)]
        // , "ERC20 token not approved as a settlement token"
        );
            
        require(settlementToken.transferFrom(offerSig.offerSig.buyer, msg.sender, offerSig.offerSig.settlementPrice - marketplaceCommision)
        // , "marketplace is not approved to spend the settlement tokens out of the user's balance"
        );
        require(settlementToken.transferFrom(offerSig.offerSig.buyer, marketplaceCommissionBeneficiary, marketplaceCommision)
        // , "marketplace is not approved to spend the settlement tokens out of the user's balance"
        );
        
        token.safeTransferFrom(msg.sender, offerSig.offerSig.buyer, offerSig.offerSig.tokenId, offerSig.amount, "");

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(signer, sigHash);
    }

    function acceptBidMultiple(BidSignatureMultiple memory bidSigMulti, AuctionSignatureMultiple memory auctionSigMulti) public {
        require(address(auctionSigMulti.auctionSig.tokenContract) != address(0) && IERC165(auctionSigMulti.auctionSig.tokenContract).supportsInterface(type(IERC1155).interfaceId)
        // , "wrong NFT Collection address"
        );
        IERC1155 token = IERC1155(auctionSigMulti.auctionSig.tokenContract);

        require(token.balanceOf(auctionSigMulti.auctionSig.seller, auctionSigMulti.auctionSig.tokenId) >= auctionSigMulti.amount
        // , "The seller does not have enough NFTs"
        );
        require(token.isApprovedForAll(auctionSigMulti.auctionSig.seller, address(this))
        // , "Marketplace is not approved to manage the seller's tokens"
        );

        if (hasRole(EXECUTOR, msg.sender)) {
            require(block.timestamp >= auctionSigMulti.auctionSig.expirationDate
            // , "Auction has not ended yet"
            );
        } else {
            require(auctionSigMulti.auctionSig.seller == msg.sender
            // , "User is not the auction seller"
            );
            require(bidSigMulti.bidSig.bidder != msg.sender
            // , "User cannot be the bidder"
            );
        }

        bytes32 auctionSigHash = keccak256(auctionSigMulti.auctionSig.signature);
        require(!sigCancelledMap[auctionSigHash]
        // , "Auction signature is cancelled"
        );

        bytes32 bidSigHash = keccak256(bidSigMulti.bidSig.signature);
        require(!sigCancelledMap[bidSigHash]
        // , "Bid signature is cancelled"
        );

        require(auctionSigMulti.auctionSig.tokenContract == bidSigMulti.bidSig.tokenContract
        // , "NFT contract mismatch"
        );
        require(auctionSigMulti.auctionSig.tokenId == bidSigMulti.bidSig.tokenId
        // , "token ID mismatch"
        );
        require(auctionSigMulti.auctionSig.settlementToken == bidSigMulti.bidSig.settlementToken
        // , "settlement token missmatch"
        );
        require(auctionSigMulti.auctionSig.settlementToken != address(0)
        // , "145"
        );
        require(auctionSigMulti.auctionSig.minimumBidPrice <= bidSigMulti.bidSig.bidValue
        // , "Bid less than the minimum bid price"
        );
        require(auctionSigMulti.amount == bidSigMulti.amount
        // , "amount mismutch"
        );
        require(settlementTokenStatusMap[auctionSigMulti.auctionSig.settlementToken]
        // , "settlement token is not approved"
        );

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            AUCTION_MULTIPLE_TYPEHASH,
            keccak256(abi.encode(
                AUCTION_TYPEHASH,
                auctionSigMulti.auctionSig.seller,
                auctionSigMulti.auctionSig.tokenContract,
                auctionSigMulti.auctionSig.tokenId,
                auctionSigMulti.auctionSig.settlementToken,
                auctionSigMulti.auctionSig.minimumBidPrice,
                auctionSigMulti.auctionSig.reservePrice,
                auctionSigMulti.auctionSig.expirationDate,
                auctionSigMulti.auctionSig.nonce
            )),
            auctionSigMulti.amount
        )));

        address signer = ECDSA.recover(digest, auctionSigMulti.auctionSig.signature);
        require(signer == auctionSigMulti.auctionSig.seller
        // , "seller mismatch"
        );
        
        bytes32 bidSigDigest = _hashTypedDataV4(keccak256(abi.encode(
            BID_MULTIPLE_TYPEHASH,
            keccak256(abi.encode(
                BID_TYPEHASH,
                bidSigMulti.bidSig.bidder,
                bidSigMulti.bidSig.tokenContract,
                bidSigMulti.bidSig.tokenId,
                bidSigMulti.bidSig.settlementToken,
                bidSigMulti.bidSig.bidValue,
                bidSigMulti.bidSig.nonce
            )),
            bidSigMulti.amount
        )));

        address bidSigSigner = ECDSA.recover(bidSigDigest, bidSigMulti.bidSig.signature);
        require(bidSigSigner == bidSigMulti.bidSig.bidder
        // , "bidder mismatch"
        );
        
        IERC20 settlementToken = IERC20(auctionSigMulti.auctionSig.settlementToken);
        uint256 marketplaceCommision = bidSigMulti.bidSig.bidValue * marketplaceCommissionPermille / 1000;
        uint256 toSeller = bidSigMulti.bidSig.bidValue - marketplaceCommision;
        
        require(settlementToken.transferFrom(bidSigMulti.bidSig.bidder, marketplaceCommissionBeneficiary, marketplaceCommision)
        // , "marketplace is not approved to spend the settlement tokens out of the bidder's balance"
        );
        require(settlementToken.transferFrom(bidSigMulti.bidSig.bidder, auctionSigMulti.auctionSig.seller, toSeller)
        // , "marketplace is not approved to spend the settlement tokens out of the bidder's balance"
        );

        token.safeTransferFrom(auctionSigMulti.auctionSig.seller, bidSigMulti.bidSig.bidder, auctionSigMulti.auctionSig.tokenId, auctionSigMulti.amount, "");

        sigCancelledMap[auctionSigHash] = true;
        emit SignatureCancelled(auctionSigMulti.auctionSig.seller, auctionSigHash);

        sigCancelledMap[bidSigHash] = true;
        emit SignatureCancelled(bidSigMulti.bidSig.bidder, bidSigHash);
    }
}