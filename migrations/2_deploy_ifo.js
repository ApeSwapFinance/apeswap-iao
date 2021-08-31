const IFO = artifacts.require("IFO");
const { getNetworkConfig } = require('../deploy-config')

module.exports = async (deployer, network, accounts) => {
  const { adminAddress } = getNetworkConfig(network, accounts);

  const deployments = [
    // {
    //   stakingToken: '0x0000000000000000000000000000000000000000', // BNB
    //   offeringToken: '', // 
    //   startBlock: '',
    //   endBlock: '',
    //   offeringAmount: '', // 
    //   raisingAmount: '', // 
    // },
  ]

  for (const deployment of deployments) {
    await deployer.deploy(
      IFO,
      deployment.stakingToken,
      deployment.offeringToken,
      deployment.startBlock,
      deployment.endBlock,
      deployment.offeringAmount,
      deployment.raisingAmount,
      adminAddress
    );
  }

};