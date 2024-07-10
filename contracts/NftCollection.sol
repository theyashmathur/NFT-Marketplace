// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165StorageUpgradeable.sol";
import "./NftCollectionFactory.sol";
import "./INftCollection.sol";

/// @title A parametric NFT collection
/// @notice This smart contract is intended to be used by a smart contract factory
/// @dev Still needs testing
contract NftCollection is
    Initializable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    UUPSUpgradeable,
    EIP712Upgradeable,
    AccessControlUpgradeable,
    ERC165StorageUpgradeable
{
    uint256 public constant version = 1;
    address public collectionCreator;
    address public implementationProvider;
    string public baseUri;
    string public contractUri;
    address public beneficiary;
    uint256 public royaltyPercentNominator;
    uint256 public royaltyPercentDenominator;
    bool public frozen;

    struct SignedMint {
        address from;
        uint256 tokenId;
        uint256 nonce;
        bytes signature;
    }

    mapping (bytes => bool) public cancelledSignatures;

    event NewBaseURI(string _baseUri);
    event PermanentBaseURI(string _baseUri);

    /// @notice constructor used to force implementation initialization
    /// @dev https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializing_the_implementation_contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Used instead of constructor for UUPS upgradeable contracts
    /// @dev Could consider requiring _royaltyPercentNominator <  _royaltyPercentDenominator
    /// @param _collectionCreator The collection creator address and also initial admin
    /// @param _name The name that will be used for the collection
    /// @param _symbol The symbol that will be used for the collection
    /// @param _baseUri The inital base URI that will be used to generate the token URIs
    /// @param _contractUri The contract URI that points to contract level metadata
    /// @param _beneficiary The beneficiary of royalties
    /// @param _royaltyPercentNominator The nominator for the royalty percentage
    /// @param _royaltyPercentDenominator The denominator for the royalty percentage
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
        __ERC721_init(_name, _symbol);
        __ERC721Enumerable_init();
        __AccessControl_init();
        __EIP712_init(_name, "0.0.1");
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _collectionCreator);

        _registerInterface(type(INftCollection).interfaceId);
        _registerInterface(type(IERC721Upgradeable).interfaceId);
        _registerInterface(type(AccessControlUpgradeable).interfaceId);

        baseUri = _baseUri;
        contractUri = _contractUri;
        collectionCreator = _collectionCreator;
        implementationProvider = msg.sender;
        beneficiary = _beneficiary;
        royaltyPercentNominator = _royaltyPercentNominator;
        royaltyPercentDenominator = _royaltyPercentDenominator;
        frozen = false;
        emit NewBaseURI(baseUri);
    }

    /// @notice Used to fetch the baseURI to be used for the tokenURI
    /// @return return baseURI
    function _baseURI() internal view override returns (string memory) {
        return baseUri;
    }

    /// @notice Called with the sale price to determine how much royalty
    //          is owed and to whom.
    /// @param _tokenId - the NFT asset queried for royalty information
    /// @param _salePrice - the sale price of the NFT asset specified by _tokenId
    /// @return receiver - address of who should be sent the royalty payment
    /// @return royaltyAmount - the royalty payment amount for _salePrice
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice)
        external
        view
        returns (address, uint256)
    {
        require(_exists(_tokenId), "Token id does not exist");
        return (
            beneficiary,
            (_salePrice * royaltyPercentNominator) / royaltyPercentDenominator
        );
    }

    // only owner

    /// @notice Checks if the upgrade is authorized
    //  @param newImplementation this is the new implementation passed from upgradeTo
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
            NftCollectionFactory(implementationProvider).implToVersion(
                newImplementation
            ) != 0,
            "Implementation does not exist"
        );
    }

    /// @notice Update base URI by admin
    /// @param _baseUri - the new base URI
    function setBaseURI(string memory _baseUri) public {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        require(frozen == false, "Metadata frozen");
        baseUri = _baseUri;
        emit NewBaseURI(baseUri);
    }

    /// @notice Update contract URI by admin
    /// @param _contractUri - the new contract URI
    function setContractURI(string memory _contractUri) public {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        contractUri = _contractUri;
    }

    /// @notice Update beneficiary of royalty by admin
    /// @param _beneficiary The new nominator for the royalty percentage
    function setBeneficiary(address _beneficiary) public virtual {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        beneficiary = _beneficiary;
    }

    /// @notice Update nominator and denominator of royalty percentage by admin
    /// @dev Could consider requiring _royaltyPercentNominator <  _royaltyPercentDenominator
    /// @param _royaltyPercentNominator The new nominator for the royalty percentage
    /// @param _royaltyPercentDenominator The new denominator for the royalty percentage
    function setRoyalties(
        uint256 _royaltyPercentNominator,
        uint256 _royaltyPercentDenominator
    ) public virtual {
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

    /// @notice Mint NFT by admin
    /// @dev Currently the admin owns the minted NFT, if it should be the smart contract then
    //          ERC721Receiver must be implemented
    /// @dev Left the check for existing token if to the _mint function
    /// @param _tokenId The token id of the new NFT
    /// @return returns minted token id
    function mint(uint256 _tokenId) public virtual returns (uint256) {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        _mint(msg.sender, _tokenId);
        return _tokenId;
    }

    /// @notice Freeze metadata
    function freeze() public virtual {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Account has no admin role"
        );
        require(frozen == false, "Metadata already frozen");
        frozen = true;
        emit PermanentBaseURI(baseUri);
    }

    /// @notice Generate hash to use for typed signature
    /// @param from source of token id
    /// @param tokenId the token id to be transfered
    /// @param nonce a unique nonce
    /// @return returns the hash of the typed data to be signed
    function _hash(
        address from,
        uint256 tokenId,
        uint256 nonce
    ) internal view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "SignedMint(address from,uint256 tokenId,uint256 nonce)"
                        ),
                        from,
                        tokenId,
                        nonce
                    )
                )
            );
    }

    function cancelSignature(SignedMint memory sigMint) public {
        require(!cancelledSignatures[sigMint.signature], "Signature is already cancelled");

        address signer = ECDSA.recover(
            _hash(sigMint.from, sigMint.tokenId, sigMint.nonce),
            sigMint.signature
        );
        require(signer == msg.sender, "Only the signer can cancell this signature");

        cancelledSignatures[sigMint.signature] = true;
    }

    function mintWithSignature(SignedMint memory sigMint) public virtual {
        require(!cancelledSignatures[sigMint.signature], "Signature is cancelled");

        if (!_exists(sigMint.tokenId)) {
            require(sigMint.from != address(0), "invalid from address");

            address signer = ECDSA.recover(
                _hash(sigMint.from, sigMint.tokenId, sigMint.nonce),
                sigMint.signature
            );
            require(signer == sigMint.from, "signer mismatch");
            require(
                hasRole(DEFAULT_ADMIN_ROLE, signer),
                "Signer not allowed to lazy mint"
            );

            cancelledSignatures[sigMint.signature] = true;
            _mint(sigMint.from, sigMint.tokenId);
        }
    }


    /// @notice Mint NFT by admin and transfer
    /// @dev Assumes that if tryRecover returns ECDSA.RecoverError.NoError the signature is safe
    /// @param from source of token id
    /// @param to desintation of token id
    /// @param tokenId the token id to be transfered
    /// @param data the lazy-minted data
    function mintWithSignatureAndSafeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public virtual {
        // SignedMint memory signedMint = abi.decode(data, (SignedMint));
        address sigFrom;
        uint256 sigTokenId;
        uint256 sigNonce;
        bytes memory sigSignature;

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

            address signer = ECDSA.recover(
                _hash(sigFrom, sigTokenId, sigNonce),
                sigSignature
            );

            require(
                hasRole(DEFAULT_ADMIN_ROLE, signer),
                "Signer not allowed to lazy mint"
            );
            require(signer == sigFrom, "Seller mismatch");
            require(signer != address(0), "Seller cannot be 0");

            cancelledSignatures[sigSignature] = true;
            _mint(sigFrom, tokenId);
        }

        safeTransferFrom(from, to, tokenId);
    }


    /// @notice This is used because both ERC721 and ERC721Enumerable implement it
    /// @param from address the token is transfered from
    /// @param to address the token is transfered to
    /// @param tokenId id of token being transfered
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721Upgradeable, ERC721EnumerableUpgradeable) {        

        super._beforeTokenTransfer(from, to, tokenId);
    }

    /// @notice This is used because both ERC721 and AccessControl implement it
    /// @dev Need to make sure that this is the proper way to handle it
    //          https://docs.openzeppelin.com/contracts/4.x/api/utils#IERC165-supportsInterface-bytes4-
    //          https://forum.openzeppelin.com/t/derived-contract-must-override-function-supportsinterface/6315
    //          https://forum.openzeppelin.com/t/how-do-inherit-from-erc721-erc721enumerable-and-erc721uristorage-in-v4-of-openzeppelin-contracts/6656/3
    /// @param interfaceId interface id
    /// @return super contract function result
    function supportsInterface(bytes4 interfaceId)
        public
        virtual
        view
        override(
            ERC721Upgradeable,
            ERC721EnumerableUpgradeable,
            AccessControlUpgradeable,
            ERC165StorageUpgradeable
        )
        returns (bool)
    {
        return ERC165StorageUpgradeable.supportsInterface(interfaceId);
    }
}
