const { expectRevert, time, ether } = require('@openzeppelin/test-helpers');
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect, assert } = require('chai');

// Load compiled artifacts
const IAO = contract.fromArtifact('IAO');
const MockBEP20 = contract.fromArtifact('MockBEP20');

describe('IAO', function() {
  const OFFERING_AMOUNT = '100000000'
  const RAISING_AMOUNT = '1000'
  // Set timeout
  // NOTE: This is required because advanceBlockTo takes time
  this.timeout(10000);

  const [minter, dev, alice, bob, carol] = accounts;
  beforeEach(async () => {
    this.raisingToken = await MockBEP20.new('LPToken', 'LP1', ether(RAISING_AMOUNT + '000000'), { from: minter });
    this.offeringToken = await MockBEP20.new('WOW', 'WOW', ether(OFFERING_AMOUNT + '000000'), { from: minter });

    await this.raisingToken.transfer(bob, ether('1000'), { from: minter });
    await this.raisingToken.transfer(alice, ether('1000'), { from: minter });
    await this.raisingToken.transfer(carol, ether('1000'), { from: minter });
  });

  it('raise not enough lp', async () => {
    this.iao = await IAO.new();
    await this.iao.initialize(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '20', 
      '10',
      '10',
      ether(OFFERING_AMOUNT), // offering amount
      ether(RAISING_AMOUNT),  // raising amount
      dev, 
      { from: minter }
    );

    assert.equal((await this.iao.harvestReleaseBlocks(0)).toString(), '30');
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

    await time.advanceBlockTo('20');

    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    assert.equal((await this.iao.totalAmount()).toString(), ether('600'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333');
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
      assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('700'));
      let beforeExpectedBalance = String(7500000 * harvestPeriod)
      assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(beforeExpectedBalance));
      
      // Harvest
      await this.iao.harvest(harvestPeriod, {from: carol});
      let afterExpectedBalance = String(7500000 + 7500000 * harvestPeriod)
      assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether(afterExpectedBalance));
      // no refund
      assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('700'));
      let userInfo = await this.iao.userInfo(carol)
      assert.equal(userInfo.refunded, false);
      // check that user cannot harvest twice
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: carol}),
        'harvest for period already claimed',
      );
    }

    await expectRevert(
      this.iao.harvest(4, {from: carol}),
      'harvest period out of range',
    );

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
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('50000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('16666600'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('400'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('133.334'));
    await expectRevert(
      this.iao.harvest(0, {from: bob}),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('1800'));

    // Test each harvest period
    for (let harvestPeriod = 0; harvestPeriod < 4; harvestPeriod++) {
      await time.advanceBlockTo((await this.iao.harvestReleaseBlocks(harvestPeriod)).toString());
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
    }

  })

  it('raise enough lp', async () => {
    this.iao = await IAO.new();
    await this.iao.initialize(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '200', 
      '50', 
      '10',
      ether('18'), // offering amount
      ether('18'),  // raising amount
      dev, 
      { from: minter }
    );

    assert.equal((await this.iao.harvestReleaseBlocks(0)).toString(), '250');
    assert.equal((await this.iao.harvestReleaseBlocks(1)).toString(), '260');
    assert.equal((await this.iao.harvestReleaseBlocks(2)).toString(), '270');
    assert.equal((await this.iao.harvestReleaseBlocks(3)).toString(), '280');


    await this.offeringToken.transfer(this.iao.address, ether('100'), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: carol });
    await expectRevert(
      this.iao.deposit('1', {from: bob}),
      'not iao time',
    );

    await time.advanceBlockTo('200');

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
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333');
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
      let userInfo = await this.iao.userInfo(carol)
      assert.equal(userInfo.refunded, false);
      // check that user cannot harvest twice
      await expectRevert(
        this.iao.harvest(harvestPeriod, {from: carol}),
        'harvest for period already claimed',
      );

      assert.equal((await this.iao.hasHarvested(carol, harvestPeriod)).toString(), 'true');
      assert.equal((await this.iao.hasHarvested(bob, harvestPeriod)).toString(), 'false');

      // TEST
      // tokensAvailableForHarvest
    }

    assert.equal((await this.iao.getAddressListLength()).toString(), '3');

  })
});
