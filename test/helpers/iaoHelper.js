const { BN } = require('@openzeppelin/test-helpers');
const { getContractGetterSnapshot } = require('./contractHelper');
const { formatBNObjectToString } = require('./bnHelper');

async function getUserInfoSnapshot(iaoContract, userAddress) {
    const userTokenStatus = formatBNObjectToString(await iaoContract.userTokenStatus(userAddress));
    const userInfo = formatBNObjectToString(await iaoContract.userInfo(userAddress));
    const userRefundingAmount = (await iaoContract.getRefundingAmount(userAddress)).toString();
    const userOfferingAmount = (await iaoContract.getOfferingAmount(userAddress)).toString();
    const userOfferAmountAllocations = formatBNObjectToString(await iaoContract.getOfferingAmountAllocations(userAddress));
    return { ...userInfo, ...userTokenStatus, userRefundingAmount, userOfferingAmount, ...userOfferAmountAllocations }
}


async function getIAZOSnapshot(iaoContract, accounts, runs = 10) {
    const contractSnapshot = await getContractGetterSnapshot(iaoContract, [
        'vestingEndBlock',
        'stakeToken',
        'offeringToken',
        'raisingAmount',
        'offeringAmount',
        'totalAmount',
        'totalDebt',
    ])

    const accountSnapshots = {};
    for (const account of accounts) {
        const currentAccountSnapshot = await getUserInfoSnapshot(iaoContract, account);
        accountSnapshots[account] = currentAccountSnapshot;
    }

    const snapshot = { contractSnapshot, accountSnapshots };
    return snapshot;
}

function getTotalReleasedTokens(offeringInitialHarvestAmount, offeringTokenVestedAmount, vestedPercentage) {
    const vestedTokens = (new BN(offeringTokenVestedAmount).mul(new BN(vestedPercentage * 1000))).div(new BN('1000'));
    const totalReleaseTokens = (new BN(offeringInitialHarvestAmount).add(vestedTokens)).toString();
    return totalReleaseTokens;
  }

module.exports = { getUserInfoSnapshot, getIAZOSnapshot, getTotalReleasedTokens }
