// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

interface ISFTCollection {
    event NewBaseURI(string indexed OldBaseUri, string indexed NewBaseUri);
    event NewContractURI(string indexed OldContractUri, string indexed NewContractUri);

    struct SignedMint {
        address from;
        uint256 tokenId;
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    struct SignedMintBatch {
        address from;
        uint256[] tokenIds;
        uint256[] amounts;
        uint256 nonce;
        bytes signature;
    }

    function setBaseURI(string memory _baseUri) external;
    function setContractURI(string memory _contractUri) external;
    function setBeneficiary(address _beneficiary) external;
    function setRoyalties(uint256 _royaltyPercentNominator, uint256 _royaltyPercentDenominator) external;
    function mint(uint256 _tokenId, uint256 _amount) external;
    function mintBatch(uint256[] memory _tokenIds, uint256[] memory _amounts) external;
    function freeze() external;
    function mintWithSignature(SignedMint memory sigMint) external;
    function mintBatchWithSignature(SignedMintBatch memory sigMintBatch) external;
}