const { expectRevert, time, ether, BN } = require('@openzeppelin/test-helpers');
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect, assert } = require('chai');
const { getContractGetterSnapshot, getAccountTokenBalances } = require('./helpers/contractHelper');
const { addBNStr, subBNStr, mulBNStr, divBNStr, isWithinLimit, formatBNObjectToString } = require('./helpers/bnHelper');

// Load compiled artifacts
const IAOLinearVesting = contract.fromArtifact('IAOLinearVesting');
const MockERC20 = contract.fromArtifact('MockERC20');


function getTotalReleasedTokens(offeringInitialHarvestAmount, offeringTokenVestedAmount, vestedPercentage) {
  const vestedTokens = (new BN(offeringTokenVestedAmount).mul(new BN(vestedPercentage * 1000))).div(new BN('1000'));
  const totalReleaseTokens = (new BN(offeringInitialHarvestAmount).add(vestedTokens)).toString();
  return totalReleaseTokens;
}

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

describe('IAO Linear Vesting', function () {
  const OFFERING_AMOUNT = '100000000'
  const RAISING_AMOUNT = '1000'
  // Set timeout
  // NOTE: This is required because advanceBlockTo takes time
  this.timeout(20000);

  const [minter, dev, alice, bob, carol, didNotDeposit] = accounts;
  const depositAccounts = [alice, bob, carol];
  beforeEach(async () => {
    this.raisingToken = await MockERC20.new('LPToken', 'LP1', ether(RAISING_AMOUNT + '000000000000'), { from: minter });
    this.offeringToken = await MockERC20.new('WOW', 'WOW', ether(OFFERING_AMOUNT + '000000000000'), { from: minter });

    await this.raisingToken.transfer(bob, ether(RAISING_AMOUNT), { from: minter });
    await this.raisingToken.transfer(alice, ether(RAISING_AMOUNT), { from: minter });
    await this.raisingToken.transfer(carol, ether(RAISING_AMOUNT), { from: minter });
  });

  it('raise not enough lp', async () => {
    const START_BLOCK = (await time.latestBlock()).add(new BN(10));
    const IAO_LENGTH = new BN(10);
    const VESTING_LENGTH = new BN(1000);
    this.iao = await IAOLinearVesting.new();

    /**
      * IAO Linear Vesting
      IERC20 _stakeToken,
      IERC20 _offeringToken,
      uint256 _startBlock,
      uint256 _endBlockOffset,
      uint256 _vestingBlockOffset, // Block offset between vesting distributions
      uint256 _offeringAmount,
      uint256 _raisingAmount,
      address _adminAddress
     */
    await this.iao.initialize(
      this.raisingToken.address,
      this.offeringToken.address,
      START_BLOCK,
      IAO_LENGTH,
      VESTING_LENGTH,
      ether(OFFERING_AMOUNT), // offering amount
      ether(RAISING_AMOUNT),  // raising amount
      dev,
      { from: minter }
    );

    assert.equal((await this.iao.vestingEndBlock()).toString(), (START_BLOCK.add(IAO_LENGTH).add(VESTING_LENGTH)).toString());

    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('100'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('200'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('300'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), { from: bob }),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);

    await this.iao.deposit(ether('100'), { from: bob });
    await this.iao.deposit(ether('200'), { from: alice });
    await this.iao.deposit(ether('300'), { from: carol });
    assert.equal((await this.iao.totalAmount()).toString(), ether('600'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('30000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('10000000'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('0'));
    await expectRevert(
      this.iao.harvest({ from: bob }),
      'not harvest time',
    );

    const endBlock = (await this.iao.endBlock()).toNumber()
    const vestingEndBlock = (await this.iao.vestingEndBlock()).toNumber()
    // setup the number of periods to check 
    const periodsToCheck = 4;
    const blocksPerPeriod = (vestingEndBlock - endBlock) / periodsToCheck;
    // Advance to end block
    await time.advanceBlockTo(endBlock.toString());

    let initialOfferingTokenSnapshot = await getAccountTokenBalances(this.offeringToken, depositAccounts);
    let initialRaiseTokenSnapshot = await getAccountTokenBalances(this.raisingToken, depositAccounts);
    let initialIAZOSnapshot = await getIAZOSnapshot(this.iao, depositAccounts);

    // Test settings before IAO ends
    assert.equal(initialIAZOSnapshot.accountSnapshots[carol].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[carol].refunded, false);

    assert.equal(initialIAZOSnapshot.accountSnapshots[bob].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[bob].refunded, false);

    assert.equal(initialIAZOSnapshot.accountSnapshots[alice].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[alice].refunded, false);

    let lastOfferingTokenSnapshot = initialOfferingTokenSnapshot;
    let lastRaiseTokenSnapshot = initialRaiseTokenSnapshot;
    let lastIAZOSnapshot = initialIAZOSnapshot;
    // loop through sections of blocks and check that the harvest is accurate
    for (let currentBlock = endBlock; currentBlock <= vestingEndBlock; currentBlock += blocksPerPeriod) {
      await time.advanceBlockTo(currentBlock.toString());
      const vestingPercentage = (currentBlock - endBlock) / (vestingEndBlock - endBlock)

      await expectRevert(
        this.iao.harvest({ from: didNotDeposit }),
        'have you participated?',
      );

      // Harvest
      await this.iao.harvest({ from: alice });
      await this.iao.harvest({ from: bob });
      await this.iao.harvest({ from: carol });

      let currentOfferingTokenSnapshot = await getAccountTokenBalances(this.offeringToken, depositAccounts);
      let currentRaiseTokenSnapshot = await getAccountTokenBalances(this.raisingToken, depositAccounts);
      let currentIAZOSnapshot = await getIAZOSnapshot(this.iao, depositAccounts);

      assert.equal(currentIAZOSnapshot.accountSnapshots[carol].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[carol].refunded, true);

      assert.equal(currentIAZOSnapshot.accountSnapshots[bob].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[bob].refunded, true);

      assert.equal(currentIAZOSnapshot.accountSnapshots[alice].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[alice].refunded, true);

      const carolReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[carol].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[carol].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[carol], carolReleaseTokens, 2), true, 'carol release tokens are not accurate');

      const bobReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[bob].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[bob].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[bob], bobReleaseTokens, 2), true, 'bob release tokens are not accurate');

      const aliceReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[alice].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[alice].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[alice], aliceReleaseTokens, 2), true, 'alice release tokens are not accurate');

      lastOfferingTokenSnapshot = currentOfferingTokenSnapshot;
      lastRaiseTokenSnapshot = currentRaiseTokenSnapshot;
      lastIAZOSnapshot = currentIAZOSnapshot;
    }
    // Expect offering token balance to equal offering tokens allocated from the contract
    assert.equal(lastOfferingTokenSnapshot[carol], lastIAZOSnapshot.accountSnapshots[carol].userOfferingAmount, 'carol final offer balance does not equal contract offering amount');
    assert.equal(lastOfferingTokenSnapshot[bob], lastIAZOSnapshot.accountSnapshots[bob].userOfferingAmount, 'bob final offer balance does not equal contract offering amount');
    assert.equal(lastOfferingTokenSnapshot[alice], lastIAZOSnapshot.accountSnapshots[alice].userOfferingAmount, 'alice final offer balance does not equal contract offering amount');
    // Expect refund balance to equal balance increase of user
    assert.equal(subBNStr(lastRaiseTokenSnapshot[carol], initialRaiseTokenSnapshot[carol]), lastIAZOSnapshot.accountSnapshots[carol].userRefundingAmount, 'carol refunding amount inaccurate');
    assert.equal(subBNStr(lastRaiseTokenSnapshot[bob], initialRaiseTokenSnapshot[bob]), lastIAZOSnapshot.accountSnapshots[bob].userRefundingAmount, 'bob refunding amount inaccurate');
    assert.equal(subBNStr(lastRaiseTokenSnapshot[alice], initialRaiseTokenSnapshot[alice]), lastIAZOSnapshot.accountSnapshots[alice].userRefundingAmount, 'alice refunding amount inaccurate');
    // Expect that users cannot harvest anymore
    await expectRevert(
      this.iao.harvest({ from: alice }),
      'nothing left to harvest',
    );
    await expectRevert(
      this.iao.harvest({ from: bob }),
      'nothing left to harvest',
    );
    await expectRevert(
      this.iao.harvest({ from: carol }),
      'nothing left to harvest',
    );



    // Only raised 60%
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('40000000'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('600'));
    // final withdraw
    await this.iao.finalWithdraw(ether('600'), ether('40000000'), { from: dev })
    assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('40000000'));
    assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('600'));
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));
  })

  it('raise enough++ lp', async () => {
    const START_BLOCK = (await time.latestBlock()).add(new BN(10));
    const IAO_LENGTH = new BN(50);
    const VESTING_LENGTH = new BN(1000);

    this.iao = await IAOLinearVesting.new();
    await this.iao.initialize(
      this.raisingToken.address,
      this.offeringToken.address,
      START_BLOCK,
      IAO_LENGTH,
      VESTING_LENGTH,
      ether(OFFERING_AMOUNT), // offering amount
      ether(RAISING_AMOUNT),  // raising amount
      dev,
      { from: minter }
    );

    assert.equal((await this.iao.vestingEndBlock()).toString(), (START_BLOCK.add(IAO_LENGTH).add(VESTING_LENGTH)).toString());

    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), { from: bob }),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);

    await this.iao.deposit(ether('100'), { from: bob });
    await this.iao.deposit(ether('200'), { from: alice });
    await this.iao.deposit(ether('300'), { from: carol });
    await this.iao.deposit(ether('100'), { from: bob });
    await this.iao.deposit(ether('100'), { from: bob });
    await this.iao.deposit(ether('200'), { from: alice });
    await this.iao.deposit(ether('300'), { from: carol });
    await this.iao.deposit(ether('200'), { from: alice });
    await this.iao.deposit(ether('300'), { from: carol });
    assert.equal((await this.iao.totalAmount()).toString(), ether('1800'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('50000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('16666666.6666'));
    assert.equal((await this.iao.getOfferingAmount(alice)).toString(), ether('33333333.3333'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('400'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('133.333333334'));
    await expectRevert(
      this.iao.harvest({ from: bob }),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('1800'));

    const endBlock = (await this.iao.endBlock()).toNumber()
    const vestingEndBlock = (await this.iao.vestingEndBlock()).toNumber()
    // setup the number of periods to check 
    const periodsToCheck = 4;
    const blocksPerPeriod = (vestingEndBlock - endBlock) / periodsToCheck;
    // Advance to end block
    await time.advanceBlockTo(endBlock.toString());

    let initialOfferingTokenSnapshot = await getAccountTokenBalances(this.offeringToken, depositAccounts);
    let initialRaiseTokenSnapshot = await getAccountTokenBalances(this.raisingToken, depositAccounts);
    let initialIAZOSnapshot = await getIAZOSnapshot(this.iao, depositAccounts);

    // Test settings before IAO ends
    assert.equal(initialIAZOSnapshot.accountSnapshots[carol].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[carol].refunded, false);

    assert.equal(initialIAZOSnapshot.accountSnapshots[bob].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[bob].refunded, false);

    assert.equal(initialIAZOSnapshot.accountSnapshots[alice].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[alice].refunded, false);

    let lastOfferingTokenSnapshot = initialOfferingTokenSnapshot;
    let lastRaiseTokenSnapshot = initialRaiseTokenSnapshot;
    let lastIAZOSnapshot = initialIAZOSnapshot;
    // loop through sections of blocks and check that the harvest is accurate
    for (let currentBlock = endBlock; currentBlock <= vestingEndBlock; currentBlock += blocksPerPeriod) {
      await time.advanceBlockTo(currentBlock.toString());
      const vestingPercentage = (currentBlock - endBlock) / (vestingEndBlock - endBlock)

      await expectRevert(
        this.iao.harvest({ from: didNotDeposit }),
        'have you participated?',
      );

      // Harvest
      await this.iao.harvest({ from: alice });
      await this.iao.harvest({ from: bob });
      await this.iao.harvest({ from: carol });

      let currentOfferingTokenSnapshot = await getAccountTokenBalances(this.offeringToken, depositAccounts);
      let currentRaiseTokenSnapshot = await getAccountTokenBalances(this.raisingToken, depositAccounts);
      let currentIAZOSnapshot = await getIAZOSnapshot(this.iao, depositAccounts);

      assert.equal(currentIAZOSnapshot.accountSnapshots[carol].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[carol].refunded, true);

      assert.equal(currentIAZOSnapshot.accountSnapshots[bob].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[bob].refunded, true);

      assert.equal(currentIAZOSnapshot.accountSnapshots[alice].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[alice].refunded, true);

      const carolReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[carol].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[carol].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[carol], carolReleaseTokens, 2), true, 'carol release tokens are not accurate');

      const bobReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[bob].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[bob].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[bob], bobReleaseTokens, 2), true, 'bob release tokens are not accurate');

      const aliceReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[alice].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[alice].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[alice], aliceReleaseTokens, 2), true, 'alice release tokens are not accurate');

      lastOfferingTokenSnapshot = currentOfferingTokenSnapshot;
      lastRaiseTokenSnapshot = currentRaiseTokenSnapshot;
      lastIAZOSnapshot = currentIAZOSnapshot;
    }
    // Expect offering token balance to equal offering tokens allocated from the contract
    assert.equal(lastOfferingTokenSnapshot[carol], lastIAZOSnapshot.accountSnapshots[carol].userOfferingAmount, 'carol final offer balance does not equal contract offering amount');
    assert.equal(lastOfferingTokenSnapshot[bob], lastIAZOSnapshot.accountSnapshots[bob].userOfferingAmount, 'bob final offer balance does not equal contract offering amount');
    assert.equal(lastOfferingTokenSnapshot[alice], lastIAZOSnapshot.accountSnapshots[alice].userOfferingAmount, 'alice final offer balance does not equal contract offering amount');
    // Expect refund balance to equal balance increase of user
    assert.equal(subBNStr(lastRaiseTokenSnapshot[carol], initialRaiseTokenSnapshot[carol]), lastIAZOSnapshot.accountSnapshots[carol].userRefundingAmount, 'carol refunding amount inaccurate');
    assert.equal(subBNStr(lastRaiseTokenSnapshot[bob], initialRaiseTokenSnapshot[bob]), lastIAZOSnapshot.accountSnapshots[bob].userRefundingAmount, 'bob refunding amount inaccurate');
    assert.equal(subBNStr(lastRaiseTokenSnapshot[alice], initialRaiseTokenSnapshot[alice]), lastIAZOSnapshot.accountSnapshots[alice].userRefundingAmount, 'alice refunding amount inaccurate');
    // Expect that users cannot harvest anymore
    await expectRevert(
      this.iao.harvest({ from: alice }),
      'nothing left to harvest',
    );
    await expectRevert(
      this.iao.harvest({ from: bob }),
      'nothing left to harvest',
    );
    await expectRevert(
      this.iao.harvest({ from: carol }),
      'nothing left to harvest',
    );

    // 100 offering tokens are left due to rounding 
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('.0001'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('999.999999999'));
    // final withdraw
    await this.iao.finalWithdraw(ether('999.999999999'), ether('.0001'), { from: dev })
    assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('.0001'));
    assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('999.999999999'));
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));

  })

  it('raise enough lp', async () => {
    const START_BLOCK = (await time.latestBlock()).add(new BN(10));
    const IAO_LENGTH = new BN(50);
    const VESTING_LENGTH = new BN(1000);

    this.iao = await IAOLinearVesting.new();
    await this.iao.initialize(
      this.raisingToken.address,
      this.offeringToken.address,
      START_BLOCK,
      IAO_LENGTH,
      VESTING_LENGTH,
      ether('18'), // offering amount
      ether('18'),  // raising amount
      dev,
      { from: minter }
    );

    assert.equal((await this.iao.vestingEndBlock()).toString(), (START_BLOCK.add(IAO_LENGTH).add(VESTING_LENGTH)).toString());

    await this.offeringToken.transfer(this.iao.address, ether('18'), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: carol });
    await expectRevert(
      this.iao.deposit('1', { from: bob }),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);

    await this.iao.deposit(ether('1'), { from: bob });
    await this.iao.deposit(ether('2'), { from: alice });
    await this.iao.deposit(ether('3'), { from: carol });
    await this.iao.deposit(ether('1'), { from: bob });
    await this.iao.deposit(ether('2'), { from: alice });
    await this.iao.deposit(ether('3'), { from: carol });
    await this.iao.deposit(ether('1'), { from: bob });
    await this.iao.deposit(ether('2'), { from: alice });
    await this.iao.deposit(ether('3'), { from: carol });
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('9'));
    assert.equal((await this.iao.getOfferingAmount(minter)).toString(), ether('0'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('3'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('0'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('0'));
    await expectRevert(
      this.iao.harvest({ from: bob }),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));

    const endBlock = (await this.iao.endBlock()).toNumber()
    const vestingEndBlock = (await this.iao.vestingEndBlock()).toNumber()
    // setup the number of periods to check 
    const periodsToCheck = 4;
    const blocksPerPeriod = (vestingEndBlock - endBlock) / periodsToCheck;
    // Advance to end block
    await time.advanceBlockTo(endBlock.toString());

    let initialOfferingTokenSnapshot = await getAccountTokenBalances(this.offeringToken, depositAccounts);
    let initialRaiseTokenSnapshot = await getAccountTokenBalances(this.raisingToken, depositAccounts);
    let initialIAZOSnapshot = await getIAZOSnapshot(this.iao, depositAccounts);

    // Test settings before IAO ends
    assert.equal(initialIAZOSnapshot.accountSnapshots[carol].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[carol].refunded, false);

    assert.equal(initialIAZOSnapshot.accountSnapshots[bob].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[bob].refunded, false);

    assert.equal(initialIAZOSnapshot.accountSnapshots[alice].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[alice].refunded, false);

    let lastOfferingTokenSnapshot = initialOfferingTokenSnapshot;
    let lastRaiseTokenSnapshot = initialRaiseTokenSnapshot;
    let lastIAZOSnapshot = initialIAZOSnapshot;
    // loop through sections of blocks and check that the harvest is accurate
    for (let currentBlock = endBlock; currentBlock <= vestingEndBlock; currentBlock += blocksPerPeriod) {
      await time.advanceBlockTo(currentBlock.toString());
      const vestingPercentage = (currentBlock - endBlock) / (vestingEndBlock - endBlock)

      await expectRevert(
        this.iao.harvest({ from: didNotDeposit }),
        'have you participated?',
      );

      // Harvest
      await this.iao.harvest({ from: alice });
      await this.iao.harvest({ from: bob });
      await this.iao.harvest({ from: carol });

      let currentOfferingTokenSnapshot = await getAccountTokenBalances(this.offeringToken, depositAccounts);
      let currentRaiseTokenSnapshot = await getAccountTokenBalances(this.raisingToken, depositAccounts);
      let currentIAZOSnapshot = await getIAZOSnapshot(this.iao, depositAccounts);

      assert.equal(currentIAZOSnapshot.accountSnapshots[carol].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[carol].refunded, true);

      assert.equal(currentIAZOSnapshot.accountSnapshots[bob].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[bob].refunded, true);

      assert.equal(currentIAZOSnapshot.accountSnapshots[alice].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[alice].refunded, true);

      const carolReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[carol].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[carol].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[carol], carolReleaseTokens, 2), true, 'carol release tokens are not accurate');

      const bobReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[bob].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[bob].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[bob], bobReleaseTokens, 2), true, 'bob release tokens are not accurate');

      const aliceReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[alice].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[alice].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[alice], aliceReleaseTokens, 2), true, 'alice release tokens are not accurate');

      lastOfferingTokenSnapshot = currentOfferingTokenSnapshot;
      lastRaiseTokenSnapshot = currentRaiseTokenSnapshot;
      lastIAZOSnapshot = currentIAZOSnapshot;
    }
    // Expect offering token balance to equal offering tokens allocated from the contract
    assert.equal(lastOfferingTokenSnapshot[carol], lastIAZOSnapshot.accountSnapshots[carol].userOfferingAmount, 'carol final offer balance does not equal contract offering amount');
    assert.equal(lastOfferingTokenSnapshot[bob], lastIAZOSnapshot.accountSnapshots[bob].userOfferingAmount, 'bob final offer balance does not equal contract offering amount');
    assert.equal(lastOfferingTokenSnapshot[alice], lastIAZOSnapshot.accountSnapshots[alice].userOfferingAmount, 'alice final offer balance does not equal contract offering amount');
    // Expect refund balance to equal balance increase of user
    assert.equal(subBNStr(lastRaiseTokenSnapshot[carol], initialRaiseTokenSnapshot[carol]), lastIAZOSnapshot.accountSnapshots[carol].userRefundingAmount, 'carol refunding amount inaccurate');
    assert.equal(subBNStr(lastRaiseTokenSnapshot[bob], initialRaiseTokenSnapshot[bob]), lastIAZOSnapshot.accountSnapshots[bob].userRefundingAmount, 'bob refunding amount inaccurate');
    assert.equal(subBNStr(lastRaiseTokenSnapshot[alice], initialRaiseTokenSnapshot[alice]), lastIAZOSnapshot.accountSnapshots[alice].userRefundingAmount, 'alice refunding amount inaccurate');
    // Expect that users cannot harvest anymore
    await expectRevert(
      this.iao.harvest({ from: alice }),
      'nothing left to harvest',
    );
    await expectRevert(
      this.iao.harvest({ from: bob }),
      'nothing left to harvest',
    );
    await expectRevert(
      this.iao.harvest({ from: carol }),
      'nothing left to harvest',
    );

    assert.equal((await this.iao.getAddressListLength()).toString(), '3');

    // 100 offering tokens are left due to rounding 
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('18'));
    // final withdraw
    await this.iao.finalWithdraw(ether('18'), ether('0'), { from: dev })
    assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('18'));
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));

  })

  it('should handle allocations <1/1e6 when enough++ lp is raised', async () => {
    const START_BLOCK = (await time.latestBlock()).add(new BN(20));
    const IAO_LENGTH = new BN(50);
    const VESTING_LENGTH = new BN(1000);

    const BIG_RAISING_AMOUNT = '1000000000';
    await this.raisingToken.transfer(bob, ether(BIG_RAISING_AMOUNT), { from: minter });
    await this.raisingToken.transfer(alice, ether(BIG_RAISING_AMOUNT), { from: minter });
    await this.raisingToken.transfer(carol, ether(BIG_RAISING_AMOUNT), { from: minter });


    this.iao = await IAOLinearVesting.new();
    await this.iao.initialize(
      this.raisingToken.address,
      this.offeringToken.address,
      START_BLOCK,
      IAO_LENGTH,
      VESTING_LENGTH,
      ether(OFFERING_AMOUNT), // offering amount 
      ether(BIG_RAISING_AMOUNT),  // raising amount
      dev,
      { from: minter }
    );

    assert.equal((await this.iao.vestingEndBlock()).toString(), (START_BLOCK.add(IAO_LENGTH).add(VESTING_LENGTH)).toString());

    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether(BIG_RAISING_AMOUNT), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether(BIG_RAISING_AMOUNT), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), { from: bob }),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);

    await this.iao.deposit(ether(BIG_RAISING_AMOUNT), { from: bob });
    await this.iao.deposit(ether(BIG_RAISING_AMOUNT), { from: alice });
    // NOTE: Check this user's allocation when less than 1/1e6 of the total allocation
    await this.iao.deposit(ether('1'), { from: carol }); // Low deposit
    // check allocations
    assert.equal((await this.iao.totalAmount()).toString(), ether(BIG_RAISING_AMOUNT).add(ether(BIG_RAISING_AMOUNT)).add(ether('1')));
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '499999999750');
    assert.equal((await this.iao.getUserAllocation(bob)).toString(), '499999999750');
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '499');
    // check offering amounts

    assert.equal((await this.iao.getOfferingAmount(alice)).toString(), ether('49999999.975'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('49999999.975'));
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('.0499'));
    // check refunding amount
    assert.equal((await this.iao.getRefundingAmount(alice)).toString(), ether('500000000.250'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('500000000.250'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('.501'));
    await expectRevert(
      this.iao.harvest({ from: bob }),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether(BIG_RAISING_AMOUNT).add(ether(BIG_RAISING_AMOUNT)).add(ether('1')));

    const endBlock = (await this.iao.endBlock()).toNumber()
    const vestingEndBlock = (await this.iao.vestingEndBlock()).toNumber()
    // setup the number of periods to check 
    const periodsToCheck = 4;
    const blocksPerPeriod = (vestingEndBlock - endBlock) / periodsToCheck;
    // Advance to end block
    await time.advanceBlockTo(endBlock.toString());

    let initialOfferingTokenSnapshot = await getAccountTokenBalances(this.offeringToken, depositAccounts);
    let initialRaiseTokenSnapshot = await getAccountTokenBalances(this.raisingToken, depositAccounts);
    let initialIAZOSnapshot = await getIAZOSnapshot(this.iao, depositAccounts);

    // Test settings before IAO ends
    assert.equal(initialIAZOSnapshot.accountSnapshots[carol].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[carol].refunded, false);

    assert.equal(initialIAZOSnapshot.accountSnapshots[bob].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[bob].refunded, false);

    assert.equal(initialIAZOSnapshot.accountSnapshots[alice].hasHarvestedInitial, false);
    assert.equal(initialIAZOSnapshot.accountSnapshots[alice].refunded, false);

    let lastOfferingTokenSnapshot = initialOfferingTokenSnapshot;
    let lastRaiseTokenSnapshot = initialRaiseTokenSnapshot;
    let lastIAZOSnapshot = initialIAZOSnapshot;
    // loop through sections of blocks and check that the harvest is accurate
    for (let currentBlock = endBlock; currentBlock <= vestingEndBlock; currentBlock += blocksPerPeriod) {
      await time.advanceBlockTo(currentBlock.toString());
      const vestingPercentage = (currentBlock - endBlock) / (vestingEndBlock - endBlock)

      await expectRevert(
        this.iao.harvest({ from: didNotDeposit }),
        'have you participated?',
      );

      // Harvest
      await this.iao.harvest({ from: alice });
      await this.iao.harvest({ from: bob });
      await this.iao.harvest({ from: carol });

      let currentOfferingTokenSnapshot = await getAccountTokenBalances(this.offeringToken, depositAccounts);
      let currentRaiseTokenSnapshot = await getAccountTokenBalances(this.raisingToken, depositAccounts);
      let currentIAZOSnapshot = await getIAZOSnapshot(this.iao, depositAccounts);

      assert.equal(currentIAZOSnapshot.accountSnapshots[carol].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[carol].refunded, true);

      assert.equal(currentIAZOSnapshot.accountSnapshots[bob].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[bob].refunded, true);

      assert.equal(currentIAZOSnapshot.accountSnapshots[alice].hasHarvestedInitial, true);
      assert.equal(currentIAZOSnapshot.accountSnapshots[alice].refunded, true);

      const carolReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[carol].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[carol].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[carol], carolReleaseTokens, 2), true, 'carol release tokens are not accurate');

      const bobReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[bob].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[bob].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[bob], bobReleaseTokens, 2), true, 'bob release tokens are not accurate');

      const aliceReleaseTokens = getTotalReleasedTokens(currentIAZOSnapshot.accountSnapshots[alice].offeringInitialHarvestAmount, currentIAZOSnapshot.accountSnapshots[alice].offeringTokenVestedAmount, vestingPercentage);
      assert.equal(isWithinLimit(currentOfferingTokenSnapshot[alice], aliceReleaseTokens, 2), true, 'alice release tokens are not accurate');

      lastOfferingTokenSnapshot = currentOfferingTokenSnapshot;
      lastRaiseTokenSnapshot = currentRaiseTokenSnapshot;
      lastIAZOSnapshot = currentIAZOSnapshot;
    }
    // Expect offering token balance to equal offering tokens allocated from the contract
    assert.equal(lastOfferingTokenSnapshot[carol], lastIAZOSnapshot.accountSnapshots[carol].userOfferingAmount, 'carol final offer balance does not equal contract offering amount');
    assert.equal(lastOfferingTokenSnapshot[bob], lastIAZOSnapshot.accountSnapshots[bob].userOfferingAmount, 'bob final offer balance does not equal contract offering amount');
    assert.equal(lastOfferingTokenSnapshot[alice], lastIAZOSnapshot.accountSnapshots[alice].userOfferingAmount, 'alice final offer balance does not equal contract offering amount');
    // Expect refund balance to equal balance increase of user
    assert.equal(subBNStr(lastRaiseTokenSnapshot[carol], initialRaiseTokenSnapshot[carol]), lastIAZOSnapshot.accountSnapshots[carol].userRefundingAmount, 'carol refunding amount inaccurate');
    assert.equal(subBNStr(lastRaiseTokenSnapshot[bob], initialRaiseTokenSnapshot[bob]), lastIAZOSnapshot.accountSnapshots[bob].userRefundingAmount, 'bob refunding amount inaccurate');
    assert.equal(subBNStr(lastRaiseTokenSnapshot[alice], initialRaiseTokenSnapshot[alice]), lastIAZOSnapshot.accountSnapshots[alice].userRefundingAmount, 'alice refunding amount inaccurate');
    // Expect that users cannot harvest anymore
    await expectRevert(
      this.iao.harvest({ from: alice }),
      'nothing left to harvest',
    );
    await expectRevert(
      this.iao.harvest({ from: bob }),
      'nothing left to harvest',
    );
    await expectRevert(
      this.iao.harvest({ from: carol }),
      'nothing left to harvest',
    );

    // offering tokens left due to rounding 
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('.0001'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('999999999.999'));
    // final withdraw
    await this.iao.finalWithdraw(ether('999999999.999'), ether('.0001'), { from: dev })
    assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('.0001'));
    assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('999999999.999'));
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));
  })
});
