// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "hardhat/console.sol";
import "./NftCollection.sol";

contract Marketplace is Initializable, UUPSUpgradeable, EIP712Upgradeable, AccessControlEnumerableUpgradeable, ReentrancyGuardUpgradeable {

    string constant EIP712DomainName = "NFTSpace Marketplace";
    string constant EIP712DomainSigning = "0.0.1";

    bytes32 public constant FUND_MANAGER = keccak256("FUND_MANAGER"); // can change the marketplaceCommisionBeneficiary and marketplaceCommissionPermille
    bytes32 public constant EXECUTOR = keccak256("EXECUTOR"); // can execute/finalise auctions
    
    uint256 public marketplaceCommissionPermille;
    address public marketplaceCommisionBeneficiary;

    mapping (bytes32 => bool) public sigCancelledMap;
    mapping (address => bool) public settlementTokenStatusMap;

    mapping (bytes32 => bool) public fullySpendERC1155;
    mapping (bytes32 => uint256) public amountAvailableErc1155;
    
    struct sellSignature {
        address seller;
        address tokenContract;
        uint256 tokenId;
        address settlementToken;
        uint256 settlementPrice;
        uint256 nonce;
        bytes signature;
    }

    struct sellSigMultiple {
        address seller;
        address tokenContract;
        uint256 tokenId;
        uint256 amount;
        address settlementToken;
        uint256 settlementPrice;
        uint256 nonce;
        bytes signature;
    }

    struct offerSignature {
        address buyer;
        address tokenContract;
        uint256 tokenId;
        address settlementToken;
        uint256 settlementPrice;
        uint256 deadline;
        uint256 nonce;
        bytes signature;
    }

    struct offerSigMultiple {
        address buyer;
        address tokenContract;
        uint256 tokenId;
        uint256 amount;
        address settlementToken;
        uint256 settlementPrice;
        uint256 deadline;
        uint256 nonce;
        bytes signature;
    }
    
    struct auctionSignature {
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

    struct auctionSignatureMultiple {
        address seller;
        address tokenContract;
        uint256 tokenId;
        uint256 amount;
        address settlementToken;
        uint256 minimumBidPrice;
        uint256 reservePrice;
        uint256 expirationDate;
        uint256 nonce;
        bytes signature;
    }
    
    struct bidSignature {
        address bidder;
        address tokenContract;
        uint256 tokenId;
        address settlementToken;
        uint256 bidValue;
        uint256 nonce;
        bytes signature;
    }

    struct bidSignatureMultiple {
        address bidder;
        address tokenContract;
        uint256 tokenId;
        uint256 amount;
        address settlementToken;
        uint256 bidValue;
        uint256 nonce;
        bytes signature;
    }

    event BoughtWithSig(address indexed seller, address indexed buyer, address indexed settlementToken, uint256 price); // payment token 0 means ethereum
    event SignatureCancelled(address indexed signer, bytes32 indexed signatureHash);
    
    /// @notice constructor used to force implementation initialization
    /// @dev https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializing_the_implementation_contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __UUPSUpgradeable_init();
        __EIP712_init(EIP712DomainName, EIP712DomainSigning);
        __AccessControlEnumerable_init();
        __ReentrancyGuard_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(EXECUTOR, msg.sender);
        _setupRole(FUND_MANAGER, msg.sender);
        
        marketplaceCommissionPermille = 0; // 25 permille = 2.5 percent
        marketplaceCommisionBeneficiary = msg.sender;

        settlementTokenStatusMap[0x7d45d91421EA7c6293B48C45Fd37E038D032A334] = true; // Enter token address
    }

    /// @notice Checks if the upgrade is authorized
    //  @param newImplementation this is the new implementation passed from upgradeTo
    function _authorizeUpgrade(address) internal view override {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
    }

    function setSettlementTokenStatus(address settlementToken, bool status) public {
        require(hasRole(FUND_MANAGER, msg.sender), "Account has no fund manager role");
        require(settlementToken != address(0), "Wrong ERC20 contract: address can't be 0");

        settlementTokenStatusMap[settlementToken] = status;
    }

    function setMarketplaceCommissionPermille(uint256 _marketplaceCommissionPermille) public {
        require(hasRole(FUND_MANAGER, msg.sender), "Account has no fund manager role");
        require(_marketplaceCommissionPermille > 0, "Commission must be greater than 0");
        require(_marketplaceCommissionPermille <= 500, "Commission must be lower than 500");

        marketplaceCommissionPermille = _marketplaceCommissionPermille;
    }

    function setMarketplaceBeneficiary(address _beneficiary) external {
        require(hasRole(FUND_MANAGER, msg.sender), "Account has no fund manager role");
        require(_beneficiary != address(0), "Beneficiary can't be 0 address");

        marketplaceCommisionBeneficiary = _beneficiary;
    }

    function _cancelSignature(bytes32 _digest, bytes memory _signature, address _signer) private {
        require(msg.sender == _signer, "Only message signer can cancel signature"); // caller is the seller/buyer/bidder in the message
        bytes32 sigHash = keccak256(_signature);
        require(!sigCancelledMap[sigHash], "Signature is already cancelled");

        address signer = ECDSA.recover(_digest, _signature);
        require(signer == _signer, "Signers mismatch"); // seller/buyer/bidder in the message is the message signer

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(_signer, sigHash);
    }

    function cancelSellSig(sellSignature memory sellSig) public {        
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("SellBySig(address seller,address tokenContract,uint256 tokenId,address settlementToken,uint256 settlementPrice,uint256 nonce)"),
            sellSig.seller,
            sellSig.tokenContract,
            sellSig.tokenId,
            sellSig.settlementToken,
            sellSig.settlementPrice,
            sellSig.nonce
        )));

        _cancelSignature(digest, sellSig.signature, sellSig.seller);
    }

    function cancelSellSigMultiple(sellSigMultiple memory signature) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
                keccak256("SellBySigMultiple(address seller,address tokenContract,uint256 tokenId,uint256 amount,address settlementToken,uint256 settlementPrice,uint256 nonce)"),
                signature.seller,
                signature.tokenContract,
                signature.tokenId,
                signature.amount,
                signature.settlementToken,
                signature.settlementPrice,
                signature.nonce
            )));
        
        _cancelSignature(digest, signature.signature, signature.seller);
    }

    function cancelOfferSig(offerSignature memory offerSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("OfferSig(address buyer,address tokenContract,uint256 tokenId,address settlementToken,uint256 settlementPrice,uint256 deadline,uint256 nonce)"),
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

    function cancelOfferSigMultiple(offerSigMultiple memory offerSigMulti) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("OfferSigMultiple(address buyer,address tokenContract,uint256 tokenId,uint256 amount,address settlementToken,uint256 settlementPrice,uint256 deadline,uint256 nonce)"),
            offerSigMulti.buyer,
            offerSigMulti.tokenContract,
            offerSigMulti.tokenId,
            offerSigMulti.amount,
            offerSigMulti.settlementToken,
            offerSigMulti.settlementPrice,
            offerSigMulti.deadline,
            offerSigMulti.nonce
        )));

        _cancelSignature(digest, offerSigMulti.signature, offerSigMulti.buyer);
    }

    function cancelAuctionSig(auctionSignature memory auctionSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("SellByAuction(address seller,address tokenContract,uint256 tokenId,address settlementToken,uint256 minimumBidPrice,uint256 reservePrice,uint256 expirationDate,uint256 nonce)"),
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

    function cancelAuctionSigMultiple(auctionSignatureMultiple memory auctionSigMulti) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("SellByAuctionMultiple(address seller,address tokenContract,uint256 tokenId,uint256 amount,address settlementToken,uint256 minimumBidPrice,uint256 reservePrice,uint256 expirationDate,uint256 nonce)"),
            auctionSigMulti.seller,
            auctionSigMulti.tokenContract,
            auctionSigMulti.tokenId,
            auctionSigMulti.amount,
            auctionSigMulti.settlementToken,
            auctionSigMulti.minimumBidPrice,
            auctionSigMulti.reservePrice,
            auctionSigMulti.expirationDate,
            auctionSigMulti.nonce
        )));

        _cancelSignature(digest, auctionSigMulti.signature, auctionSigMulti.seller);
    }

    function cancelBidSig(bidSignature memory bidSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("BidSignature(address bidder,address tokenContract,uint256 tokenId,address settlementToken,uint256 bidValue,uint256 nonce)"),
            bidSig.bidder,
            bidSig.tokenContract,
            bidSig.tokenId,
            bidSig.settlementToken,
            bidSig.bidValue,
            bidSig.nonce
        )));

        _cancelSignature(digest, bidSig.signature, bidSig.bidder);
    }

    function cancelBidSigMulti(bidSignatureMultiple memory bidSig) public {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("BidSignatureMultiple(address bidder,address tokenContract,uint256 tokenId,uint256 amount,address settlementToken,uint256 bidValue,uint256 nonce)"),
            bidSig.bidder,
            bidSig.tokenContract,
            bidSig.tokenId,
            bidSig.amount,
            bidSig.settlementToken,
            bidSig.bidValue,
            bidSig.nonce
        )));

        _cancelSignature(digest, bidSig.signature, bidSig.bidder);
    }

    function buyBySigMulti(address tokenAddress, uint256 buyAmount, sellSigMultiple[] memory signatures) public nonReentrant() payable {
        require(buyAmount > 0, "Amount must be greater than 0");
        require(signatures.length > 0,"Signatures are empty");

        require(address(tokenAddress) != address(0) && IERC165(tokenAddress).supportsInterface(type(IERC1155).interfaceId), "wrong NFT Collection address");
        IERC1155 token = IERC1155(tokenAddress);
        uint256 remainingAmount = buyAmount;
        uint256 receivedAmount = msg.value;

        for(uint i = 0; i < signatures.length && remainingAmount > 0 ;  i++) {
            bytes32 sigHash = keccak256(signatures[i].signature);

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

            if (!token.isApprovedForAll(signatures[i].seller, address(this))) {
                continue;
            }

            bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
                keccak256("SellBySigMultiple(address seller,address tokenContract,uint256 tokenId,uint256 amount,address settlementToken,uint256 settlementPrice,uint256 nonce)"),
                signatures[i].seller,
                signatures[i].tokenContract,
                signatures[i].tokenId,
                signatures[i].amount,
                signatures[i].settlementToken,
                signatures[i].settlementPrice,
                signatures[i].nonce
            )));
            
            address signer = ECDSA.recover(digest, signatures[i].signature);
            if (signer != signatures[i].seller) {
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

            uint256 finalPrice = transferAmount * signatures[i].settlementPrice;
            uint256 marketplaceCommision = finalPrice * marketplaceCommissionPermille / 1000;
            uint256 amountToSeller = finalPrice - marketplaceCommision;

            if (signatures[i].settlementToken == address(0)) {
                require(receivedAmount >= finalPrice, "Insufficient funds");
                receivedAmount -= finalPrice;

                payable(signatures[i].seller).transfer(amountToSeller);
                payable(marketplaceCommisionBeneficiary).transfer(marketplaceCommision);
            } else {
                IERC20 settlementToken = IERC20(signatures[i].settlementToken);

                require(settlementTokenStatusMap[address(settlementToken)], "ERC20 token not approved as a settlement token");
                require(settlementToken.transferFrom(msg.sender, signatures[i].seller, amountToSeller), "marketplace is not approved to spend the settlement tokens out of the user's balance");
                require(settlementToken.transferFrom(msg.sender, marketplaceCommisionBeneficiary, marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the user's balance");
            }
            
            token.safeTransferFrom(signatures[i].seller, msg.sender, signatures[i].tokenId, transferAmount, "");
            remainingAmount -= transferAmount;

            emit BoughtWithSig(signatures[i].seller, msg.sender, signatures[i].settlementToken, finalPrice);
        }

        require(
            remainingAmount == 0,
            "Something went wrong: make sure the signatures have enough available tokens and the marketplace is approved to manage them."
        );
        if (receivedAmount > 0) {
            payable(msg.sender).transfer(receivedAmount);
        }
    }

    function buyBySig(sellSignature memory sellSig) public nonReentrant() payable {
        bytes32 sigHash = keccak256(sellSig.signature);
        require(!sigCancelledMap[sigHash], "Signature is cancelled");

        require(address(sellSig.tokenContract) != address(0) && IERC165(sellSig.tokenContract).supportsInterface(type(IERC721).interfaceId), "wrong NFT Collection address");
        IERC721 token = IERC721(sellSig.tokenContract);
        require(token.ownerOf(sellSig.tokenId) != msg.sender, "user is already the owner of this NFT");
        require(token.ownerOf(sellSig.tokenId) == sellSig.seller, "seller is no longer the owner of this NFT");
        require(token.isApprovedForAll(token.ownerOf(sellSig.tokenId), address(this)), "marketplace is not approved as an operator");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("SellBySig(address seller,address tokenContract,uint256 tokenId,address settlementToken,uint256 settlementPrice,uint256 nonce)"),
            sellSig.seller,
            sellSig.tokenContract,
            sellSig.tokenId,
            sellSig.settlementToken,
            sellSig.settlementPrice,
            sellSig.nonce
        )));

        address signer = ECDSA.recover(digest, sellSig.signature);
        require(signer == sellSig.seller, "seller mismatch");

        uint256 marketplaceCommision = sellSig.settlementPrice * marketplaceCommissionPermille / 1000;

        if (sellSig.settlementToken == address(0)) {
            require(msg.value >= sellSig.settlementPrice, "not enough funds");

            uint256 excess = msg.value - sellSig.settlementPrice;
            if (excess > 0) {
                payable(msg.sender).transfer(excess);
            }

            payable(sellSig.seller).transfer(sellSig.settlementPrice - marketplaceCommision);
            payable(marketplaceCommisionBeneficiary).transfer(marketplaceCommision);
        } else {
            IERC20 settlementToken = IERC20(sellSig.settlementToken);
            require(settlementTokenStatusMap[address(settlementToken)], "ERC20 token is not approved as a settlement token");

            require(settlementToken.transferFrom(msg.sender, sellSig.seller, sellSig.settlementPrice - marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the user's balance");
            require(settlementToken.transferFrom(msg.sender, marketplaceCommisionBeneficiary, marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the user's balance");
        }

        token.transferFrom(sellSig.seller, msg.sender, sellSig.tokenId);
        emit BoughtWithSig(sellSig.seller, msg.sender, sellSig.settlementToken, sellSig.settlementPrice);

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(signer, sigHash);
    }

    function mintWithSignatureAndBuyBySig(NftCollection.SignedMint memory signedMint, sellSignature memory sellSig) public payable {
        require(address(sellSig.tokenContract) != address(0) && IERC165(sellSig.tokenContract).supportsInterface(type(IERC721).interfaceId), "wrong NFT Collection address");
        NftCollection collection = NftCollection(sellSig.tokenContract);

        collection.mintWithSignature(signedMint);
        buyBySig(sellSig);
    }

    function acceptOfferSig(offerSignature memory offerSig) public nonReentrant() payable {
        bytes32 sigHash = keccak256(offerSig.signature);
        require(!sigCancelledMap[sigHash], "Signature is cancelled");

        require(offerSig.buyer != msg.sender, "user cannot accept their own offer");

        require(address(offerSig.tokenContract) != address(0) && IERC165(offerSig.tokenContract).supportsInterface(type(IERC721).interfaceId), "wrong NFT Collection address");
        IERC721 token = IERC721(offerSig.tokenContract);
        require(token.ownerOf(offerSig.tokenId) != offerSig.buyer, "Buyer is already the owner of this NFT");
        require(token.ownerOf(offerSig.tokenId) == msg.sender, "User is not the owner of this NFT");
        require(token.isApprovedForAll(msg.sender, address(this)), "Marketplace is not approved to manage the user's tokens");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("OfferSig(address buyer,address tokenContract,uint256 tokenId,address settlementToken,uint256 settlementPrice,uint256 deadline,uint256 nonce)"),
            offerSig.buyer,
            offerSig.tokenContract,
            offerSig.tokenId,
            offerSig.settlementToken,
            offerSig.settlementPrice,
            offerSig.deadline,
            offerSig.nonce
        )));

        address signer = ECDSA.recover(digest, offerSig.signature);
        require(signer == offerSig.buyer, "buyer mismatch");

        uint256 marketplaceCommision = offerSig.settlementPrice * marketplaceCommissionPermille / 1000;

        if (offerSig.settlementToken == address(0)) {
            require(msg.value >= offerSig.settlementPrice, "not enough funds");

            uint256 excess = msg.value - offerSig.settlementPrice;
            if (excess > 0) {
                payable(msg.sender).transfer(excess);
            }

            payable(offerSig.buyer).transfer(offerSig.settlementPrice - marketplaceCommision);
            payable(marketplaceCommisionBeneficiary).transfer(marketplaceCommision);
        } else {
            IERC20 settlementToken = IERC20(offerSig.settlementToken);
            require(settlementTokenStatusMap[address(settlementToken)], "ERC20 token not approved as a settlement token");

            require(settlementToken.transferFrom(offerSig.buyer, msg.sender, offerSig.settlementPrice - marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the user's balance");
            require(settlementToken.transferFrom(offerSig.buyer, marketplaceCommisionBeneficiary, marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the user's balance");
        }

        token.transferFrom(msg.sender, offerSig.buyer, offerSig.tokenId);

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(signer, sigHash);
    }

    function acceptOfferSigMulti(offerSigMultiple memory offerSig) public nonReentrant() payable  {
        bytes32 sigHash = keccak256(offerSig.signature);
        require(!sigCancelledMap[sigHash], "Signature is cancelled");

        require(offerSig.buyer != msg.sender, "user cannot accept their own offer");

        require(address(offerSig.tokenContract) != address(0) && IERC165(offerSig.tokenContract).supportsInterface(type(IERC1155).interfaceId), "wrong NFT Collection address");
        IERC1155 token = IERC1155(offerSig.tokenContract);
        uint256 buyerbalance = token.balanceOf(offerSig.buyer, offerSig.tokenId);
        require(buyerbalance == 0, "Buyer is already the owner of these tokens");
        
        uint256 senderbalance = token.balanceOf(msg.sender, offerSig.tokenId);
        require(senderbalance > 0, "User is not the owner of these tokens");
        require(token.isApprovedForAll(msg.sender, address(this)), "Marketplace is not approved to manage the user's tokens");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("OfferSigMultiple(address buyer,address tokenContract,uint256 tokenId,uint256 amount,address settlementToken,uint256 settlementPrice,uint256 deadline,uint256 nonce)"),
            offerSig.buyer,
            offerSig.tokenContract,
            offerSig.tokenId,
            offerSig.amount,
            offerSig.settlementToken,
            offerSig.settlementPrice,
            offerSig.deadline,
            offerSig.nonce
        )));

        address signer = ECDSA.recover(digest, offerSig.signature);
        require(signer == offerSig.buyer, "buyer mismatch");

        uint256 marketplaceCommision = offerSig.settlementPrice * marketplaceCommissionPermille / 1000;
        
        if (offerSig.settlementToken == address(0)) {
            require(msg.value >= offerSig.settlementPrice, "not enough funds");

            uint256 excess = msg.value - offerSig.settlementPrice;
            if (excess > 0) {
                payable(msg.sender).transfer(excess);
            }

            payable(offerSig.buyer).transfer(offerSig.settlementPrice - marketplaceCommision);
            payable(marketplaceCommisionBeneficiary).transfer(marketplaceCommision);
        } else {
            IERC20 settlementToken = IERC20(offerSig.settlementToken);
            require(settlementTokenStatusMap[address(settlementToken)], "ERC20 token not approved as a settlement token");

            require(settlementToken.transferFrom(offerSig.buyer, msg.sender, offerSig.settlementPrice - marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the user's balance");
            require(settlementToken.transferFrom(offerSig.buyer, marketplaceCommisionBeneficiary, marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the user's balance");
        }
        
        token.safeTransferFrom(msg.sender, offerSig.buyer, offerSig.tokenId, offerSig.amount, "");

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(signer, sigHash);
    }

    function acceptBid(bidSignature memory bidSig, auctionSignature memory auctionSig) public nonReentrant() {
        require(address(auctionSig.tokenContract) != address(0) && IERC165(auctionSig.tokenContract).supportsInterface(type(IERC721).interfaceId), "wrong NFT Collection address");
        IERC721 token = IERC721(auctionSig.tokenContract);
        address tokenOwner = token.ownerOf(auctionSig.tokenId);

        require(token.isApprovedForAll(auctionSig.seller, address(this)), "Marketplace is not approved to manage the seller's tokens");
        require(tokenOwner == auctionSig.seller, "Seller is not the owner of this NFT");
        
        if (hasRole(EXECUTOR, msg.sender)) {
            require(block.timestamp >= auctionSig.expirationDate, "Auction has not ended yet");
        } else {
            require(bidSig.bidder != msg.sender, "User cannot be the bidder");
            require(tokenOwner == msg.sender, "User is not the owner of this NFT");
        }

        bytes32 auctionSigHash = keccak256(auctionSig.signature);
        require(!sigCancelledMap[auctionSigHash], "Auction signature is cancelled");

        bytes32 bidSigHash = keccak256(bidSig.signature);
        require(!sigCancelledMap[bidSigHash], "Bid signature is cancelled");

        require(auctionSig.tokenContract == bidSig.tokenContract, "NFT contract mismatch");
        require(auctionSig.tokenId == bidSig.tokenId, "token ID mismatch");
        require(auctionSig.settlementToken == bidSig.settlementToken, "settlement token missmatch");
        require(auctionSig.settlementToken != address(0), "settlement token for auctions/bids cannot be XVM");
        require(auctionSig.minimumBidPrice <= bidSig.bidValue, "Bid less than the minimum bid price");

        bytes32 auctionSigDigest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("SellByAuction(address seller,address tokenContract,uint256 tokenId,address settlementToken,uint256 minimumBidPrice,uint256 reservePrice,uint256 expirationDate,uint256 nonce)"),
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
        require(auctionSigSigner == auctionSig.seller, "seller mismatch");

        bytes32 bidSigDigest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("BidSignature(address bidder,address tokenContract,uint256 tokenId,address settlementToken,uint256 bidValue,uint256 nonce)"),
            bidSig.bidder,
            bidSig.tokenContract,
            bidSig.tokenId,
            bidSig.settlementToken,
            bidSig.bidValue,
            bidSig.nonce
        )));

        address bidSigSigner = ECDSA.recover(bidSigDigest, bidSig.signature);
        require(bidSigSigner == bidSig.bidder, "bidder mismatch");

        IERC20 settlementToken = IERC20(auctionSig.settlementToken);
        require(settlementTokenStatusMap[address(settlementToken)], "ERC20 token not approved as a settlement token");

        uint256 marketplaceCommision = bidSig.bidValue * marketplaceCommissionPermille / 1000;
        uint256 toSeller = bidSig.bidValue - marketplaceCommision;
        
        require(settlementToken.transferFrom(bidSig.bidder, marketplaceCommisionBeneficiary, marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the bidder's balance");
        require(settlementToken.transferFrom(bidSig.bidder, auctionSig.seller, toSeller), "marketplace is not approved to spend the settlement tokens out of the bidder's balance");
        
        token.transferFrom(auctionSig.seller, bidSig.bidder, auctionSig.tokenId);

        sigCancelledMap[auctionSigHash] = true;
        emit SignatureCancelled(auctionSig.seller, auctionSigHash);

        sigCancelledMap[bidSigHash] = true;
        emit SignatureCancelled(bidSig.bidder, bidSigHash);
    }

    function acceptBidMultiple(bidSignatureMultiple memory bidSigMulti, auctionSignatureMultiple memory auctionSigMulti) public nonReentrant() {
        require(address(auctionSigMulti.tokenContract) != address(0) && IERC165(auctionSigMulti.tokenContract).supportsInterface(type(IERC1155).interfaceId), "wrong NFT Collection address");
        IERC1155 token = IERC1155(auctionSigMulti.tokenContract);

        require(token.balanceOf(auctionSigMulti.seller, auctionSigMulti.tokenId) >= auctionSigMulti.amount, "The seller does not have enough NFTs");
        require(token.isApprovedForAll(auctionSigMulti.seller, address(this)), "Marketplace is not approved to manage the seller's tokens");

        if (hasRole(EXECUTOR, msg.sender)) {
            require(block.timestamp >= auctionSigMulti.expirationDate, "Auction has not ended yet");
        } else {
            require(auctionSigMulti.seller == msg.sender, "User is not the auction seller");
            require(bidSigMulti.bidder != msg.sender, "User cannot be the bidder");
        }

        bytes32 auctionSigHash = keccak256(auctionSigMulti.signature);
        require(!sigCancelledMap[auctionSigHash], "Auction signature is cancelled");

        bytes32 bidSigHash = keccak256(bidSigMulti.signature);
        require(!sigCancelledMap[bidSigHash], "Bid signature is cancelled");

        require(auctionSigMulti.tokenContract == bidSigMulti.tokenContract, "NFT contract mismatch");
        require(auctionSigMulti.tokenId == bidSigMulti.tokenId, "token ID mismatch");
        require(auctionSigMulti.settlementToken == bidSigMulti.settlementToken, "settlement token missmatch");
        require(auctionSigMulti.settlementToken != address(0), "settlement token for auctions/bids cannot be XVM");
        require(auctionSigMulti.minimumBidPrice <= bidSigMulti.bidValue, "Bid less than the minimum bid price");
        require(auctionSigMulti.amount == bidSigMulti.amount,"amount mismutch");
        require(settlementTokenStatusMap[auctionSigMulti.settlementToken], "settlement token is not approved");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("SellByAuctionMultiple(address seller,address tokenContract,uint256 tokenId,uint256 amount,address settlementToken,uint256 minimumBidPrice,uint256 reservePrice,uint256 expirationDate,uint256 nonce)"),
            auctionSigMulti.seller,
            auctionSigMulti.tokenContract,
            auctionSigMulti.tokenId,
            auctionSigMulti.amount,
            auctionSigMulti.settlementToken,
            auctionSigMulti.minimumBidPrice,
            auctionSigMulti.reservePrice,
            auctionSigMulti.expirationDate,
            auctionSigMulti.nonce
        )));

        address signer = ECDSA.recover(digest, auctionSigMulti.signature);
        require(signer == auctionSigMulti.seller, "seller mismatch");
        
        bytes32 bidSigDigest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("BidSignatureMultiple(address bidder,address tokenContract,uint256 tokenId,uint256 amount,address settlementToken,uint256 bidValue,uint256 nonce)"),
            bidSigMulti.bidder,
            bidSigMulti.tokenContract,
            bidSigMulti.tokenId,
            bidSigMulti.amount,
            bidSigMulti.settlementToken,
            bidSigMulti.bidValue,
            bidSigMulti.nonce
        )));

        address bidSigSigner = ECDSA.recover(bidSigDigest, bidSigMulti.signature);
        require(bidSigSigner == bidSigMulti.bidder, "bidder mismatch");
        
        IERC20 settlementToken = IERC20(auctionSigMulti.settlementToken);
        uint256 marketplaceCommision = bidSigMulti.bidValue * marketplaceCommissionPermille / 1000;
        uint256 toSeller = bidSigMulti.bidValue - marketplaceCommision;
        
        require(settlementToken.transferFrom(bidSigMulti.bidder, marketplaceCommisionBeneficiary, marketplaceCommision), "marketplace is not approved to spend the settlement tokens out of the bidder's balance");
        require(settlementToken.transferFrom(bidSigMulti.bidder, auctionSigMulti.seller, toSeller), "marketplace is not approved to spend the settlement tokens out of the bidder's balance");

        token.safeTransferFrom(auctionSigMulti.seller, bidSigMulti.bidder, auctionSigMulti.tokenId, auctionSigMulti.amount, "");

        sigCancelledMap[auctionSigHash] = true;
        emit SignatureCancelled(auctionSigMulti.seller, auctionSigHash);

        sigCancelledMap[bidSigHash] = true;
        emit SignatureCancelled(bidSigMulti.bidder, bidSigHash);
    }
}