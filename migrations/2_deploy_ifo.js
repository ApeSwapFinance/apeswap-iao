const IFO = artifacts.require("IFO");

module.exports = async (deployer) => {
  // const num = 50 * Math.pow(10, 18);
  // const numAsHex = "0x" + num.toString(16);

  const lpToken = '0x90fc86a7570063a9ea971ec74f01f89569ad6237'; // Testnet BANANA/BNB
  const offeringToken = '0x4Fb99590cA95fc3255D9fA66a1cA46c43C34b09a'; // Testnet BANANA
  const startBlock = '7068668';
  const endBlock = '7069400';
  const offeringAmount = '10000000000000000000000';
  const raisingAmount = '100000000000000000000';
  const adminAddress = '0xb5e1Ec9861D7c1C99cB3d79dd602cC6122F0d7dc';
  await deployer.deploy(
    IFO,
    lpToken,
    offeringToken,
    startBlock,
    endBlock,
    offeringAmount,
    raisingAmount,
    adminAddress
  );
};
