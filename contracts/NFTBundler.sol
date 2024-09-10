// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "./NftCollection.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "hardhat/console.sol";

/// @title A contract that bundles NFTs
/// @author Aleksei Diakonov
/// @notice This smart contract allows bundling of NFTs
/// @dev This smart contract is an ERC721 collection that allows wrapping of ERC721 and ERC1155 tokens
contract NFTBundler is
    NftCollection,
    ERC721HolderUpgradeable,
    ERC1155HolderUpgradeable
{
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public tokenId;
    bool public isBundlingPaused;
    bool public isUnbundlingPaused;

    struct Token {
        address tokenContract;
        uint256 tokenId;
        uint256 amount;
    }

    struct Bundle {
        Token[] tokens;
        uint256 creationDate;
        uint256 burnDate;
        address creator;
    }

    mapping (uint256 => Bundle) internal bundledTokens;

    event BundleTokenMetadata(
        address indexed bundleCreator,
        uint256 indexed creationDate
    );

    event BundleToken(
        address[] indexed tokenContracts,
        uint256[] indexed tokenIds,
        uint256[] indexed amounts
    );

    event UnbundleTokenMetadata(
        address indexed bundleUnwrapper,
        uint256 indexed burnDate
    );

    event UnbundleToken(Token[] tokens);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initializeNFTBundler(
        string calldata _baseURI,
        string calldata _contractURI,
        address _rentingProtocol
    ) initializer public {
        NftCollection.initialize(
            msg.sender,
            "NFT Bundler",
            "BNDL",
            _baseURI,
            _contractURI,
            msg.sender,
            0,
            100,
            _rentingProtocol
        );
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        isBundlingPaused = false;
        isUnbundlingPaused = false;
        tokenId = 0;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        view
        onlyRole(UPGRADER_ROLE)
        override
    {}

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(
            NftCollection,
            // ERC721Upgradeable,
            ERC1155ReceiverUpgradeable
            // AccessControlUpgradeable
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function createWrappedToken(address[] memory _tokenContracts, uint256[] memory _tokenIds, uint256[] memory _amounts) public {
        require(!isBundlingPaused, "Bundling of NFTs has been paused by the admin.");
        require(_tokenContracts.length == _tokenIds.length && _tokenIds.length == _amounts.length, "The arrays provided have different sizes");

        Bundle storage bundledToken = bundledTokens[tokenId];

        for (uint256 i = 0; i < _tokenContracts.length; i++) {
            if(IERC165(_tokenContracts[i]).supportsInterface(type(IERC721).interfaceId)) {
                IERC721(_tokenContracts[i]).transferFrom(msg.sender, address(this), _tokenIds[i]);
            } else if(IERC165(_tokenContracts[i]).supportsInterface(type(IERC1155).interfaceId)) {
                IERC1155(_tokenContracts[i]).safeTransferFrom(msg.sender, address(this), _tokenIds[i], _amounts[i], "");
            } else {
                require(false, "provided address doesn't support token interfaces");
            }

            bundledToken.tokens.push(
                Token({
                    tokenContract: _tokenContracts[i],
                    tokenId: _tokenIds[i],
                    amount: _amounts[i]
                })
            );
        }

        bundledToken.creationDate = block.timestamp;
        bundledToken.creator = msg.sender;

        _mint(msg.sender, tokenId);
        ++tokenId;

        emit BundleToken(_tokenContracts, _tokenIds, _amounts);
        emit BundleTokenMetadata(bundledToken.creator, bundledToken.creationDate);
    }

    function unbundleWrappedToken(uint256 _tokenId) public {
        require(!isUnbundlingPaused, "Unbundling of NFTs has been paused by the admin.");
        require(ownerOf(_tokenId) == msg.sender, "Only owner can unbundle a token.");

        safeTransferFrom(msg.sender, address(this), _tokenId);

        for (uint256 i = 0; i < bundledTokens[_tokenId].tokens.length; i++) {

            if(IERC165(bundledTokens[_tokenId].tokens[i].tokenContract).supportsInterface(type(IERC721).interfaceId)) {
                IERC721(bundledTokens[_tokenId].tokens[i].tokenContract).safeTransferFrom(address(this), msg.sender, bundledTokens[_tokenId].tokens[i].tokenId);
            }
            else if(IERC165(bundledTokens[_tokenId].tokens[i].tokenContract).supportsInterface(type(IERC1155).interfaceId)) {
                IERC1155(bundledTokens[_tokenId].tokens[i].tokenContract).safeTransferFrom(address(this), msg.sender, bundledTokens[_tokenId].tokens[i].tokenId, bundledTokens[_tokenId].tokens[i].amount, "");
            }
        }
        
        _burn(_tokenId);
        
        Bundle storage bundledToken = bundledTokens[_tokenId];
        bundledToken.burnDate = block.timestamp;

        emit UnbundleToken(bundledTokens[_tokenId].tokens);
        emit UnbundleTokenMetadata(msg.sender, block.timestamp);
    }

    function setIsBundling(bool value) public onlyRole(PAUSER_ROLE) {
        isBundlingPaused = value;
    }

    function setIsUnbundling(bool value) public onlyRole(PAUSER_ROLE) {
        isUnbundlingPaused = value;
    }

    function mint(uint256 _tokenId) public virtual override returns (uint256) {}

    function mintWithSignatureAndSafeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public override {}

    function mintWithSignature(SignedMint memory sigMint) public override virtual {}

    function freeze() public virtual override {}

    function setRoyalties(
        uint256 _royaltyPercentNominator,
        uint256 _royaltyPercentDenominator
    ) public virtual override {}

    function setBeneficiary(address _beneficiary) public virtual override {}

    function getBundledToken(uint256 _wrappedTokenAddress) public view returns (Bundle memory) {
        return bundledTokens[_wrappedTokenAddress];
    }
}