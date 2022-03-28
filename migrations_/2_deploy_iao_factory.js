const IAOUpgradeProxy = artifacts.require("IAOUpgradeProxy");
const IAOLinearVestingFactory = artifacts.require("IAOLinearVestingFactory");
const IAOLinearVesting = artifacts.require("IAOLinearVesting");
const ethers = require('ethers');
const { getNetworkConfig } = require('../deploy-config')

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://bsc-dataseed.binance.org'));

module.exports = async function (deployer, network, accounts) {
  const ADDRESS_0 = '0x0000000000000000000000000000000000000000';
  const { adminAddress, proxyAdminAddress, rpcProvider } = getNetworkConfig(network, accounts);

  // Find current block
  const provider = new ethers.providers.JsonRpcProvider(rpcProvider);
  const block = await provider.getBlock('latest');

  /// Deploy initial implementation
  await deployer.deploy(IAOLinearVesting);
  const iaoLinearVesting = await IAOLinearVesting.at(IAOLinearVesting.address);
  await iaoLinearVesting.initialize(
    ADDRESS_0,
    ADDRESS_0,
    block.number + 10,
    1,
    1,
    0,
    0,
    adminAddress
  )

  await deployer.deploy(IAOLinearVestingFactory);

  const abiEncodeData = web3.eth.abi.encodeFunctionCall({
    "inputs": [
      {
        "internalType": "address",
        "name": "_factoryAdmin",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_iaoProxyAdmin",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_iaoAdmin",
        "type": "address"
      },
      {
        "internalType": "contract IIAOLinearVesting",
        "name": "_implementation",
        "type": "address"
      },
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }, [
    adminAddress, // Factory admin
    proxyAdminAddress, // IAO Proxy Admin
    adminAddress, // IAO Admin
    IAOLinearVesting.address
  ]);

  await deployer.deploy(IAOUpgradeProxy, proxyAdminAddress, IAOLinearVestingFactory.address, abiEncodeData);

  console.dir({
    IAOLinearVesting: IAOLinearVesting.address,
    IAOLinearVestingFactory: IAOLinearVestingFactory.address,
    adminAddress,
    proxyAdminAddress,
  })
};



