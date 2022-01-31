const MockERC20 = artifacts.require("MockERC20");
const { ether } = require('@openzeppelin/test-helpers');
const { getNetworkConfig } = require('../deploy-config')

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://bsc-dataseed.binance.org'));

module.exports = async function(deployer, network, accounts) {
  const { adminAddress, proxyAdminAddress } = getNetworkConfig(network, accounts);

  const deployments = [
    {
      name: 'BASE TOKEN',
      symbol: 'BASE',
      supply: ether('1000')
    },
    {
      name: 'IAZO TOKEN',
      symbol: 'IAZO',
      supply: ether('0')
    },
  ]

  for (const deployment of deployments) {
    await deployer.deploy(MockERC20, deployment.name, deployment.symbol, deployment.supply);
  }
};



