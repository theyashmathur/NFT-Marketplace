// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "../NftCollection.sol";
import "../SFTCollection.sol";

/// @title An NFT collection factory
/// @author Alexandros Andreou
/// @dev Still needs testing
contract NftCollectionFactoryV1000 is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ERC2771ContextUpgradeable
{
    bytes4 private constant INITIALIZE_FUNC_SELECTOR =
        bytes4(
            keccak256(
                "initialize(address,string,string,string,string,address,uint256,uint256,address)"
            )
        );
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant COLLECTION_IMPLEMENTATION_PROVIDER_ROLE =
        keccak256("COLLECTION_IMPLEMENTATION_PROVIDER_ROLE");

    uint256 public NFTCollectionVersion;
    uint256 public SFTCollectionVersion;

    address[] public createdNftCollections;
    address[] public createdSFTCollections;
    
    NftCollection public currentNftCollectionImpl;
    SFTCollection public currentSFTCollectionImpl;

    mapping(address => uint256) public implToVersion;
    mapping(address => uint256) public implToSFTVersion;

    mapping(uint256 => address) public versionToImpl;
    mapping(uint256 => address) public SFTversionToImpl;
    
    mapping(address => bool) public isImplAvailable;

    event NftCollectionCreated(uint256 indexed idx, address nftCollection);
    event SFTCollectionCreated(uint256 indexed idx, address sftCollection);

    event NftCollectionImplementationAdded(uint256 indexed version, address nftCollectionImpl);
    event SFTCollectionImplementationAdded(uint256 indexed version, address SFTCollectionImpl);

    event NftCollectionImplementationRemoved(uint256 indexed version, address nftCollectionImpl);
    event SFTCollectionImplementationRemoved(uint256 indexed version, address SFTCollectionImpl);

    /// @notice Adds a new NFT collection implementation
    /// @param newImplementation this is the new nft collection implementation address
    function addNftCollectionUpgrade(address newImplementation) public {
        require(
            hasRole(COLLECTION_IMPLEMENTATION_PROVIDER_ROLE, msg.sender),
            "Account nas no collection implementation provider role"
        );

        require(IERC165(newImplementation).supportsInterface(type(IERC721).interfaceId), "Provided contract doesn't support erc721");

        currentNftCollectionImpl = NftCollection(newImplementation);

        uint256 newVersion = NFTCollectionVersion;
        NFTCollectionVersion++;

        implToVersion[address(currentNftCollectionImpl)] = newVersion;
        versionToImpl[newVersion] = address(currentNftCollectionImpl);
        isImplAvailable[address(currentNftCollectionImpl)] = true;

        emit NftCollectionImplementationAdded(
            newVersion,
            address(currentNftCollectionImpl)
        );
    }

    function addSFTCollectionUpgrade(address newImplementation) public {
        require(
            hasRole(COLLECTION_IMPLEMENTATION_PROVIDER_ROLE, msg.sender),
            "Account nas no collection implementation provider role"
        );

        require(IERC165(newImplementation).supportsInterface(type(IERC1155).interfaceId), "Provided contract doesn't support erc1155");

        currentSFTCollectionImpl = SFTCollection(newImplementation);
        
        uint256 newVersion = SFTCollectionVersion;
        SFTCollectionVersion++;

        implToSFTVersion[address(currentSFTCollectionImpl)] = newVersion;
        SFTversionToImpl[newVersion] = address(currentSFTCollectionImpl);
        isImplAvailable[address(currentSFTCollectionImpl)] = true;

        emit SFTCollectionImplementationAdded(newVersion, address(currentSFTCollectionImpl));
    }

    /// @notice Removes an NFT collection implementation
    /// @param _version this is the nft collection implementation version to be removed
    function removeNftCollectionUpgrade(uint256 _version) public {
        require(
            hasRole(COLLECTION_IMPLEMENTATION_PROVIDER_ROLE, msg.sender),
            "Account nas no collection implementation provider role"
        );
        require(
            _version != (NFTCollectionVersion - 1),
            "Cannot remove current nft collection implementation version"
        );
        address nftCollection = versionToImpl[_version];
        require(nftCollection != address(0), "There is no such version");

        isImplAvailable[nftCollection] = false;
        emit NftCollectionImplementationRemoved(_version, nftCollection);
    }

    function removeSFTCollectionUpgrade(uint256 _version) public {
        require(
            hasRole(COLLECTION_IMPLEMENTATION_PROVIDER_ROLE, msg.sender),
            "Account nas no collection implementation provider role"
        );
        require(
            _version != (SFTCollectionVersion - 1),
            "Cannot remove current SFT collection implementation version"
        );

        address SFTCollectionAddress = SFTversionToImpl[_version];
        require(SFTCollectionAddress != address(0), "There is no such version");
        
        isImplAvailable[SFTCollectionAddress] = false;

        emit SFTCollectionImplementationRemoved(_version, SFTCollectionAddress);         
    }

    /// @notice constructor used to force implementation initialization
    /// @dev https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializing_the_implementation_contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _trustedForwarder) ERC2771ContextUpgradeable(_trustedForwarder) {
        _disableInitializers();
    }

    /// @notice Used instead of constructor for UUPS upgradeable contracts
    function initialize(
        address _admin,
        address _upgrader,
        address _collection_implementation_provider
    ) public initializer {
        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(UPGRADER_ROLE, _upgrader);
        _setupRole(
            COLLECTION_IMPLEMENTATION_PROVIDER_ROLE,
            _collection_implementation_provider
        );
        __UUPSUpgradeable_init();

        NFTCollectionVersion = 1;
        SFTCollectionVersion = 1;
    }

    /// @notice Checks if the upgrade is authorized
    //  @param newImplementation this is the new implementation passed from upgradeTo
    function _authorizeUpgrade(address) internal view override {
        require(
            hasRole(UPGRADER_ROLE, msg.sender),
            "Account has no upgrader role"
        );
    }

    /// @notice Gets the number of NFT collections created
    /// @return returns the length of the NFT collections array
    function createdNftCollectionsLength() public view returns (uint256) {
        return createdNftCollections.length;
    }

    function createdSFTCollectionsLength() public view returns (uint256) {
        return createdSFTCollections.length;
    }

    /// @notice Creates a new NFT collection
    /// @param data initialization selector and function arguments encoded (abi.encodeWithSelector)
    function createNftCollection(bytes memory data) public returns (address) {
        require(address(currentNftCollectionImpl) != address(0), "The implementation contract is not specified");
        ERC1967Proxy nftCollectionProxy = new ERC1967Proxy(
            address(currentNftCollectionImpl),
            data
        );
        createdNftCollections.push(address(nftCollectionProxy));
        emit NftCollectionCreated(
            createdNftCollections.length - 1,
            address(nftCollectionProxy)
        );
        return address(nftCollectionProxy);
    }

    function createSFTCollection(bytes memory data) public returns (address) {
        require(address(currentSFTCollectionImpl) != address(0), "The implementation contract is not specified");
        ERC1967Proxy SFTCollectionProxy = new ERC1967Proxy(address(currentSFTCollectionImpl), data);

        createdSFTCollections.push(address(SFTCollectionProxy));
        emit SFTCollectionCreated(createdSFTCollections.length - 1, address(SFTCollectionProxy));

        return address(SFTCollectionProxy);     
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, ERC2771ContextUpgradeable) 
        returns (address sender) {
        sender = ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    /*
        Adding the upgraded logic here to make updating easier until a better way is found 
    */

    string public newstuff;

    function setNewStuff(string memory _newstuff) public {
        newstuff = _newstuff;
    }

    function newStuffLength() public view returns (uint256) {
        return bytes(newstuff).length;
    }
}
