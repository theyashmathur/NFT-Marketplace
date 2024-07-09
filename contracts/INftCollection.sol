// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface INftCollection {

    struct SignedMint {
        address from;
        uint256 tokenId;
        uint256 nonce;
        bytes signature;
    }

    function initialize(
        address _collectionCreator,
        string memory _name,
        string memory _symbol,
        string memory _baseUri,
        string memory _contractUri,
        address _beneficiary,
        uint256 _royaltyPercentNominator,
        uint256 _royaltyPercentDenominator,
        address _rentingProtocolAddress
    ) external;

    function royaltyInfo(uint256 _tokenId, uint256 _salePrice) external view returns (address, uint256);

    function setBaseURI(string memory _baseUri) external;

    function setContractURI(string memory _contractUri) external;

    function setBeneficiary(address _beneficiary) external;
    
    function setRoyalties(uint256 _royaltyPercentNominator, uint256 _royaltyPercentDenominator) external;

    function mint(uint256 _tokenId) external returns (uint256);

    function setFreeze(bool _frozen) external;

    function cancelSignature(SignedMint memory sigMint) external;

    function mintWithSignature(SignedMint memory sigMint) external;

    function rentNFT(
        address originalOwner, 
        address _temporaryOwner, 
        uint256 tokenId, 
        uint256 rentReturnTimestamp, 
        bool _prematureReturnAllowed
    ) external;
    
    function returnNFT(uint256 tokenId) external;

    function supportsInterface(bytes4 interfaceId) external view returns (bool);

}