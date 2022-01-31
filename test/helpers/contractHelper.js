/**
 * Provide a contract with an array of view functions which contain zero arguments 
 *  and return an object of all values.
 * 
 * @param {*} contract 
 * @param {*} snapshotFunctions Array of strings matching the names of functions to call
 * @returns 
 */
async function getContractGetterSnapshot(contract, snapshotFunctions) {
  let promises = [];
  let snapshot = {};

  for (const snapshotFunction of snapshotFunctions) {
    promises.push(
      contract[snapshotFunction]().then(
        (value) =>
          (snapshot = { ...snapshot, [snapshotFunction]: value.toString() })
      )
    );
  }

  await Promise.all(promises);
  return snapshot;
}

/**
 * Provide an ERC20 contract and an array of account addresses and receive on object 
 *   structured { account: string(balance) }
 * 
 * @param {*} erc20Contract 
 * @param {*} accounts 
 * @returns 
 */
async function getAccountTokenBalances(erc20Contract, accounts) {
  let promises = [];
  let accountBalances = {};

  for (const account of accounts) {
    promises.push(
      erc20Contract.balanceOf(account).then(
        (balance) =>
          (accountBalances = { ...accountBalances, [account]: balance.toString() })
      )
    );
  }

  await Promise.all(promises);
  return accountBalances;
}


module.exports = { getContractGetterSnapshot, getAccountTokenBalances }