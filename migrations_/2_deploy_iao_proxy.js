const IAO = artifacts.require("IAO");
const IAOUpgradeProxy = artifacts.require("IAOUpgradeProxy");
const ethers = require('ethers');
const { ether } = require('@openzeppelin/test-helpers');
const { getNetworkConfig } = require('../deploy-config')


module.exports = async function (deployer, network, accounts) {
  const { adminAddress, proxyAdminAddress, rpcProvider } = getNetworkConfig(network, accounts);
  // Find current block
  const provider = new ethers.providers.JsonRpcProvider(rpcProvider);
  let block = await provider.getBlock('latest');
  // Set a start block offset
  const startBlock = block.number + 1200;

  const deployments = [
    // {
    //   stakingToken: '0x0000000000000000000000000000000000000000', // BNB
    //   offeringToken: '', // 
    //   startBlock: '',
    //   endBlockOffset: '',
    //   vestingBlockOffset: '', //
    //   offeringAmount: ether(''), // 
    //   raisingAmount: ether(''), // 
    // },
    // {
    //   stakingToken: '0xdDb3Bd8645775F59496c821E4F55A7eA6A6dc299', // GNANA
    //   offeringToken: '', // 
    //   startBlock: '',
    //   endBlockOffset: '',
    //   vestingBlockOffset: '', //
    //   offeringAmount: ether(''), // 
    //   raisingAmount: ether(''), // 
    // },
  ]
  
  // Array to hold contract deployment information
  let deploymentOutput = [];
  // Deploy single implementation contract
  await deployer.deploy(IAO);

  for (const deployment of deployments) {

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
      startBlock: deployment.startBlock,
      adminAddress,
      proxyAdminAddress,
      raiseToken: deployment.stakingToken,
    });
  }
  // log deployments
  console.dir(deploymentOutput);
};



