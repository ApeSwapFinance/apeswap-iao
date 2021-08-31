const { expectRevert, time, ether } = require('@openzeppelin/test-helpers');
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect, assert } = require('chai');

// Load compiled artifacts
const IFO = contract.fromArtifact('IFO');
const MockBEP20 = contract.fromArtifact('MockBEP20');

describe('IFO', function() {
  const OFFERING_AMOUNT = '100000000'
  const RAISING_AMOUNT = '1000'
  // Set timeout
  // NOTE: This is required because advanceBlockTo takes time
  this.timeout(20000);

  const [minter, dev, alice, bob, carol] = accounts;
  beforeEach(async () => {
    this.raisingToken = await MockBEP20.new('LPToken', 'LP1', ether(RAISING_AMOUNT + '000000'), { from: minter });
    this.offeringToken = await MockBEP20.new('WOW', 'WOW', ether(OFFERING_AMOUNT + '000000'), { from: minter });

    await this.raisingToken.transfer(bob, ether('1000'), { from: minter });
    await this.raisingToken.transfer(alice, ether('1000'), { from: minter });
    await this.raisingToken.transfer(carol, ether('1000'), { from: minter });
  });

  it('raise not enough lp', async () => {
    this.iao = await IFO.new(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '1020', 
      '1030', 
      ether(OFFERING_AMOUNT), // offering amount
      ether(RAISING_AMOUNT),  // raising amount
      dev, 
      { from: minter }
    );
    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('100'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('200'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('300'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('1020');

    await this.iao.deposit(ether('100'), {from: bob});
    await this.iao.deposit(ether('200'), {from: alice});
    await this.iao.deposit(ether('300'), {from: carol});
    assert.equal((await this.iao.totalAmount()).toString(), ether('600'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('30000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('10000000'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('0'));
    await expectRevert(
      this.iao.harvest({from: bob}),
      'not harvest time',
    );

    await time.advanceBlockTo('1030');
    assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('700'));
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), '0');
    await this.iao.harvest({from: carol});
    assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('700'));
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether('30000000'));
    await expectRevert(
      this.iao.harvest({from: carol}),
      'nothing to harvest',
    );

  })

  it('raise enough++ lp', async () => {
    // 10 lp raising, 100 ifo to offer
    this.iao = await IFO.new(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '1050', 
      '1100', 
      ether(OFFERING_AMOUNT), 
      ether(RAISING_AMOUNT), 
      dev, 
      { from: minter }
    );
    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: carol });
    await expectRevert(
      this.iao.deposit(ether('1'), {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('1050');

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
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('50000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('16666666.666666666600000000'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('400'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('133.333333333333334000'));
    await expectRevert(
      this.iao.harvest({from: bob}),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('1800'));

    await time.advanceBlockTo('1100');
    assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('100'));
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), '0');
    await this.iao.harvest({from: carol});
    assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('500'));
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether('50000000'));
    await expectRevert(
      this.iao.harvest({from: carol}),
      'nothing to harvest',
    );
    assert.equal((await this.iao.hasHarvest(carol)).toString(), 'true');
    assert.equal((await this.iao.hasHarvest(bob)).toString(), 'false');

  })

  it('raise enough lp', async () => {
    // 10 lp raising, 100 ifo to offer
    this.iao = await IFO.new(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '1120', 
      '1170', 
      ether('18'), 
      ether('18'), 
      alice, 
      { from: minter }
    );
    await this.offeringToken.transfer(this.iao.address, ether('100'), { from: minter });

    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: alice });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: bob });
    await this.raisingToken.approve(this.iao.address, ether('1000'), { from: carol });
    await expectRevert(
      this.iao.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('1120');

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
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('9'));
    assert.equal((await this.iao.getOfferingAmount(minter)).toString(), ether('0'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('3'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('0'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('0'));
    await expectRevert(
      this.iao.harvest({from: bob}),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));

    await time.advanceBlockTo('1170');
    assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('991'));
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), '0');
    await this.iao.harvest({from: carol});
    assert.equal((await this.raisingToken.balanceOf(carol)).toString(), ether('991'));
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether('9'));
    await expectRevert(
      this.iao.harvest({from: carol}),
      'nothing to harvest',
    );
    assert.equal((await this.iao.hasHarvest(carol)).toString(), 'true');
    assert.equal((await this.iao.hasHarvest(bob)).toString(), 'false');
    assert.equal((await this.iao.getAddressListLength()).toString(), '3');

  })
});
