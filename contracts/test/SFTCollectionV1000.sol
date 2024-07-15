// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.6/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.6/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.6/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.6/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.6/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "../NftCollectionFactory.sol";
import "../ISFTCollection.sol";

contract SFTCollectionV1000 is
    ISFTCollection,
    Initializable,
    ERC1155Upgradeable,
    UUPSUpgradeable,
    EIP712Upgradeable,
    AccessControlUpgradeable
{
    address public collectionCreator;
    address public implementationProvider;
    string public name;
    string public symbol;
    string public baseUri;
    string public contractUri;
    address public beneficiary;
    uint256 public royaltyPercentNominator;
    uint256 public royaltyPercentDenominator;
    bool public frozen;

    bytes4 public constant SFTCollectionInterfaceId = type(ISFTCollection).interfaceId;

    bytes32 internal constant SIGNED_MINT_TYPEHASH = keccak256("mintWithSig(address from,uint256 tokenId,uint256 amount,uint256 nonce)");
    bytes32 internal constant SIGNED_MINT_BATCH_TYPEHASH = keccak256("mintBatchWithSig(address from,uint256[] tokenIds,uint256[] amounts,uint256 nonce)");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _collectionCreator,
        string memory _name,
        string memory _symbol,
        string memory _baseUri,
        string memory _contractUri,
        address _beneficiary,
        uint256 _royaltyPercentNominator,
        uint256 _royaltyPercentDenominator
    ) public virtual initializer {
        require(
            2 * _royaltyPercentNominator <= _royaltyPercentDenominator,
            "Royalties must be up to 50%"
        );
        __ERC1155_init(_baseUri);
        __AccessControl_init();
        __EIP712_init(_name, "0.0.1");
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _collectionCreator);

        name = _name;
        symbol = _symbol;
        baseUri = _baseUri;
        contractUri = _contractUri;
        collectionCreator = _collectionCreator;
        implementationProvider = msg.sender;
        beneficiary = _beneficiary;
        royaltyPercentNominator = _royaltyPercentNominator;
        royaltyPercentDenominator = _royaltyPercentDenominator;
        frozen = false;

        emit NewBaseURI("", baseUri);
    }

    function _baseURI() internal view returns (string memory) {
        return baseUri;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        view
        virtual
        override
    {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        require(
            NftCollectionFactory(implementationProvider).implToSFTVersion(
                newImplementation
            ) != 0,
            "Implementation does not exist"
        );
    }

    function setBaseURI(string memory _baseUri) public {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        require(frozen == false, "Metadata frozen");
        
        string memory oldBaseUri = baseUri;
        baseUri = _baseUri;

        emit NewBaseURI(oldBaseUri, baseUri);
    }

    function setContractURI(string memory _contractUri) public {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );

        string memory oldContractUri = contractUri;
        contractUri = _contractUri;

        emit NewContractURI(oldContractUri, contractUri);
    }

    function setBeneficiary(address _beneficiary) public {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );

        beneficiary = _beneficiary;
    }

    function setRoyalties(
        uint256 _royaltyPercentNominator,
        uint256 _royaltyPercentDenominator
    ) public {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        require(
            2 * _royaltyPercentNominator <= _royaltyPercentDenominator,
            "Royalties must be up to 50%"
        );

        royaltyPercentNominator = _royaltyPercentNominator;
        royaltyPercentDenominator = _royaltyPercentDenominator;
    }

    function mint(uint256 _tokenId, uint256 _amount) public virtual {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );

        _mint(msg.sender, _tokenId, _amount, "");
    }

    function mintBatch(uint256[] memory _tokenIds, uint256[] memory _amounts) public virtual {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );

        _mintBatch(msg.sender, _tokenIds, _amounts, "");
    }

    function freeze() public {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        require(frozen == false, "Metadata already frozen");
        
        frozen = true;
    }

    function mintWithSignature(SignedMint memory sigMint) public virtual {
        require(sigMint.from != address(0), "invalid from address");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            SIGNED_MINT_TYPEHASH,
            sigMint.from,
            sigMint.tokenId,
            sigMint.amount,
            sigMint.nonce
        )));
        address signer = ECDSAUpgradeable.recover(digest, sigMint.signature);

        require(signer == sigMint.from, "signer mismatch");
        require(
            hasRole(DEFAULT_ADMIN_ROLE, signer),
            "Signer not allowed to lazy mint"
        );

        _mint(sigMint.from, sigMint.tokenId, sigMint.amount, "");
    }

    function mintBatchWithSignature(SignedMintBatch memory sigMintBatch) public virtual {
        require(sigMintBatch.from != address(0), "invalid from address");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            SIGNED_MINT_BATCH_TYPEHASH,
            sigMintBatch.from,
            keccak256(abi.encodePacked(sigMintBatch.tokenIds)),
            keccak256(abi.encodePacked(sigMintBatch.amounts)),
            sigMintBatch.nonce
        )));
        address signer = ECDSAUpgradeable.recover(digest, sigMintBatch.signature);

        require(signer == sigMintBatch.from, "signer mismatch");
        require(
            hasRole(DEFAULT_ADMIN_ROLE, signer),
            "Signer not allowed to lazy mint"
        );

        _mintBatch(sigMintBatch.from, sigMintBatch.tokenIds, sigMintBatch.amounts, "");
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(
            ERC1155Upgradeable,
            AccessControlUpgradeable
        )
        returns (bool)
    {
        return interfaceId == SFTCollectionInterfaceId || super.supportsInterface(interfaceId);
    }

    string public newstuff;

    function setNewStuffV1000(string memory _newstuff) public {
        newstuff = _newstuff;
    }

    function newStuffLength() public view returns (uint256) {
        return bytes(newstuff).length;
    }
}