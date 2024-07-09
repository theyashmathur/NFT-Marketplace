require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require('@openzeppelin/hardhat-upgrades');

require('dotenv').config({path:__dirname+'/.env'})

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.21",
    settings: {
      viaIR: true,
      evmVersion: "london",
      optimizer: {
        enabled: true,
        runs: 1,
        details: {
          yulDetails: {
            optimizerSteps: "u",
          },
        },
      }
    }
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  mocha: {
    timeout: 100000000
  },
  networks: {
    localhost: {
      allowUnlimitedContractSize: true,
      timeout: 1800000,      
    },
    hardhat: {
      allowUnlimitedContractSize: true,
      timeout: 1800000,      
    },
    polygon_amoy: {
      url: 'https://rpc-amoy.polygon.technology',
      accounts: [process.env.TESTNET_PRIVATE_KEY]
    },
    mainnet_infura: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: {
        mnemonic: `${process.env.MAINNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    mainnet_alchemy: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
      accounts: {
        mnemonic: `${process.env.MAINNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    ropsten_infura: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: {
        mnemonic: `${process.env.TESTNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    ropsten_alchemy: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
      accounts: {
        mnemonic: `${process.env.TESTNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    kovan_infura: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: {
        mnemonic: `${process.env.TESTNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    kovan_alchemy: {
      url: `https://eth-kovan.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
      accounts: {
        mnemonic: `${process.env.TESTNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    rinkeby_infura: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: {
        mnemonic: `${process.env.TESTNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    rinkeby_alchemy: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
      accounts: {
        mnemonic: `${process.env.TESTNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    goerli_infura: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: {
        mnemonic: `${process.env.TESTNET_MNEMONIC}`
      },
      gasPrice: 0
    },
    goerli_alchemy: {
      url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
      accounts: {
        mnemonic: `${process.env.TESTNET_MNEMONIC}`
      },
      gasPrice: 0
    },
  }
};
