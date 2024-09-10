// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.6/contracts/token/ERC721/ERC721.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.6/contracts/access/Ownable.sol";

contract ERC721ForTests is ERC721, Ownable {
    constructor() ERC721("NFT fot tests", "NFT") {}

    function mint(address to, uint256 tokenId) public onlyOwner {
        _mint(to, tokenId);
    }

}
