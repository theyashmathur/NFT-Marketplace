// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

contract Erc721DataManagement {
    
    enum saleStatus { // 256 possible statuses
        UNINITIALIZED,
        NOTFORSALE,
        FORSALE,
        BIDDING,
        OFFERING
    }
    
    struct NftStruct {
        address tokenAddress;
        uint256 tokenId;
    }
    
    NftStruct[][256] public NftList; // this is an array of 256, the maximum different saleStatus possible
    
    mapping (bytes32 => saleStatus) public NftHashStatusMap;
    mapping (bytes32 => uint256) public NftHashIndexMap;

    constructor() {
        for (uint256 i = 1; i <= 4; i++) {
            for (uint160 j = uint160((i-1)*10); j < i*10; j++) {
                initializeNft(address(j), j, saleStatus(i));
            }
        }
    }
    
    function NftHash(address addr, uint256 id) pure public returns (bytes32) {
        return keccak256( bytes.concat(bytes20(addr), bytes32(id)) );
    }
    
    function NftExists(address addr, uint256 id) view public returns (bool) {
        return (NftHashStatusMap[NftHash(addr, id)] != saleStatus.UNINITIALIZED);
    }
    
    function initializeNft(address addr, uint256 id, saleStatus status) public {
        require(status!=saleStatus.UNINITIALIZED, "saleStatus must not be UNINITIALIZED");
        require(NftHashStatusMap[NftHash(addr, id)]==saleStatus.UNINITIALIZED, "NFT was already initialized");
        
        NftHashStatusMap[NftHash(addr, id)] = status;   // add to status map
        uint256 index = NftList[uint8(status)].length;
        NftList[uint8(status)].push(NftStruct({         // add to status list
            tokenAddress: addr, 
            tokenId: id
        }));
        NftHashIndexMap[NftHash(addr, id)] = index;     // add to index map
    }
    
    function changeNftStatus(address addr, uint256 id, saleStatus status) public {
        require(NftExists(addr, id), "NFT not initialized");
        require(status!=saleStatus.UNINITIALIZED, "must not set saleStatus to UNINITIALIZED");
        require(status!=NftHashStatusMap[NftHash(addr, id)], "NFT alredy has the correct status");
        
        saleStatus oldStatus = NftHashStatusMap[NftHash(addr, id)];
        uint256 oldIndex = NftHashIndexMap[NftHash(addr, id)];
        
        
        NftList[uint8(oldStatus)][oldIndex] = NftList[uint8(oldStatus)][NftList[uint8(oldStatus)].length-1]; // duplicate the last element in the place of the element that needs it's status changed
        NftList[uint8(oldStatus)].pop();                                        // remove last element from old status list
        
        NftStruct memory last = NftList[uint8(oldStatus)][oldIndex];
        NftHashIndexMap[NftHash(last.tokenAddress, last.tokenId)] = oldIndex;   // update "last" element's index
        
        NftHashIndexMap[NftHash(addr, id)] = NftList[uint8(status)].length;     // update element's index
        NftHashStatusMap[NftHash(addr, id)] = status;                           // update element's status
        NftList[uint8(status)].push(NftStruct({                                 // add to status list
            tokenAddress: addr,
            tokenId: id
        }));
    }
    
    function getSaleStatus(saleStatus status) public view returns (NftStruct[] memory) {
        return (NftList[uint8(status)]);
    }
    
}