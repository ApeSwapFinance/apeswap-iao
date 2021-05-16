const { expectRevert, time, balance, tracker } = require('@openzeppelin/test-helpers');
const MockBEP20 = artifacts.require('MockBEP20');
const IFO = artifacts.require('IFO');

contract('IFO', ([alice, bob, carol, dev, minter]) => {
  beforeEach(async () => {
    this.lp = { address: '0x0000000000000000000000000000000000000000' }
    this.ifoToken = await MockBEP20.new('WOW', 'WOW', '1000000', { from: minter });
    this.carolBalanceTracker = await balance.tracker(carol) // instantiation
  });

  it('raise not enough lp - BNB staking', async () => {
    // 10 lp raising, 100 ifo to offer
    this.ifo = await IFO.new(this.lp.address, this.ifoToken.address, '20', '30', '100', '10', alice, { from: minter });
    await this.ifoToken.transfer(this.ifo.address, '100', { from: minter });

    await expectRevert(
      this.ifo.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('20');

    await this.ifo.depositBNB({from: bob, value: '1'});
    await this.ifo.depositBNB({from: alice, value: '2'});
    await this.ifo.depositBNB({from: carol, value: '3'});
    assert.equal((await this.ifo.totalAmount()).toString(), '6');
    assert.equal((await this.ifo.getUserAllocation(carol)).toString(), '500000');
    assert.equal((await this.ifo.getUserAllocation(alice)).toString(), '333333');
    assert.equal((await this.ifo.getOfferingAmount(carol)).toString(), '30');
    assert.equal((await this.ifo.getOfferingAmount(bob)).toString(), '10');
    assert.equal((await this.ifo.getRefundingAmount(bob)).toString(), '0');
    await expectRevert(
      this.ifo.harvest({from: bob}),
      'not harvest time',
    );

    await time.advanceBlockTo('30');
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '0');
    await this.ifo.harvest({from: carol});
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '30');
    await expectRevert(
      this.ifo.harvest({from: carol}),
      'nothing to harvest',
    );

  })

  it('raise enough++ lp - BNB staking', async () => {
    // 10 lp raising, 100 ifo to offer
    this.ifo = await IFO.new(this.lp.address, this.ifoToken.address, '50', '100', '100', '10', alice, { from: minter });
    await this.ifoToken.transfer(this.ifo.address, '100', { from: minter });

    await expectRevert(
      this.ifo.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('50');

    await this.ifo.depositBNB({from: bob, value: '1'});
    await this.ifo.depositBNB({from: alice, value: '2'});
    await this.ifo.depositBNB({from: carol, value: '3'});
    await this.ifo.depositBNB({from: bob, value: '1'});
    await this.ifo.depositBNB({from: alice, value: '2'});
    await this.ifo.depositBNB({from: carol, value: '3'});
    await this.ifo.depositBNB({from: bob, value: '1'});
    await this.ifo.depositBNB({from: alice, value: '2'});
    await this.ifo.depositBNB({from: carol, value: '3'});
    assert.equal((await this.ifo.totalAmount()).toString(), '18');
    assert.equal((await this.ifo.getUserAllocation(carol)).toString(), '500000');
    assert.equal((await this.ifo.getUserAllocation(alice)).toString(), '333333');
    assert.equal((await this.ifo.getOfferingAmount(carol)).toString(), '50');
    assert.equal((await this.ifo.getOfferingAmount(bob)).toString(), '16');
    assert.equal((await this.ifo.getRefundingAmount(carol)).toString(), '4');
    assert.equal((await this.ifo.getRefundingAmount(bob)).toString(), '2');
    await expectRevert(
      this.ifo.harvest({from: bob}),
      'not harvest time',
    );
    assert.equal((await this.ifo.totalAmount()).toString(), '18');

    await time.advanceBlockTo('100');
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '0');
    await this.ifo.harvest({from: carol});
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '50');
    await expectRevert(
      this.ifo.harvest({from: carol}),
      'nothing to harvest',
    );
    assert.equal((await this.ifo.hasHarvest(carol)).toString(), 'true');
    assert.equal((await this.ifo.hasHarvest(bob)).toString(), 'false');

  })

  it('raise enough lp - BNB staking', async () => {
    // 10 lp raising, 100 ifo to offer
    this.ifo = await IFO.new(this.lp.address, this.ifoToken.address, '120', '170', '18', '18', alice, { from: minter });
    await this.ifoToken.transfer(this.ifo.address, '100', { from: minter });

    await expectRevert(
      this.ifo.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('120');

    await this.ifo.depositBNB({from: bob, value: '1'});
    await this.ifo.depositBNB({from: alice, value: '2'});
    await this.ifo.depositBNB({from: carol, value: '3'});
    await this.ifo.depositBNB({from: bob, value: '1'});
    await this.ifo.depositBNB({from: alice, value: '2'});
    await this.ifo.depositBNB({from: carol, value: '3'});
    await this.ifo.depositBNB({from: bob, value: '1'});
    await this.ifo.depositBNB({from: alice, value: '2'});
    await this.ifo.depositBNB({from: carol, value: '3'});
    assert.equal((await this.ifo.totalAmount()).toString(), '18');
    assert.equal((await this.ifo.getUserAllocation(carol)).toString(), '500000');
    assert.equal((await this.ifo.getUserAllocation(alice)).toString(), '333333');
    assert.equal((await this.ifo.getOfferingAmount(carol)).toString(), '9');
    assert.equal((await this.ifo.getOfferingAmount(minter)).toString(), '0');
    assert.equal((await this.ifo.getOfferingAmount(bob)).toString(), '3');
    assert.equal((await this.ifo.getRefundingAmount(carol)).toString(), '0');
    assert.equal((await this.ifo.getRefundingAmount(bob)).toString(), '0');
    await expectRevert(
      this.ifo.harvest({from: bob}),
      'not harvest time',
    );
    assert.equal((await this.ifo.totalAmount()).toString(), '18');

    await time.advanceBlockTo('170');
    await this.carolBalanceTracker.delta('wei');
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '0');
    await this.ifo.harvest({from: carol});
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '9');
    await expectRevert(
      this.ifo.harvest({from: carol}),
      'nothing to harvest',
    );
    assert.equal((await this.ifo.hasHarvest(carol)).toString(), 'true');
    assert.equal((await this.ifo.hasHarvest(bob)).toString(), 'false');
    assert.equal((await this.ifo.getAddressListLength()).toString(), '3');

  })
});
