// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import "@openzeppelin/contracts-upgradeable/token/ERC721/presets/ERC721PresetMinterPauserAutoIdUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

contract ExoticUnique is ERC721PresetMinterPauserAutoIdUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter private _tokenIdTracker;
    
    mapping (uint256 => string) private collectibleName;
    mapping (uint256 => string) private collectibleData;
    
    function initialize() initializer public {
        __ERC721PresetMinterPauserAutoId_init("Exotic, one-of-a-kind collectibles", "TICs", "https://gist.githubusercontent.com/nicexe/ba45bcab1b8b8fbfb6a9817e02e3e549/raw/af238912016dec5f5fd1a885752fbb3fa0df5e98/token.");
    }
    
    function mint(address to, string calldata name, string calldata data) public {
        _mint(to, _tokenIdTracker.current());
        collectibleName[_tokenIdTracker.current()] = name;
        collectibleData[_tokenIdTracker.current()] = data;
        _tokenIdTracker.increment();
    }
}