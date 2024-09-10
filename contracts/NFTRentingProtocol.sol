// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./NftCollection.sol";

error originalOwnerMismatch(address expected, address got);

contract NFTRenting is Initializable, AccessControlUpgradeable, UUPSUpgradeable, EIP712Upgradeable {
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    bytes32 private constant MESSAGE_TYPEHASH = keccak256("rentBySig(address originalOwner,address tokenContract,uint256 tokenId,address settlementToken,uint256 dailyPrice,bool prematureReturnAllowed,uint256 minimumDays,uint256 maximumDays,bool multipleRentSessionsAllowed,uint256 rentListingExpiry,uint256 nonce)");
    uint32 private constant SECONDS_IN_DAY = 86400;

    uint256 protocolFeeNumerator;
    uint256 protocolFeeDenominator;
    address protocolFeeReceiver;

    struct rentListingSignature {
        address originalOwner;
        address tokenContract;
        uint256 tokenId;
        address settlementToken;
        uint256 dailyPrice;
        bool prematureReturnAllowed;
        uint256 minimumDays;
        uint256 maximumDays;
        bool multipleRentSessionsAllowed;
        uint256 rentListingExpiry;
        uint256 nonce;
        bytes signature;
    }

    mapping (bytes32 => bool) private sigCancelledMap;

    event SignatureCancelled(address indexed signer, bytes32 indexed signatureHash);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __EIP712_init("NFTSpace NFT Renting Protocol", "0.0.3");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
        _grantRole(FEE_MANAGER_ROLE, msg.sender);

        setProtocolFeeBasisPoints(0);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}

    function setProtocolFeeCustom(uint256 numerator, uint256 denominator) public payable {
        require(hasRole(FEE_MANAGER_ROLE, msg.sender), "Caller has no fee manager role");
        require(denominator != 0, "Denominator cannot be 0");
        require(numerator * 2 <= denominator, "Numerator must not be more than half the value of denominator");
        protocolFeeNumerator = numerator;
        protocolFeeDenominator = denominator;
    }

    function setProtocolFeeBasisPoints(uint256 bps) public payable {
        require(hasRole(FEE_MANAGER_ROLE, msg.sender), "Caller has no fee manager role");
        require(bps <= 5000, "Protocol fee cannot be more than 5000 basis points");
        protocolFeeNumerator = bps;
        protocolFeeDenominator = 10000;
    }

    function setProtocolFeeReceiver(address receiver) public {
        require(hasRole(FEE_MANAGER_ROLE, msg.sender), "Caller has no fee manager role");
        protocolFeeReceiver = receiver;
    }

    function rentWithSig(uint256 rentalPeriod, rentListingSignature memory rentSig) public payable {
        bytes32 sigHash = keccak256(rentSig.signature);

        require(sigCancelledMap[sigHash] == false, "singature was cancelled");
        require(block.timestamp <= rentSig.rentListingExpiry, "Signature is expired");
        require(rentSig.tokenContract != address(0), "invalid token contract address");
        require(rentalPeriod <= rentSig.maximumDays, "the rental period cannot be less than the minimum allowable");
        require(rentalPeriod >= rentSig.minimumDays, "the rental period cannot be longer than the maximum allowable");

        NftCollection tokenContract = NftCollection(rentSig.tokenContract);
        require(tokenContract.supportsInterface(type(IERC721).interfaceId), "ERC721 interface not supported");
        require(tokenContract.temporaryOwner(rentSig.tokenId) == address(0), "This NFT is already in an active rent session");
        require(tokenContract.ownerOf(rentSig.tokenId) != msg.sender, "user is already the owner of this NFT");
        require(tokenContract.hasRole(tokenContract.RENTING_OPERATOR_ROLE(), address(this)), "renting protocol contract is not authorized to rent NFTs from this contract");

        bytes32 messageHash = keccak256(abi.encode(
            MESSAGE_TYPEHASH,
            rentSig.originalOwner,
            rentSig.tokenContract,
            rentSig.tokenId,
            rentSig.settlementToken,
            rentSig.dailyPrice,
            rentSig.prematureReturnAllowed,
            rentSig.minimumDays,
            rentSig.maximumDays,
            rentSig.multipleRentSessionsAllowed,
            rentSig.rentListingExpiry,
            rentSig.nonce
        ));

        bytes32 digest = _hashTypedDataV4(messageHash);
        address signer = ECDSAUpgradeable.recover(digest, rentSig.signature);
        
        if (signer != rentSig.originalOwner) {
            revert originalOwnerMismatch({
                expected: rentSig.originalOwner,
                got: signer
            });
        }

        require(signer != address(0), "original owner cannot be 0");

        uint256 totalPrice = rentSig.dailyPrice * rentalPeriod;
        uint256 protocolFee = totalPrice * protocolFeeNumerator / protocolFeeDenominator;
        uint256 originalOwnerPayment = totalPrice - protocolFee;

        IERC20 settlementToken = IERC20(rentSig.settlementToken);
        if (rentSig.settlementToken != address(0)) {
            require(settlementToken.allowance(msg.sender, address(this)) >= totalPrice, "rental protocol is not approved to spend user's tokens");

            settlementToken.transferFrom(msg.sender, rentSig.originalOwner, originalOwnerPayment);
            settlementToken.transferFrom(msg.sender, protocolFeeReceiver, protocolFee);
        } else {
            require(msg.value >= totalPrice, "not enough funds");
            if (msg.value > totalPrice) {
                payable(msg.sender).transfer(msg.value - totalPrice);
            }

            payable(rentSig.originalOwner).transfer(originalOwnerPayment);
            payable(protocolFeeReceiver).transfer(protocolFee);
        }

        // rent nft to temporary owner
        uint256 rentReturnTimestamp = block.timestamp + (rentalPeriod * SECONDS_IN_DAY);
        tokenContract.rentNFT(rentSig.originalOwner, msg.sender, rentSig.tokenId, rentReturnTimestamp, rentSig.prematureReturnAllowed);
    }

    function returnNFT(address _tokenContract, uint256 _tokenId) public {
        require(_tokenContract != address(0), "invalid token contract address");
        NftCollection tokenContract = NftCollection(_tokenContract);
        require(tokenContract.supportsInterface(type(IERC721).interfaceId), "ERC721 interface not supported");
        require(tokenContract.supportsInterface(tokenContract.NftContractRentableInterfaceId()), "ERC721Rentable interface not supported");
        require(tokenContract.temporaryOwner(_tokenId) != address(0), "No active rent for this NFT");

        // WILL BE IMPLEMENTED IN THE FUTURE
        // if (tokenContract.rentTime(_tokenId) <= block.timestamp) {
        //     require(tokenContract.prematureReturnAllowed(_tokenId), "Premature return not allowed");
        //     require(msg.sender == tokenContract.temporaryOwner(_tokenId), "Only temporary owner can return NFT before rent time");
        // }
        require (tokenContract.rentTime(_tokenId) <= block.timestamp, "Rent time has not expired yet"); // not needed if premature return is implemented
        
        require(tokenContract.hasRole(tokenContract.RENTING_OPERATOR_ROLE(), address(this)), "renting protocol contract is not authorized to rent/return NFTs from/to this NFT contract");
        tokenContract.returnNFT(_tokenId);
    }

    function cancelRentSig(rentListingSignature memory rentSig) public {
        require(msg.sender == rentSig.originalOwner, "only original owner can cancel a rent signature");
        bytes32 sigHash = keccak256(rentSig.signature);
        require(sigCancelledMap[sigHash] == false, "signature was cancelled already");
        
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            MESSAGE_TYPEHASH,
            rentSig.originalOwner,
            rentSig.tokenContract,
            rentSig.tokenId,
            rentSig.settlementToken,
            rentSig.dailyPrice,
            rentSig.prematureReturnAllowed,
            rentSig.minimumDays,
            rentSig.maximumDays,
            rentSig.multipleRentSessionsAllowed,
            rentSig.rentListingExpiry,
            rentSig.nonce
        )));
        address signer = ECDSA.recover(digest, rentSig.signature);

        if (signer != msg.sender) {
            revert originalOwnerMismatch({
                expected: msg.sender,
                got: signer
            });
        }

        if (signer != rentSig.originalOwner) {
            revert originalOwnerMismatch({
                expected: rentSig.originalOwner,
                got: signer
            });
        }
        require(signer != address(0), "original owner cannot be 0");

        sigCancelledMap[sigHash] = true;
        emit SignatureCancelled(signer, sigHash);
    }

    function getCanceledSig(bytes32 _sigHash) public view returns(bool) {
        return sigCancelledMap[_sigHash];
    } 
}
