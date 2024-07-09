// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "./NftCollectionFactory.sol";
import "./SFTCollection.sol";

contract SFTSharedCollection is SFTCollection {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initializeSharedSFTContract(
        address _collectionCreator,
        string memory _baseUri,
        string memory _contractUri,
        address _beneficiary,
        uint256 _royaltyPercentNominator,
        uint256 _royaltyPercentDenominator
    ) public initializer() {
        SFTCollection.initialize(
            _collectionCreator,
            "Shared SFT Collection",
            "SHRD",
            _baseUri,
            _contractUri,
            _beneficiary,
            _royaltyPercentNominator,
            _royaltyPercentDenominator
        );
    }

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

    function mint(uint256 _tokenId, uint256 _amount) public override {
        _mint(msg.sender, _tokenId, _amount, "");
    }

    function mintBatch(uint256[] memory _tokenIds, uint256[] memory _amounts) public override {
        _mintBatch(msg.sender, _tokenIds, _amounts, "");
    }

    function mintWithSignature(SignedMint memory sigMint) public override {
        require(sigMint.from != address(0), "invalid from address");
        require(!cancelledSignatures[sigMint.signature], "Signature is cancelled");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            SIGNED_MINT_TYPEHASH,
            sigMint.from,
            sigMint.tokenId,
            sigMint.amount,
            sigMint.nonce
        )));
        address signer = ECDSAUpgradeable.recover(digest, sigMint.signature);
        require(signer == sigMint.from, "signer mismatch");
        
        cancelledSignatures[sigMint.signature] = true;
        _mint(sigMint.from, sigMint.tokenId, sigMint.amount, "");
    }

    function mintBatchWithSignature(SignedMintBatch memory sigMintBatch) public override virtual {
        require(sigMintBatch.from != address(0), "invalid from address");
        require(!cancelledSignatures[sigMintBatch.signature], "Signature is cancelled");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            SIGNED_MINT_BATCH_TYPEHASH,
            sigMintBatch.from,
            keccak256(abi.encodePacked(sigMintBatch.tokenIds)),
            keccak256(abi.encodePacked(sigMintBatch.amounts)),
            sigMintBatch.nonce
        )));
        address signer = ECDSAUpgradeable.recover(digest, sigMintBatch.signature);
        require(signer == sigMintBatch.from, "signer mismatch");

        cancelledSignatures[sigMintBatch.signature] = true;
        _mintBatch(sigMintBatch.from, sigMintBatch.tokenIds, sigMintBatch.amounts, "");
    }
}