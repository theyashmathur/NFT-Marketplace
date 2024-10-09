NftCollectionFactory deployed to: 0x705505982049C3e94FACEfC6F9304206eAbC2e03
NFT Collection(implementation contract) deployed to:  0x6A9ee01529dCF320B387F8FAd697aC8847af5Cbe
NFT Collection(implementation contract) deployed to:  0xCBB8555BD018736f5688C7998E05b618678C4A3d
Marketplace ERC1155 deployed to: 0xD437DafFEb871CcE62ad039AE24b8a9F960Da6CF

We can create our own collection for users who want to mint single nfts using factory

Sell 
Seller creates a sellSig
Seller calls setApprovalForAll function to approve NFT
listing done

buyer comes and uses the sellsig to buy the nft
if user is buying using ERC20 token he needs to approve token first


Sell and buy
Offer- accepting and cancelling
Auction

Require statements error code:

    "101": "Account has no admin role",
    "102": "Account has no fund manager role",
    "103": "Wrong ERC20 contract: address can't be 0",
    "105": "Commission must be greater than 0",
    "106": "Commission must be lower than 500",
    "108": "Beneficiary can't be 0 address",
    "109": "Only message signer can cancel signature",
    "110": "Signature is already cancelled",
    "111": "Signers mismatch",
    "112": "Signature is cancelled",
    "113": "wrong NFT Collection address",
    "114": "user is already the owner of this NFT",
    "115": "seller is no longer the owner of this NFT",
    "116": "marketplace is not approved as an operator",
    "117": "seller mismatch",
    "118": "not enough funds",
    "119": "ERC20 token is not approved as a settlement token",
    "120": "marketplace is not approved to spend the settlement tokens out of the user's balance",
    "124": "user cannot accept their own offer",
    "126": "Buyer is already the owner of this NFT",
    "127": "User is not the owner of this NFT",
    "128": "Marketplace is not approved to manage the user's tokens",
    "129": "buyer mismatch",
    "131": "ERC20 token not approved as a settlement token",
    "135": "Marketplace is not approved to manage the seller's tokens",
    "136": "Seller is not the owner of this NFT",
    "137": "Auction has not ended yet",
    "138": "User cannot be the bidder",
    "140": "Auction signature is cancelled",
    "141": "Bid signature is cancelled",
    "142": "NFT contract mismatch",
    "143": "token ID mismatch",
    "144": "settlement token missmatch",
    "145": "settlement token for auctions/bids cannot be native token",
    "146": "Bid less than the minimum bid price",
    "148": "bidder mismatch",
    "150": "marketplace is not approved to spend the settlement tokens out of the bidder's balance",
    "202": "Amount must be greater than 0",
    "203": "Signatures are empty",
    "205": "Insufficient funds",
    "209": "Something went wrong: make sure the signatures have enough available tokens and the marketplace is approved to manage them.",
    "213": "User is not the owner of these tokens",
    "221": "The seller does not have enough NFTs",
    "224": "User is not the auction seller",
    "233": "amount mismutch",
    "234": "settlement token is not approved"
