// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "./NftCollection.sol";

contract MarketplaceBase is Initializable, UUPSUpgradeable, EIP712Upgradeable, AccessControlEnumerableUpgradeable {

    string private constant EIP712DomainName = "NFTSpace Marketplace";
    string private constant EIP712DomainSigning = "0.0.1";

    bytes32 public constant FUND_MANAGER = keccak256("FUND_MANAGER");
    bytes32 public constant EXECUTOR = keccak256("EXECUTOR");

    bytes32 internal constant SELL_TYPEHASH = keccak256("SellSignature(address seller,address tokenContract,uint256 tokenId,address settlementToken,uint256 settlementPrice,uint256 nonce)");
    bytes32 internal constant OFFER_TYPEHASH = keccak256("OfferSignature(address buyer,address tokenContract,uint256 tokenId,address settlementToken,uint256 settlementPrice,uint256 deadline,uint256 nonce)");
    bytes32 internal constant AUCTION_TYPEHASH = keccak256("AuctionSignature(address seller,address tokenContract,uint256 tokenId,address settlementToken,uint256 minimumBidPrice,uint256 reservePrice,uint256 expirationDate,uint256 nonce)");
    bytes32 internal constant BID_TYPEHASH = keccak256("BidSignature(address bidder,address tokenContract,uint256 tokenId,address settlementToken,uint256 bidValue,uint256 nonce)");
    
    uint256 public marketplaceCommissionPermille;
    address public marketplaceCommissionBeneficiary;

    mapping (bytes32 => bool) public sigCancelledMap;
    mapping (address => bool) public settlementTokenStatusMap;
    
    struct SellSignature {
        address seller;
        address tokenContract;
        uint256 tokenId;
        address settlementToken;
        uint256 settlementPrice;
        uint256 nonce;
        bytes signature;
    }

    struct OfferSignature {
        address buyer;
        address tokenContract;
        uint256 tokenId;
        address settlementToken;
        uint256 settlementPrice;
        uint256 deadline;
        uint256 nonce;
        bytes signature;
    }
    
    struct AuctionSignature {
        address seller;
        address tokenContract;
        uint256 tokenId;
        address settlementToken;
        uint256 minimumBidPrice;
        uint256 reservePrice;
        uint256 expirationDate;
        uint256 nonce;
        bytes signature;
    }
    
    struct BidSignature {
        address bidder;
        address tokenContract;
        uint256 tokenId;
        address settlementToken;
        uint256 bidValue;
        uint256 nonce;
        bytes signature;
    }

    event BoughtWithSig(address indexed seller, address indexed buyer, address indexed settlementToken, uint256 price);
    event SignatureCancelled(address indexed signer, bytes32 indexed signatureHash);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __UUPSUpgradeable_init();
        __EIP712_init(EIP712DomainName, EIP712DomainSigning);
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(EXECUTOR, msg.sender);
        _setupRole(FUND_MANAGER, msg.sender);
        
        marketplaceCommissionPermille = 0; // 25 permille = 2.5 percent
        marketplaceCommissionBeneficiary = msg.sender;
    }

    function _authorizeUpgrade(address) internal virtual view override {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender)
            // "Account has no admin role"
        );
    }

    function setSettlementTokenStatus(address settlementToken, bool status) public {
        require(hasRole(FUND_MANAGER, msg.sender)
        // , "Account has no fund manager role"
        );
        require(settlementToken != address(0)
        // , "Wrong ERC20 contract: address can't be 0"
        );

        settlementTokenStatusMap[settlementToken] = status;
    }

    function setMarketplaceCommissionPermille(uint256 _marketplaceCommissionPermille) public {
        require(hasRole(FUND_MANAGER, msg.sender)
        // , "Account has no fund manager role"
        );
        require(_marketplaceCommissionPermille > 0
        // , "Commission must be greater than 0"
        );
        require(_marketplaceCommissionPermille <= 500
        // , "Commission must be lower than 500"
        );

        marketplaceCommissionPermille = _marketplaceCommissionPermille;
    }

    function setMarketplaceBeneficiary(address _beneficiary) external {
        require(hasRole(FUND_MANAGER, msg.sender)
        // , "Account has no fund manager role"
        );
        require(_beneficiary != address(0)
        // , "Beneficiary can't be 0 address"
        );

        marketplaceCommissionBeneficiary = _beneficiary;
    }

    function _cancelSignature(bytes32 _digest, bytes memory _signature, address _signer) internal {
        require(msg.sender == _signer
        // , "Only message signer can cancel signature"
        ); // caller is the seller/buyer/bidder in the message
        bytes32 sigHash = keccak256(_signature);
        require(!sigCancelledMap[sigHash]
        // , "Signature is already cancelled"
        );

        address signer = ECDSA.recover(_digest, _signature);
        require(signer == _signer
        // , "Signers mismatch"
        ); // seller/buyer/bidder in the message is the message signer

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(_signer, sigHash);
    }

    function cancelSellSig(SellSignature memory sellSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            SELL_TYPEHASH,
            sellSig.seller,
            sellSig.tokenContract,
            sellSig.tokenId,
            sellSig.settlementToken,
            sellSig.settlementPrice,
            sellSig.nonce
        )));

        _cancelSignature(digest, sellSig.signature, sellSig.seller);
    }

    function cancelOfferSig(OfferSignature memory offerSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            OFFER_TYPEHASH,
            offerSig.buyer,
            offerSig.tokenContract,
            offerSig.tokenId,
            offerSig.settlementToken,
            offerSig.settlementPrice,
            offerSig.deadline,
            offerSig.nonce
        )));

        _cancelSignature(digest, offerSig.signature, offerSig.buyer);
    }

    function cancelAuctionSig(AuctionSignature memory auctionSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            AUCTION_TYPEHASH,
            auctionSig.seller,
            auctionSig.tokenContract,
            auctionSig.tokenId,
            auctionSig.settlementToken,
            auctionSig.minimumBidPrice,
            auctionSig.reservePrice,
            auctionSig.expirationDate,
            auctionSig.nonce
        )));

        _cancelSignature(digest, auctionSig.signature, auctionSig.seller);
    }

    function cancelBidSig(BidSignature memory bidSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            BID_TYPEHASH,
            bidSig.bidder,
            bidSig.tokenContract,
            bidSig.tokenId,
            bidSig.settlementToken,
            bidSig.bidValue,
            bidSig.nonce
        )));

        _cancelSignature(digest, bidSig.signature, bidSig.bidder);
    }
    
    function buyBySig(SellSignature memory sellSig) public payable {
        bytes32 sigHash = keccak256(sellSig.signature);
        require(!sigCancelledMap[sigHash]
        // , "Signature is cancelled"
        );

        require(address(sellSig.tokenContract) != address(0) && IERC165(sellSig.tokenContract).supportsInterface(type(IERC721).interfaceId)
        // , "wrong NFT Collection address"
        );
        IERC721 token = IERC721(sellSig.tokenContract);
        require(token.ownerOf(sellSig.tokenId) != msg.sender
        // , "user is already the owner of this NFT"
        );
        require(token.ownerOf(sellSig.tokenId) == sellSig.seller
        // , "seller is no longer the owner of this NFT"
        );
        require(token.isApprovedForAll(token.ownerOf(sellSig.tokenId), address(this))
        // , "marketplace is not approved as an operator"
        );

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            SELL_TYPEHASH,
            sellSig.seller,
            sellSig.tokenContract,
            sellSig.tokenId,
            sellSig.settlementToken,
            sellSig.settlementPrice,
            sellSig.nonce
        )));

        address signer = ECDSA.recover(digest, sellSig.signature);
        require(signer == sellSig.seller
        // , "seller mismatch"
        );

        uint256 marketplaceCommision = sellSig.settlementPrice * marketplaceCommissionPermille / 1000;

        if (sellSig.settlementToken == address(0)) {
            require(msg.value >= sellSig.settlementPrice
            // , "not enough funds"
            );

            uint256 excess = msg.value - sellSig.settlementPrice;
            if (excess > 0) {
                payable(msg.sender).transfer(excess);
            }

            payable(sellSig.seller).transfer(sellSig.settlementPrice - marketplaceCommision);
            payable(marketplaceCommissionBeneficiary).transfer(marketplaceCommision);
        } else {
            IERC20 settlementToken = IERC20(sellSig.settlementToken);
            require(settlementTokenStatusMap[address(settlementToken)]
            // , "ERC20 token is not approved as a settlement token"
            );

            require(settlementToken.transferFrom(msg.sender, sellSig.seller, sellSig.settlementPrice - marketplaceCommision)
            // , "marketplace is not approved to spend the settlement tokens out of the user's balance"
            );
            require(settlementToken.transferFrom(msg.sender, marketplaceCommissionBeneficiary, marketplaceCommision)
            // , "marketplace is not approved to spend the settlement tokens out of the user's balance"
            );
        }

        token.transferFrom(sellSig.seller, msg.sender, sellSig.tokenId);
        emit BoughtWithSig(sellSig.seller, msg.sender, sellSig.settlementToken, sellSig.settlementPrice);

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(signer, sigHash);
    }

    function mintWithSignatureAndBuyBySig(NftCollection.SignedMint memory signedMint, SellSignature memory sellSig) public payable {
        require(address(sellSig.tokenContract) != address(0) && IERC165(sellSig.tokenContract).supportsInterface(type(IERC721).interfaceId)
        // , "wrong NFT Collection address"
        );
        NftCollection collection = NftCollection(sellSig.tokenContract);

        collection.mintWithSignature(signedMint);
        buyBySig(sellSig);
    }

    function acceptOfferSig(OfferSignature memory offerSig) public payable {
        bytes32 sigHash = keccak256(offerSig.signature);
        require(!sigCancelledMap[sigHash]
        // , "Signature is cancelled"
        );

        require(offerSig.buyer != msg.sender
        // , "user cannot accept their own offer"
        );

        require(address(offerSig.tokenContract) != address(0) && IERC165(offerSig.tokenContract).supportsInterface(type(IERC721).interfaceId)
        // , "wrong NFT Collection address"
        );
        IERC721 token = IERC721(offerSig.tokenContract);
        require(token.ownerOf(offerSig.tokenId) != offerSig.buyer
        // , "Buyer is already the owner of this NFT"
        );
        require(token.ownerOf(offerSig.tokenId) == msg.sender
        // , "User is not the owner of this NFT"
        );
        require(token.isApprovedForAll(msg.sender, address(this))
        // , "Marketplace is not approved to manage the user's tokens"
        );

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            OFFER_TYPEHASH,
            offerSig.buyer,
            offerSig.tokenContract,
            offerSig.tokenId,
            offerSig.settlementToken,
            offerSig.settlementPrice,
            offerSig.deadline,
            offerSig.nonce
        )));

        address signer = ECDSA.recover(digest, offerSig.signature);
        require(signer == offerSig.buyer
        // , "buyer mismatch"
        );

        uint256 marketplaceCommision = offerSig.settlementPrice * marketplaceCommissionPermille / 1000;

        if (offerSig.settlementToken == address(0)) {
            require(msg.value >= offerSig.settlementPrice
            // , "not enough funds"
            );

            uint256 excess = msg.value - offerSig.settlementPrice;
            if (excess > 0) {
                payable(msg.sender).transfer(excess);
            }

            payable(offerSig.buyer).transfer(offerSig.settlementPrice - marketplaceCommision);
            payable(marketplaceCommissionBeneficiary).transfer(marketplaceCommision);
        } else {
            IERC20 settlementToken = IERC20(offerSig.settlementToken);
            require(settlementTokenStatusMap[address(settlementToken)]
            // , "ERC20 token not approved as a settlement token"
            );

            require(settlementToken.transferFrom(offerSig.buyer, msg.sender, offerSig.settlementPrice - marketplaceCommision)
            // , "marketplace is not approved to spend the settlement tokens out of the user's balance"
            );
            require(settlementToken.transferFrom(offerSig.buyer, marketplaceCommissionBeneficiary, marketplaceCommision)
            // , "marketplace is not approved to spend the settlement tokens out of the user's balance"
            );
        }

        token.transferFrom(msg.sender, offerSig.buyer, offerSig.tokenId);

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(signer, sigHash);
    }

    function acceptBid(BidSignature memory bidSig, AuctionSignature memory auctionSig) public {
        require(address(auctionSig.tokenContract) != address(0) && IERC165(auctionSig.tokenContract).supportsInterface(type(IERC721).interfaceId)
        // , "wrong NFT Collection address"
        );
        IERC721 token = IERC721(auctionSig.tokenContract);
        address tokenOwner = token.ownerOf(auctionSig.tokenId);

        require(token.isApprovedForAll(auctionSig.seller, address(this))
        // , "Marketplace is not approved to manage the seller's tokens"
        );
        require(tokenOwner == auctionSig.seller
        // , "Seller is not the owner of this NFT"
        );
        
        if (hasRole(EXECUTOR, msg.sender)) {
            require(block.timestamp >= auctionSig.expirationDate
            // , "Auction has not ended yet"
            );
        } else {
            require(bidSig.bidder != msg.sender
            // , "User cannot be the bidder"
            );
            require(tokenOwner == msg.sender
            // , "User is not the owner of this NFT"
            );
        }

        bytes32 auctionSigHash = keccak256(auctionSig.signature);
        require(!sigCancelledMap[auctionSigHash]
        // , "Auction signature is cancelled"
        );

        bytes32 bidSigHash = keccak256(bidSig.signature);
        require(!sigCancelledMap[bidSigHash]
        // , "Bid signature is cancelled"
        );

        require(auctionSig.tokenContract == bidSig.tokenContract
        // , "NFT contract mismatch"
        );
        require(auctionSig.tokenId == bidSig.tokenId
        // , "token ID mismatch"
        );
        require(auctionSig.settlementToken == bidSig.settlementToken
        // , "settlement token missmatch"
        );
        require(auctionSig.settlementToken != address(0)
        // , "settlement token for auctions/bids cannot be native token"
        );
        require(auctionSig.minimumBidPrice <= bidSig.bidValue
        // , "Bid less than the minimum bid price"
        );

        bytes32 auctionSigDigest = _hashTypedDataV4(keccak256(abi.encode(
            AUCTION_TYPEHASH,
            auctionSig.seller,
            auctionSig.tokenContract,
            auctionSig.tokenId,
            auctionSig.settlementToken,
            auctionSig.minimumBidPrice,
            auctionSig.reservePrice,
            auctionSig.expirationDate,
            auctionSig.nonce
        )));

        address auctionSigSigner = ECDSA.recover(auctionSigDigest, auctionSig.signature);
        require(auctionSigSigner == auctionSig.seller
        // , "seller mismatch"
        );

        bytes32 bidSigDigest = _hashTypedDataV4(keccak256(abi.encode(
            BID_TYPEHASH,
            bidSig.bidder,
            bidSig.tokenContract,
            bidSig.tokenId,
            bidSig.settlementToken,
            bidSig.bidValue,
            bidSig.nonce
        )));

        address bidSigSigner = ECDSA.recover(bidSigDigest, bidSig.signature);
        require(bidSigSigner == bidSig.bidder
        // , "bidder mismatch"
        );

        IERC20 settlementToken = IERC20(auctionSig.settlementToken);
        require(settlementTokenStatusMap[address(settlementToken)]
        // , "ERC20 token not approved as a settlement token"
        );

        uint256 marketplaceCommision = bidSig.bidValue * marketplaceCommissionPermille / 1000;
        uint256 toSeller = bidSig.bidValue - marketplaceCommision;
        
        require(settlementToken.transferFrom(bidSig.bidder, marketplaceCommissionBeneficiary, marketplaceCommision)
        // , "marketplace is not approved to spend the settlement tokens out of the bidder's balance"
        );
        require(settlementToken.transferFrom(bidSig.bidder, auctionSig.seller, toSeller)
        // , "marketplace is not approved to spend the settlement tokens out of the bidder's balance"
        );
        
        token.transferFrom(auctionSig.seller, bidSig.bidder, auctionSig.tokenId);

        sigCancelledMap[auctionSigHash] = true;
        emit SignatureCancelled(auctionSig.seller, auctionSigHash);

        sigCancelledMap[bidSigHash] = true;
        emit SignatureCancelled(bidSig.bidder, bidSigHash);
    }
}
