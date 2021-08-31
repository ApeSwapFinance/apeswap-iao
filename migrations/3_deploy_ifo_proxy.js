const IFOByProxy = artifacts.require("IFOByProxy");
const IFOUpgradeProxy = artifacts.require("IFOUpgradeProxy");
const { getNetworkConfig } = require('../deploy-config')

const fs = require('fs');
const abi = require('./abi/ifo.json')

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://bsc-dataseed.binance.org'));

module.exports = async function(deployer, network, accounts) {
  const { adminAddress, proxyAdminAddress } = getNetworkConfig(network, accounts);

  const deployments = [
  // {
    //   stakingToken: '0x0000000000000000000000000000000000000000', // BNB
    //   offeringToken: '', // 
    //   startBlock: '',
    //   endBlock: '',
    //   offeringAmount: '', // 
    //   raisingAmount: '', // 
    // },
    {
      // https://ape-swap.medium.com/iao-005-bishares-index-fund-84923100e99e
      stakingToken: '0x0000000000000000000000000000000000000000', // BNB
      offeringToken: '0x19A6Da6e382b85F827088092a3DBe864d9cCba73', // Bison
      startBlock: '8993948',
      endBlock: '8995148',
      offeringAmount: '128571000000000000000000', //  128,571 BISON @$3.5 / $450,000
      raisingAmount: '1429000000000000000000', // BNB @ $315.00 = 1429
    },
    {
      stakingToken: '0xdDb3Bd8645775F59496c821E4F55A7eA6A6dc299', // GNANA
      offeringToken: '0x19A6Da6e382b85F827088092a3DBe864d9cCba73', // Bison
      startBlock: '8993948',
      endBlock: '8995148',
      offeringAmount: '71429000000000000000000', // 71,429 BISON @$3.5 / $250,000
      raisingAmount: '123152000000000000000000', // GNANA@1.38 * BANANA@$1.47 = $2.03 = 123,152 GNANA
    }
  ]

  for (const deployment of deployments) {
    await deployer.deploy(IFOByProxy);

    const abiEncodeData = web3.eth.abi.encodeFunctionCall({
      "inputs": [
        {
          "internalType": "contract IBEP20",
          "name": "_stakeToken",
          "type": "address"
        },
        {
          "internalType": "contract IBEP20",
          "name": "_offeringToken",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_startBlock",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_endBlock",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_offeringAmount",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_raisingAmount",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "_adminAddress",
          "type": "address"
        }
      ],
      "name": "initialize",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }, [
      deployment.stakingToken,
      deployment.offeringToken,
      deployment.startBlock,
      deployment.endBlock,
      deployment.offeringAmount,
      deployment.raisingAmount,
      adminAddress
    ]);

    await deployer.deploy(IFOUpgradeProxy, proxyAdminAddress, IFOByProxy.address, abiEncodeData);

    console.log(proxyAdminAddress, IFOUpgradeProxy.address, IFOByProxy.address, abiEncodeData);

    // const lotteryProxy = new web3.eth.Contract(abi, IFOUpgradeProxy.address);
    // console.log((await lotteryProxy.methods.getAddressListLength().call()).toString())
  }
};



