const IAO = artifacts.require("IAO");
const IAOUpgradeProxy = artifacts.require("IAOUpgradeProxy");
const { ether } = require('@openzeppelin/test-helpers');
const { getNetworkConfig } = require('../deploy-config')

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://bsc-dataseed.binance.org'));

module.exports = async function (deployer, network, accounts) {
  const { adminAddress, proxyAdminAddress } = getNetworkConfig(network, accounts);

  const deployments = [
    // {
    //   stakingToken: '0x0000000000000000000000000000000000000000', // BNB
    //   offeringToken: '', // 
    //   startBlock: '',
    //   endBlockOffset: '',
    //   vestingBlockOffset: '', //
    //   offeringAmount: '', // 
    //   raisingAmount: '', // 
    // },
  ]

  let deploymentOutput = [];

  for (const deployment of deployments) {
    await deployer.deploy(IAO);

    const abiEncodeData = web3.eth.abi.encodeFunctionCall({
      "inputs": [
        {
          "internalType": "contract IERC20",
          "name": "_stakeToken",
          "type": "address"
        },
        {
          "internalType": "contract IERC20",
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
          "name": "_endBlockOffset",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_vestingBlockOffset",
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
      deployment.endBlockOffset,
      deployment.vestingBlockOffset,
      deployment.offeringAmount,
      deployment.raisingAmount,
      adminAddress
    ]);

    await deployer.deploy(IAOUpgradeProxy, proxyAdminAddress, IAO.address, abiEncodeData);

    deploymentOutput.push({
      IAOUpgradeProxy: IAOUpgradeProxy.address,
      IAO: IAO.address,
      proxyAdminAddress
    });
  }
  // log deployments
  console.dir(deploymentOutput);
};



