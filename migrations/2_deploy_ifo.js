const IFO = artifacts.require("IFO");

module.exports = async (deployer) => {
  // const num = 50 * Math.pow(10, 18);
  // const numAsHex = "0x" + num.toString(16);
  const stakingToken = '0xf65c1c0478efde3c19b49ecbe7acc57bb6b1d713'; // BANANA/BNB
  const offeringToken = '0xa4f93159ce0a4b533b443c74b89967c60a5969f8'; // JDI
  const startBlock = '6835020';
  const endBlock = '6836230';
  const offeringAmount = '100000000000000000000000000';
  const raisingAmount = '22250000000000000000000';
  const adminAddress = '0xC9F40d1c8a84b8AeD12A241e7b99682Fb7A3FE84';
  await deployer.deploy(
    IFO,
    stakingToken,
    offeringToken,
    startBlock,
    endBlock,
    offeringAmount,
    raisingAmount,
    adminAddress
  );
};