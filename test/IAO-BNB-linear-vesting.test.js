const { expectRevert, time, balance, tracker, ether, BN } = require('@openzeppelin/test-helpers');
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect, assert } = require('chai');
const { getContractGetterSnapshot, getAccountTokenBalances } = require('./helpers/contractHelper');
const { addBNStr, subBNStr, mulBNStr, divBNStr, isWithinLimit, isWithinWeiLimit } = require('./helpers/bnHelper');
const { getUserInfoSnapshot, getIAZOSnapshot, getTotalReleasedTokens } = require('./helpers/iaoHelper');

// Load compiled artifacts
const IAO = contract.fromArtifact('IAOLinearVesting');
const MockERC20 = contract.fromArtifact('MockERC20');


async function getAccountNativeBalances(accounts) {
  let promises = [];
  let accountBalances = {};

  for (const account of accounts) {
    promises.push(
      balance.current(account).then(
        (balance) =>
          (accountBalances = { ...accountBalances, [account]: balance.toString() })
      )
    );
  }

  await Promise.all(promises);
  return accountBalances;
}

// MAX uint256
// 8        10          10        10         10         10         10         10 = 78 (~77 useful decimals)
// 11579208 9237316195 4235709850 0868790785 3269984665 6405640394 5758400791 3129639935
describe('IAO-BNB Linear Vesting', function () {
  // NOTE: This is required because advanceBlockTo takes time
  this.timeout(20000);
  const [alice, bob, carol, dev, minter, didNotDeposit] = accounts;
  const depositAccounts = [alice, bob, carol];

  beforeEach(async () => {
    this.raisingToken = { address: '0x0000000000000000000000000000000000000000' }
    this.offeringToken = await MockERC20.new('WOW', 'WOW', ether('100000000000000000000'), { from: minter });
    this.carolBalanceTracker = await balance.tracker(carol) // instantiation
  });

  it('raise not enough lp - BNB staking', async () => {
    const START_BLOCK = (await time.latestBlock()).add(new BN(10));
    const IAO_LENGTH = new BN(10);
    const VESTING_LENGTH = new BN(1000);
    this.iao = await IAO.new();

    // 10 lp raising, 100 iao to offer
    await this.iao.initialize(
      this.raisingToken.address,
      this.offeringToken.address,
      START_BLOCK,
      IAO_LENGTH,
      VESTING_LENGTH,
      ether('100'), // offering amount
      ether('10'),  // raising amount
      dev,
      { from: minter }
    );

    assert.equal((await this.iao.vestingEndBlock()).toString(), (START_BLOCK.add(IAO_LENGTH).add(VESTING_LENGTH)).toString());

    await this.offeringToken.transfer(this.iao.address, ether('100'), { from: minter });

    await expectRevert(
      this.iao.deposit('1', { from: bob }),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);
    await this.iao.depositNative({ from: bob, value: ether('1') });
    await this.iao.depositNative({ from: alice, value: ether('2') });
    await this.iao.depositNative({ from: carol, value: ether('3') });
    assert.equal((await this.iao.totalAmount()).toString(), ether('6'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('30'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('10'));
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
    let initialRaiseTokenSnapshot = await getAccountNativeBalances(depositAccounts);
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
      let currentRaiseTokenSnapshot = await getAccountNativeBalances(depositAccounts);
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
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[carol], initialRaiseTokenSnapshot[carol]), lastIAZOSnapshot.accountSnapshots[carol].userRefundingAmount, ether('.01')), true, 'carol refunding amount inaccurate');
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[bob], initialRaiseTokenSnapshot[bob]), lastIAZOSnapshot.accountSnapshots[bob].userRefundingAmount, ether('.01')), true, 'bob refunding amount inaccurate');
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[alice], initialRaiseTokenSnapshot[alice]), lastIAZOSnapshot.accountSnapshots[alice].userRefundingAmount, ether('.01')), true, 'alice refunding amount inaccurate');
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
  })

  it('raise enough++ lp - BNB staking', async () => {
    const OFFERING_AMOUNT = '1000000000000000000'
    const START_BLOCK = (await time.latestBlock()).add(new BN(10));
    const IAO_LENGTH = new BN(10);
    const VESTING_LENGTH = new BN(1000);
    this.iao = await IAO.new();

    // 10 lp raising, 100 iao to offer
    await this.iao.initialize(
      this.raisingToken.address,
      this.offeringToken.address,
      START_BLOCK,
      IAO_LENGTH,
      VESTING_LENGTH,
      ether(OFFERING_AMOUNT), // offering amount
      ether('10'),  // raising amount
      dev,
      { from: minter }
    );

    assert.equal((await this.iao.vestingEndBlock()).toString(), (START_BLOCK.add(IAO_LENGTH).add(VESTING_LENGTH)).toString());

    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await expectRevert(
      this.iao.deposit(ether('1'), { from: bob }),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);

    await this.iao.depositNative({ from: bob, value: ether('1') });
    await this.iao.depositNative({ from: alice, value: ether('2') });
    await this.iao.depositNative({ from: carol, value: ether('3') });
    await this.iao.depositNative({ from: bob, value: ether('1') });
    await this.iao.depositNative({ from: alice, value: ether('2') });
    await this.iao.depositNative({ from: carol, value: ether('3') });
    await this.iao.depositNative({ from: bob, value: ether('1') });
    await this.iao.depositNative({ from: alice, value: ether('2') });
    await this.iao.depositNative({ from: carol, value: ether('3') });
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('500000000000000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), '166666666666666666666666666666666666');
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('4'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), '1333333333333333334');
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
    let initialRaiseTokenSnapshot = await getAccountNativeBalances(depositAccounts);
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
      let currentRaiseTokenSnapshot = await getAccountNativeBalances(depositAccounts);
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
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[carol], initialRaiseTokenSnapshot[carol]), lastIAZOSnapshot.accountSnapshots[carol].userRefundingAmount, ether('.01')), true, 'carol refunding amount inaccurate');
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[bob], initialRaiseTokenSnapshot[bob]), lastIAZOSnapshot.accountSnapshots[bob].userRefundingAmount, ether('.0101')), true, 'bob refunding amount inaccurate');
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[alice], initialRaiseTokenSnapshot[alice]), lastIAZOSnapshot.accountSnapshots[alice].userRefundingAmount, ether('.0101')), true, 'alice refunding amount inaccurate');
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

    const totalDebt = await this.iao.totalDebt();
    assert.equal(totalDebt.toString(), '0', 'total debt is not accurate');
  })

  it('raise enough lp - BNB staking', async () => {
    const START_BLOCK = (await time.latestBlock()).add(new BN(10));
    const IAO_LENGTH = new BN(10);
    const VESTING_LENGTH = new BN(1000);
    this.iao = await IAO.new();

    // 10 lp raising, 100 iao to offer
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

    await expectRevert(
      this.iao.deposit('1', { from: bob }),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);

    await this.iao.depositNative({ from: bob, value: ether('1') });
    await this.iao.depositNative({ from: alice, value: ether('2') });
    await this.iao.depositNative({ from: carol, value: ether('3') });
    await this.iao.depositNative({ from: bob, value: ether('1') });
    await this.iao.depositNative({ from: alice, value: ether('2') });
    await this.iao.depositNative({ from: carol, value: ether('3') });
    await this.iao.depositNative({ from: bob, value: ether('1') });
    await this.iao.depositNative({ from: alice, value: ether('2') });
    await this.iao.depositNative({ from: carol, value: ether('3') });
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('9'));
    assert.equal((await this.iao.getOfferingAmount(minter)).toString(), '0');
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('3'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), '0');
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), '0');
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
    let initialRaiseTokenSnapshot = await getAccountNativeBalances(depositAccounts);
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
      let currentRaiseTokenSnapshot = await getAccountNativeBalances(depositAccounts);
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
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[carol], initialRaiseTokenSnapshot[carol]), lastIAZOSnapshot.accountSnapshots[carol].userRefundingAmount, ether('.01')), true, 'carol refunding amount inaccurate');
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[bob], initialRaiseTokenSnapshot[bob]), lastIAZOSnapshot.accountSnapshots[bob].userRefundingAmount, ether('.01')), true, 'bob refunding amount inaccurate');
    assert.equal(isWithinWeiLimit(subBNStr(lastRaiseTokenSnapshot[alice], initialRaiseTokenSnapshot[alice]), lastIAZOSnapshot.accountSnapshots[alice].userRefundingAmount, ether('.01')), true, 'alice refunding amount inaccurate');
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
  })
});
