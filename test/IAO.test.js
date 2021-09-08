const { expectRevert, time, ether, BN } = require('@openzeppelin/test-helpers');
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect, assert } = require('chai');

// Load compiled artifacts
const IAO = contract.fromArtifact('IAO');
const MockERC20 = contract.fromArtifact('MockERC20');

describe('IAO', function() {
  const OFFERING_AMOUNT = '100000000'
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

  it('raise not enough lp', async () => {
    const START_BLOCK = new BN(20);
    const IAO_LENGTH = new BN(10);
    this.iao = await IAO.new();

    await this.iao.initialize(
      this.raisingToken.address, 
      this.offeringToken.address, 
      START_BLOCK, 
      IAO_LENGTH,
      '10',
      ether(OFFERING_AMOUNT), // offering amount
      ether(RAISING_AMOUNT),  // raising amount
      dev, 
      { from: minter }
    );

    assert.equal((await this.iao.harvestReleaseBlocks(0)).toString(), START_BLOCK.add(IAO_LENGTH));
    assert.equal((await this.iao.harvestReleaseBlocks(1)).toString(), '40');
    assert.equal((await this.iao.harvestReleaseBlocks(2)).toString(), '50');
    assert.equal((await this.iao.harvestReleaseBlocks(3)).toString(), '60');

    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('100'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('200'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('300'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), {from: bob}),
      'not iao time',
    );

    await time.advanceBlockTo(START_BLOCK);

    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    assert.equal((await this.iao.totalAmount()).toString(), ether('600'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('30000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('10000000'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('0'));
    await expectRevert(
      this.iao.harvest(0, {from: bob}),
      'not harvest time',
    );

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

      // Harvest carol
      assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('700'));
      let beforeExpectedBalance = String(7500000 * harvestPeriod)
      assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(beforeExpectedBalance));

      await this.iao.harvest(harvestPeriod, {from: carol});
      let afterExpectedBalance = String(7500000 + 7500000 * harvestPeriod)
      assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(afterExpectedBalance));
      // no refund
      assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('700'));
      let userInfo = await this.iao.userInfo(carol)
      // no refund given 
      assert.equal(userInfo.refunded, false);
      // check that user cannot harvest twice
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: carol}),
        'harvest for period already claimed',
      );

      assert.equal((await this.iao.hasHarvested(carol, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(bob, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(alice, harvestPeriod)).toString(), 'true');
    }

    // Only raised 60%
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('40000000'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('600'));
    // final withdraw
    await this.iao.finalWithdraw(ether('600'), ether('40000000'), {from: dev})
    assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('40000000'));
    assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('600'));
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));
  })

  it('raise enough++ lp', async () => {
    this.iao = await IAO.new();
    await this.iao.initialize(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '100', 
      '50',
      '10',
      ether(OFFERING_AMOUNT), // offering amount
      ether(RAISING_AMOUNT),  // raising amount
      dev, 
      { from: minter }
    );

    assert.equal((await this.iao.harvestReleaseBlocks(0)).toString(), '150');
    assert.equal((await this.iao.harvestReleaseBlocks(1)).toString(), '160');
    assert.equal((await this.iao.harvestReleaseBlocks(2)).toString(), '170');
    assert.equal((await this.iao.harvestReleaseBlocks(3)).toString(), '180');


    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), {from: bob}),
      'not iao time',
    );

    await time.advanceBlockTo('100');

    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    assert.equal((await this.iao.totalAmount()).toString(), ether('1800'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('50000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('16666666.6666'));
    assert.equal((await this.iao.getOfferingAmount(alice)).toString(), ether('33333333.3333'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('400'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('133.333333334'));
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
      let raisingBalance = harvestPeriod ? ether('500') : ether('100');
      assert.equal((await this.raisingToken.balanceOf(carol)).toString(), raisingBalance);
      let beforeExpectedBalance = String(12500000 * harvestPeriod)
      assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(beforeExpectedBalance));
      
      // Harvest
      await this.iao.harvest(harvestPeriod, {from: carol});
      let afterExpectedBalance = String(12500000 + 12500000 * harvestPeriod)
      assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(afterExpectedBalance));
      // refund given
      assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('500'));
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
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('.0001'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('999.999999999'));
    // final withdraw
    await this.iao.finalWithdraw(ether('999.999999999'), ether('.0001'), {from: dev})
    assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('.0001'));
    assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('999.999999999'));
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));

  })

  it('raise enough lp', async () => {
    this.iao = await IAO.new();
    await this.iao.initialize(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '300', 
      '50', 
      '10',
      ether('18'), // offering amount
      ether('18'),  // raising amount
      dev, 
      { from: minter }
    );

    assert.equal((await this.iao.harvestReleaseBlocks(0)).toString(), '350');
    assert.equal((await this.iao.harvestReleaseBlocks(1)).toString(), '360');
    assert.equal((await this.iao.harvestReleaseBlocks(2)).toString(), '370');
    assert.equal((await this.iao.harvestReleaseBlocks(3)).toString(), '380');


    await this.offeringToken.transfer(this.iao.address, ether('18'), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: carol });
    await expectRevert(
      this.iao.deposit('1', {from: bob}),
      'not iao time',
    );

    await time.advanceBlockTo('300');

    await this.iao.deposit(ether('1'), {from: bob});
    await this.iao.deposit(ether('2'), {from: alice});
    await this.iao.deposit(ether('3'), {from: carol});
    await this.iao.deposit(ether('1'), {from: bob});
    await this.iao.deposit(ether('2'), {from: alice});
    await this.iao.deposit(ether('3'), {from: carol});
    await this.iao.deposit(ether('1'), {from: bob});
    await this.iao.deposit(ether('2'), {from: alice});
    await this.iao.deposit(ether('3'), {from: carol});
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('9'));
    assert.equal((await this.iao.getOfferingAmount(minter)).toString(), ether('0'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('3'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('0'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('0'));
    await expectRevert(
      this.iao.harvest(0, {from: bob}),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));

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
      let userInfo = await this.iao.userInfo(bob)
      assert.equal(userInfo.refunded, false);
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: bob}),
        'harvest for period already claimed',
      );

      // Harvest alice
      await this.iao.harvest(harvestPeriod, {from: alice});
      userInfo = await this.iao.userInfo(alice)
      assert.equal(userInfo.refunded, false);
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: alice}),
        'harvest for period already claimed',
      );

      // test view functions
      const { stakeTokenHarvest, offeringTokenHarvest, offeringTokensVested } = await this.iao.userTokenStatus(carol);
      assert.equal(stakeTokenHarvest.toString(), ether('0'));
      assert.equal(offeringTokenHarvest.toString(), ether('2.25'));
      let harvestLeft = String(6.75 - (2.25 * harvestPeriod));
      assert.equal(offeringTokensVested.toString(), ether(harvestLeft));
      

      assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('991'));
      let beforeExpectedBalance = String(2.25 * harvestPeriod)
      assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(beforeExpectedBalance));
      
      // Harvest
      await this.iao.harvest(harvestPeriod, {from: carol});
      let afterExpectedBalance = String(2.25 + 2.25 * harvestPeriod)
      assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(afterExpectedBalance));
      // refund given
      assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('991'));
      userInfo = await this.iao.userInfo(carol)
      assert.equal(userInfo.refunded, false);
      // check that user cannot harvest twice
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: carol}),
        'harvest for period already claimed',
      );

      assert.equal((await this.iao.hasHarvested(carol, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(bob, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(alice, harvestPeriod)).toString(), 'true');
    }

    assert.equal((await this.iao.getAddressListLength()).toString(), '3');

    
    // 100 offering tokens are left due to rounding 
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('18'));
    // final withdraw
    await this.iao.finalWithdraw(ether('18'), ether('0'), {from: dev})
    assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('18'));
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));

  })

  it('should handle allocations <1/1e6 when enough++ lp is raised', async () => {
    const BIG_RAISING_AMOUNT = '1000000000';
    await this.raisingToken.transfer(bob, ether(BIG_RAISING_AMOUNT), { from: minter });
    await this.raisingToken.transfer(alice, ether(BIG_RAISING_AMOUNT), { from: minter });
    await this.raisingToken.transfer(carol, ether(BIG_RAISING_AMOUNT), { from: minter });


    this.iao = await IAO.new();
    await this.iao.initialize(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '500', 
      '50',
      '10',
      ether(OFFERING_AMOUNT), // offering amount 
      ether(BIG_RAISING_AMOUNT),  // raising amount
      dev, 
      { from: minter }
    );

    assert.equal((await this.iao.harvestReleaseBlocks(0)).toString(), '550');
    assert.equal((await this.iao.harvestReleaseBlocks(1)).toString(), '560');
    assert.equal((await this.iao.harvestReleaseBlocks(2)).toString(), '570');
    assert.equal((await this.iao.harvestReleaseBlocks(3)).toString(), '580');


    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether(BIG_RAISING_AMOUNT), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether(BIG_RAISING_AMOUNT), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), {from: bob}),
      'not iao time',
    );

    await time.advanceBlockTo('500');

    await this.iao.deposit(ether(BIG_RAISING_AMOUNT), {from: bob});
    await this.iao.deposit(ether(BIG_RAISING_AMOUNT), {from: alice});
    // NOTE: Check this user's allocation when less than 1/1e6 of the total allocation
    await this.iao.deposit(ether('1'), {from: carol}); // Low deposit
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
      this.iao.harvest(0, {from: bob}),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether(BIG_RAISING_AMOUNT).add(ether(BIG_RAISING_AMOUNT)).add(ether('1')));

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

      // Harvest
      await this.iao.harvest(harvestPeriod, {from: carol});
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: carol}),
        'harvest for period already claimed',
      );

      assert.equal((await this.iao.hasHarvested(carol, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(bob, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(alice, harvestPeriod)).toString(), 'true');
    }

    // offering tokens left due to rounding 
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('.0001'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('999999999.999'));
    // final withdraw
    await this.iao.finalWithdraw(ether('999999999.999'), ether('.0001'), {from: dev})
    assert.equal((await this.offeringToken.balanceOf(dev)).toString(), ether('.0001'));
    assert.equal((await this.raisingToken.balanceOf(dev)).toString(), ether('999999999.999'));
    assert.equal((await this.offeringToken.balanceOf(this.iao.address)).toString(), ether('0'));
    assert.equal((await this.raisingToken.balanceOf(this.iao.address)).toString(), ether('0'));
  })
});
