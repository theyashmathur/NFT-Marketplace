// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.6/contracts/token/ERC20/ERC20.sol";

contract SettlementToken is ERC20 {
    constructor() ERC20("Settlement Token", "STLM") {
        _mint(msg.sender, 5000000000000000000 * 10 ** decimals());
    }
}