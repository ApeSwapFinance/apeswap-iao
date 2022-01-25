const { expectRevert, time, ether, BN } = require('@openzeppelin/test-helpers');
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect, assert } = require('chai');

// Load compiled artifacts
const IAO = contract.fromArtifact('IAO');
const MockERC20 = contract.fromArtifact('MockERC20');

describe('IAO Large Offer', function() {
  const OFFERING_AMOUNT = '100000000000000000'
  const RAISING_AMOUNT = '1000'
  // Set timeout
  // NOTE: This is required because advanceBlockTo takes time
  this.timeout(10000);

  const [minter, dev, alice, bob, carol] = accounts;
  beforeEach(async () => {
    this.raisingToken = await MockERC20.new('LPToken', 'LP1', ether(RAISING_AMOUNT + '000000000000'), { from: minter });
    this.offeringToken = await MockERC20.new('WOW', 'WOW', ether(OFFERING_AMOUNT + '000000000000'), { from: minter });

    await this.raisingToken.transfer(bob, ether(RAISING_AMOUNT), { from: minter });
    await this.raisingToken.transfer(alice, ether(RAISING_AMOUNT), { from: minter });
    await this.raisingToken.transfer(carol, ether(RAISING_AMOUNT), { from: minter });
  });

  it('should allow variable raise and offers', async () => {
    const START_BLOCK = (await time.latestBlock()).add(new BN(10));
    const IAO_LENGTH = new BN(10);
    const VESTING_PERIOD_LENGTH = new BN(10);

    this.iao = await IAO.new();
    await this.iao.initialize(
      this.raisingToken.address, 
      this.offeringToken.address, 
      START_BLOCK, 
      IAO_LENGTH,
      VESTING_PERIOD_LENGTH,
      ether(OFFERING_AMOUNT), // offering amount
      ether(RAISING_AMOUNT),  // raising amount
      dev, 
      { from: minter }
    );

    const endBlock = START_BLOCK.add(IAO_LENGTH);
    assert.equal((await this.iao.harvestReleaseBlocks(0)).toString(), endBlock);
    assert.equal((await this.iao.harvestReleaseBlocks(1)).toString(), endBlock.add(VESTING_PERIOD_LENGTH));
    assert.equal((await this.iao.harvestReleaseBlocks(2)).toString(), endBlock.add(VESTING_PERIOD_LENGTH).add(VESTING_PERIOD_LENGTH));
    assert.equal((await this.iao.harvestReleaseBlocks(3)).toString(), endBlock.add(VESTING_PERIOD_LENGTH).add(VESTING_PERIOD_LENGTH).add(VESTING_PERIOD_LENGTH));


    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), {from: bob}),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);

    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    // Just ensure these function calls works when testing different raise/offer amounts
    await this.iao.totalAmount(); 
    await this.iao.getUserAllocation(carol);  
    await this.iao.getUserAllocation(alice);  
    await this.iao.getOfferingAmount(carol  );
    await this.iao.getOfferingAmount(bob);  
    await this.iao.getOfferingAmount(alice);  
    await this.iao.getRefundingAmount(carol );
    await this.iao.getRefundingAmount(bob);
    // assert.equal((await this.iao.totalAmount()).toString(), ether('1800'));
    // assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    // assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    // assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('50000000'));
    // assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('16666666.6666'));
    // assert.equal((await this.iao.getOfferingAmount(alice)).toString(), ether('33333333.3333'));
    // assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('400'));
    // assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('133.333333334'));
    await expectRevert(
      this.iao.harvest(0, {from: bob}),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('1800'));

    // Test each harvest period
    for (let harvestPeriod = 0; harvestPeriod < 4; harvestPeriod++) {
      await time.advanceBlockTo((await this.iao.harvestReleaseBlocks(harvestPeriod)).toString());
      
      // check that user cannot deposit during outside of active states
      await expectRevert(
        this.iao.deposit('1', {from: carol}),
        'not iao time',
      );

      // Harvest bob
      await this.iao.harvest(harvestPeriod, {from: bob});
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: bob}),
        'harvest for period already claimed',
      );

      // Harvest alice
      await this.iao.harvest(harvestPeriod, {from: alice});
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: alice}),
        'harvest for period already claimed',
      );

      // harvest carol
      // let raisingBalance = harvestPeriod ? ether('500') : ether('100');
      // assert.equal((await this.raisingToken.balanceOf(carol)).toString(), raisingBalance);
      // let beforeExpectedBalance = String(12500000 * harvestPeriod)
      // assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(beforeExpectedBalance));
      
      // Harvest
      await this.iao.harvest(harvestPeriod, {from: carol});
      // let afterExpectedBalance = String(12500000 + 12500000 * harvestPeriod)
      // assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(afterExpectedBalance));
      // refund given
      // assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('500'));
      let userInfo = await this.iao.userInfo(carol)
      assert.equal(userInfo.refunded, true);
      // check that user cannot harvest twice
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: carol}),
        'harvest for period already claimed',
      );

      assert.equal((await this.iao.hasHarvested(carol, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(bob, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(alice, harvestPeriod)).toString(), 'true');
    }

    // 100 offering tokens are left due to rounding 
    // assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('.0001'));
    // assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('999.999999999'));
    // final withdraw
    await this.iao.finalWithdraw(ether('100'), '0', {from: dev})
    // assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('.0001'));
    // assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('999.999999999'));
    // assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    // assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));

  })
});
