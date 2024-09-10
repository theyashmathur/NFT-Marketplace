// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IFungibleRoyaltyToken.sol";

contract FungibleRoyaltyToken is Initializable, UUPSUpgradeable, ERC20Upgradeable, ReentrancyGuardUpgradeable, AccessControlEnumerableUpgradeable, IFungibleRoyaltyToken {
    bytes32 public constant PAYER_ROLE = keccak256("PAYER_ROLE");
    bytes32 public constant ROYALTY_RECEIVER_ROLE = keccak256("ROYALTY_RECEIVER_ROLE");

    address public manager;
    address public artist;
    address public sftContract;
    AssetType public assetType;
    
    /// @notice constructor used to force implementation initialization
    /// @dev https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializing_the_implementation_contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function _authorizeUpgrade(address) internal virtual view override {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender)
            // "Account has no admin role"
        );
    }

    function _transfer(address _from, address _to, uint256 _amount) internal virtual override {
        super._transfer(_from, _to, _amount);
        if (_from != address(0) && balanceOf(_from) == 0) {
            _revokeRole(ROYALTY_RECEIVER_ROLE, _from);
        }
        if (_to != address(0) && balanceOf(_to) > 0) {
            _grantRole(ROYALTY_RECEIVER_ROLE, _to);
        }
    }

    function initializeFungibleRoyaltyToken(
        string calldata _name,
        string calldata _symbol,
        address _manager,
        address _artist,
        AssetType _assetType,
        uint256 _tokensToMint,
        uint256 _tokensForSale,
        address _sftContract
    ) public initializer nonReentrant {
        require(_tokensToMint > 0, "Need to mint more than 0 tokens");
        require(_tokensToMint >= _tokensForSale, "tokens to mint can't be less than tokens for sale");
        require(_manager != address(0), "invalid manager address");
        require(_artist != address(0), "invalid artist address");
        require(_sftContract != address(0), "invalid sft contract address");

        __ERC20_init(_name, _symbol);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, tx.origin);
        _grantRole(PAYER_ROLE, tx.origin);

        manager = _manager;
        artist = _artist;
        assetType = _assetType;
        sftContract = _sftContract;

        _mint(_artist, _tokensToMint);
        _transfer(_artist, _sftContract, _tokensForSale);
    }

    receive() external payable nonReentrant {
        _makeNativePayment(msg.value);
    }

    function _makeNativePayment(uint256 _amount) private onlyRole(PAYER_ROLE) {
        require(totalSupply() > 0, "total supply is 0");
        uint256 accumulatedPayments = 0;
        uint256 royaltyReceivers = getRoleMemberCount(ROYALTY_RECEIVER_ROLE);
        uint256 payment = 0;

        for (uint i = 0; i < royaltyReceivers; i++) {
            address royaltyReceiver = getRoleMember(ROYALTY_RECEIVER_ROLE, i);
            if (i > 0 && accumulatedPayments <= _amount) {
                if (i == (royaltyReceivers -1)) {
                    // if this is the last iteration calculate payment differently to avoid rounding related errors
                    payment = _amount - accumulatedPayments;
                } else {
            // payment calculation
            //                                            holder's ratio
            // final payment    payment for           ╭─────────┴─────────╮
            // for holder       all holders   holder's balance        balance of all holders
            //         │          │       ╭───────────┴──────────╮        │
                    payment = _amount * balanceOf(royaltyReceiver) / totalSupply();
                }
            }

            accumulatedPayments += payment;
            
            (bool nativePayment, bytes memory data) = royaltyReceiver.call{value: payment}("");
            require(nativePayment, "Failed to send payment");
            emit RoyaltyPayment(msg.sender, royaltyReceiver, address(0), payment);
        }
    }

    function makeTokenPayment (
        address _token,
        address _from,
        uint256 _amount
    ) external onlyRole(PAYER_ROLE) nonReentrant {
        _makeTokenPayment(_token, _from, _amount);
    }

    function _makeTokenPayment(
        address _token,
        address _from,
        uint256 _amount
    ) internal {
        require(totalSupply() > 0, "total supply is 0");
        require(_token != address(0), "invalid token address");
        IERC20 token = IERC20(_token);
        require(token.allowance(_from, address(this)) >= _amount, "not enough funds are approved for spending");
        
        uint256 accumulatedPayments = 0;
        uint256 royaltyReceivers = getRoleMemberCount(ROYALTY_RECEIVER_ROLE);
        uint256 payment = 0;

        for (uint i = 0; i < royaltyReceivers; i++) {
            address royaltyReceiver = getRoleMember(ROYALTY_RECEIVER_ROLE, i);
            if (i > 0 && accumulatedPayments <= _amount) {
                if (i == (royaltyReceivers -1)) {
                    // if this is the last iteration calculate payment differently to avoid rounding related errors
                    payment = _amount - accumulatedPayments;
                } else {
                    payment = _amount * balanceOf(royaltyReceiver) / totalSupply();
                }
            }

            accumulatedPayments += payment;

            token.transferFrom(_from, royaltyReceiver, payment);
            emit RoyaltyPayment(_from, royaltyReceiver, _token, payment);
        }
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IFungibleRoyaltyToken).interfaceId;
    }

}