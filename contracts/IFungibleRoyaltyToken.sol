// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IFungibleRoyaltyToken is IERC20Upgradeable {
    enum AssetType {
        MUSIC,
        NON_MUSIC
    }

    event RoyaltyPayment(
        address indexed payer,
        address indexed receiver,
        address indexed paymentToken,
        uint256 amount
    );

    function initializeFungibleRoyaltyToken(
        string calldata _name,
        string calldata _symbol,
        address _manager,
        address _artist,
        AssetType _assetType,
        uint256 _tokensToMint,
        uint256 _tokensForSale,
        address _sftContract
    ) external;
    
    function makeTokenPayment(address _token, address _from, uint256 _amount) external;
}