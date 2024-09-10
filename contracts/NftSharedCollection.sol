// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "./NftCollectionFactory.sol";
import "./NftCollection.sol";
import "hardhat/console.sol";

/// @title A parametric NFT collection
/// @author Alexandros Andreou
/// @notice This smart contract is intended to be used by a smart contract factory
/// @dev Still needs testing
contract NftSharedCollection is NftCollection {
    /// @notice constructor used to force implementation initialization
    /// @dev https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializing_the_implementation_contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initializeSharedCollection (
        address _collectionCreator,
        string memory _baseUri,
        string memory _contractUri,
        address _beneficiary,
        uint256 _royaltyPercentNominator,
        uint256 _royaltyPercentDenominator,
        address _rentingProtocolAddress
    ) public initializer {
        NftCollection.initialize(
            _collectionCreator,
            "Shared NFT Collection",
            "SHRD",
            _baseUri,
            _contractUri,
            _beneficiary,
            _royaltyPercentNominator,
            _royaltyPercentDenominator,
            _rentingProtocolAddress
        );
    }


    /// @notice Checks if the upgrade is authorized
    //  @param newImplementation this is the new implementation passed from upgradeTo
    function _authorizeUpgrade(address newImplementation)
        internal
        view
        override
    {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
    }

    /// @notice Mint NFT by admin
    /// @dev Currently the admin owns the minted NFT, if it should be the smart contract then
    //          ERC721Receiver must be implemented
    /// @dev Left the check for existing token if to the _mint function
    /// @param _tokenId The token id of the new NFT
    /// @return returns minted token id
    function mint(uint256 _tokenId) public override returns (uint256) {
        _mint(msg.sender, _tokenId);
        return _tokenId;
    }

    function mintWithSignature(SignedMint memory sigMint) public override {
        require(!cancelledSignatures[sigMint.signature], "Signature is cancelled");

        if (!_exists(sigMint.tokenId)) {
            require(sigMint.from != address(0), "invalid from address");

            address signer = ECDSA.recover(
                _hash(sigMint.from, sigMint.tokenId, sigMint.nonce),
                sigMint.signature
            );
            require(signer == sigMint.from, "signer mismatch");

            cancelledSignatures[sigMint.signature] = true;
            _mint(sigMint.from, sigMint.tokenId);
        }
    }


    /// @notice Mint NFT
    /// @dev Assumes that if tryRecover returns ECDSA.RecoverError.NoError the signature is safe
    /// @param from source of token id
    /// @param tokenId the token id to be transfered
    /// @param data the lazy-minted data
    function mintWithSignatureAndSafeTransferFrom(
        address from,
        uint256 tokenId,
        bytes memory data
    ) public {
        // SignedMint memory signedMint = abi.decode(data, (SignedMint));
        address sigFrom;
        uint256 sigTokenId;
        uint256 sigNonce;
        bytes memory sigSignature;
        address signer;

        if (!_exists(tokenId)) {
            (sigFrom, sigTokenId, sigNonce, sigSignature) = abi.decode(
                data,
                (address, uint256, uint256, bytes)
            );
            SignedMint memory signedMint;
            signedMint.from = sigFrom;
            signedMint.tokenId = sigTokenId;
            signedMint.nonce = sigNonce;

            require(!cancelledSignatures[sigSignature], "Signature is cancelled");

            address _signer = ECDSA.recover(
                _hash(sigFrom, sigTokenId, sigNonce),
                sigSignature
            );

            signer = _signer;
            require(signer == sigFrom, "Seller mismatch");
            require(signer != address(0), "Seller cannot be 0");

            _mint(sigFrom, tokenId);
        }

        safeTransferFrom(from, signer, tokenId);
    }
}