const IFO = artifacts.require("IFO");

module.exports = async (deployer) => {
  // const num = 50 * Math.pow(10, 18);
  // const numAsHex = "0x" + num.toString(16);

  const lpToken = '0xf65c1c0478efde3c19b49ecbe7acc57bb6b1d713'; // BANANA/BNB
  const offeringToken = '0x05b339b0a346bf01f851dde47a5d485c34fe220c'; // NAUT
  const startBlock = '5720600';
  const endBlock = '5721800';
  const offeringAmount = '200000000000000';
  const raisingAmount = '10000000000000000000000';
  const adminAddress = '0xC9F40d1c8a84b8AeD12A241e7b99682Fb7A3FE84';
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
