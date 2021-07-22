const { expectRevert, time, balance, tracker, ether } = require('@openzeppelin/test-helpers');
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect, assert } = require('chai');

// Load compiled artifacts
const IFO = contract.fromArtifact('IFO');
const MockBEP20 = contract.fromArtifact('MockBEP20');

// MAX uint256
// 8        10          10        10         10         10         10         10 = 78 (~77 useful decimals)
// 11579208 9237316195 4235709850 0868790785 3269984665 6405640394 5758400791 3129639935
describe('IFO-BNB', function() {
  const [alice, bob, carol, dev, minter] = accounts;

  beforeEach(async () => {
    this.raisingToken = { address: '0x0000000000000000000000000000000000000000' }
    this.offeringToken = await MockBEP20.new('WOW', 'WOW', ether('100000000000000000000'), { from: minter });
    this.carolBalanceTracker = await balance.tracker(carol) // instantiation
  });

  it('raise not enough lp - BNB staking', async () => {
    // 10 lp raising, 100 ifo to offer
    this.iao = await IFO.new(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '20', 
      '30', 
      ether('100'), // offering amount
      ether('10'),  // raising amount
      alice, 
      { from: minter }
    );
    await this.offeringToken.transfer(this.iao.address, ether('100'), { from: minter });

    await expectRevert(
      this.iao.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('20');
    await this.iao.depositBNB({from: bob, value: ether('1')});
    await this.iao.depositBNB({from: alice, value: ether('2')});
    await this.iao.depositBNB({from: carol, value: ether('3')});
    assert.equal((await this.iao.totalAmount()).toString(), ether('6'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('30'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('10'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), ether('0'));
    await expectRevert(
      this.iao.harvest({from: bob}),
      'not harvest time',
    );

    await time.advanceBlockTo('30');
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), '0');
    await this.iao.harvest({from: carol});
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether('30'));
    await expectRevert(
      this.iao.harvest({from: carol}),
      'nothing to harvest',
    );

  })

  it('raise enough++ lp - BNB staking', async () => {
    const OFFERING_AMOUNT = '1000000000000000000'

    // 10 lp raising, 100 ifo to offer
    this.iao = await IFO.new(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '50', 
      '100', 
      ether(OFFERING_AMOUNT), // offering amount
      ether('10'),  // raising amount
      alice, 
      { from: minter }
    );
    await this.offeringToken.transfer(this.iao.address, ether(OFFERING_AMOUNT), { from: minter });

    await expectRevert(
      this.iao.deposit(ether('1'), {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('50');

    await this.iao.depositBNB({from: bob, value: ether('1')});
    await this.iao.depositBNB({from: alice, value: ether('2')});
    await this.iao.depositBNB({from: carol, value: ether('3')});
    await this.iao.depositBNB({from: bob, value: ether('1')});
    await this.iao.depositBNB({from: alice, value: ether('2')});
    await this.iao.depositBNB({from: carol, value: ether('3')});
    await this.iao.depositBNB({from: bob, value: ether('1')});
    await this.iao.depositBNB({from: alice, value: ether('2')});
    await this.iao.depositBNB({from: carol, value: ether('3')});
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('500000000000000000'));
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), '166666666666666666000000000000000000');
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), ether('4'));
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), '1333333333333333340');
    await expectRevert(
      this.iao.harvest({from: bob}),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));

    await time.advanceBlockTo('100');
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), ether('0'));
    await this.iao.harvest({from: carol});
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), '500000000000000000000000000000000000');
    await expectRevert(
      this.iao.harvest({from: carol}),
      'nothing to harvest',
    );
    assert.equal((await this.iao.hasHarvest(carol)).toString(), 'true');
    assert.equal((await this.iao.hasHarvest(bob)).toString(), 'false');

  })

  it('raise enough lp - BNB staking', async () => {
    // 10 lp raising, 100 ifo to offer
    this.iao = await IFO.new(
      this.raisingToken.address, 
      this.offeringToken.address, 
      '120', 
      '170', 
      ether('18'), // offering amount
      ether('18'), // raising amount
      alice, 
      { from: minter }
    );
    await this.offeringToken.transfer(this.iao.address, ether('100'), { from: minter });

    await expectRevert(
      this.iao.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('120');

    await this.iao.depositBNB({from: bob, value: ether('1')});
    await this.iao.depositBNB({from: alice, value: ether('2')});
    await this.iao.depositBNB({from: carol, value: ether('3')});
    await this.iao.depositBNB({from: bob, value: ether('1')});
    await this.iao.depositBNB({from: alice, value: ether('2')});
    await this.iao.depositBNB({from: carol, value: ether('3')});
    await this.iao.depositBNB({from: bob, value: ether('1')});
    await this.iao.depositBNB({from: alice, value: ether('2')});
    await this.iao.depositBNB({from: carol, value: ether('3')});
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));
    assert.equal((await this.iao.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.iao.getUserAllocation(alice)).toString(), '333333333333333333');
    assert.equal((await this.iao.getOfferingAmount(carol)).toString(), ether('9'));
    assert.equal((await this.iao.getOfferingAmount(minter)).toString(), '0');
    assert.equal((await this.iao.getOfferingAmount(bob)).toString(), ether('3'));
    assert.equal((await this.iao.getRefundingAmount(carol)).toString(), '0');
    assert.equal((await this.iao.getRefundingAmount(bob)).toString(), '0');
    await expectRevert(
      this.iao.harvest({from: bob}),
      'not harvest time',
    );
    assert.equal((await this.iao.totalAmount()).toString(), ether('18'));

    await time.advanceBlockTo('170');
    await this.carolBalanceTracker.delta('wei');
    assert.equal((await this.offeringToken.balanceOf(carol)).toString(), '0');
    await this.iao.harvest({from: carol});
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
