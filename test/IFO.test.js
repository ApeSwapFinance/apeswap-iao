const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect, assert } = require('chai');

// Load compiled artifacts
const IFO = contract.fromArtifact('IFO');
const MockBEP20 = contract.fromArtifact('MockBEP20');

describe('IFO', function() {
  // Set timeout
  // TODO: This is required because advanceBlockTo takes time
  this.timeout(10000);

  const [alice, bob, carol, dev, minter] = accounts;
  beforeEach(async () => {
    this.lp = await MockBEP20.new('LPToken', 'LP1', '1000000', { from: minter });
    this.ifoToken = await MockBEP20.new('WOW', 'WOW', '1000000', { from: minter });

    await this.lp.transfer(bob, '10', { from: minter });
    await this.lp.transfer(alice, '10', { from: minter });
    await this.lp.transfer(carol, '10', { from: minter });
  });

  it('raise not enough lp', async () => {
    // 10 lp raising, 100 ifo to offer
    this.ifo = await IFO.new(this.lp.address, this.ifoToken.address, '1020', '1030', '100', '10', alice, { from: minter });
    await this.ifoToken.transfer(this.ifo.address, '100', { from: minter });

    await this.lp.approve(this.ifo.address, '1000', { from: alice });
    await this.lp.approve(this.ifo.address, '1000', { from: bob });
    await this.lp.approve(this.ifo.address, '1000', { from: carol });
    await expectRevert(
      this.ifo.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('1020');

    await this.ifo.deposit('1', {from: bob});
    await this.ifo.deposit('2', {from: alice});
    await this.ifo.deposit('3', {from: carol});
    assert.equal((await this.ifo.totalAmount()).toString(), '6');
    assert.equal((await this.ifo.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.ifo.getUserAllocation(alice)).toString(), '333333333333333333');
    assert.equal((await this.ifo.getOfferingAmount(carol)).toString(), '30');
    assert.equal((await this.ifo.getOfferingAmount(bob)).toString(), '10');
    assert.equal((await this.ifo.getRefundingAmount(bob)).toString(), '0');
    await expectRevert(
      this.ifo.harvest({from: bob}),
      'not harvest time',
    );

    await time.advanceBlockTo('1030');
    assert.equal((await this.lp.balanceOf(carol)).toString(), '7');
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '0');
    await this.ifo.harvest({from: carol});
    assert.equal((await this.lp.balanceOf(carol)).toString(), '7');
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '30');
    await expectRevert(
      this.ifo.harvest({from: carol}),
      'nothing to harvest',
    );

  })

  it('raise enough++ lp', async () => {
    // 10 lp raising, 100 ifo to offer
    this.ifo = await IFO.new(this.lp.address, this.ifoToken.address, '1050', '1100', '100', '10', alice, { from: minter });
    await this.ifoToken.transfer(this.ifo.address, '100', { from: minter });

    await this.lp.approve(this.ifo.address, '1000', { from: alice });
    await this.lp.approve(this.ifo.address, '1000', { from: bob });
    await this.lp.approve(this.ifo.address, '1000', { from: carol });
    await expectRevert(
      this.ifo.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('1050');

    await this.ifo.deposit('1', {from: bob});
    await this.ifo.deposit('2', {from: alice});
    await this.ifo.deposit('3', {from: carol});
    await this.ifo.deposit('1', {from: bob});
    await this.ifo.deposit('2', {from: alice});
    await this.ifo.deposit('3', {from: carol});
    await this.ifo.deposit('1', {from: bob});
    await this.ifo.deposit('2', {from: alice});
    await this.ifo.deposit('3', {from: carol});
    assert.equal((await this.ifo.totalAmount()).toString(), '18');
    assert.equal((await this.ifo.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.ifo.getUserAllocation(alice)).toString(), '333333333333333333');
    assert.equal((await this.ifo.getOfferingAmount(carol)).toString(), '50');
    assert.equal((await this.ifo.getOfferingAmount(bob)).toString(), '16');
    assert.equal((await this.ifo.getRefundingAmount(carol)).toString(), '4');
    assert.equal((await this.ifo.getRefundingAmount(bob)).toString(), '2');
    await expectRevert(
      this.ifo.harvest({from: bob}),
      'not harvest time',
    );
    assert.equal((await this.ifo.totalAmount()).toString(), '18');

    await time.advanceBlockTo('1100');
    assert.equal((await this.lp.balanceOf(carol)).toString(), '1');
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '0');
    await this.ifo.harvest({from: carol});
    assert.equal((await this.lp.balanceOf(carol)).toString(), '5');
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '50');
    await expectRevert(
      this.ifo.harvest({from: carol}),
      'nothing to harvest',
    );
    assert.equal((await this.ifo.hasHarvest(carol)).toString(), 'true');
    assert.equal((await this.ifo.hasHarvest(bob)).toString(), 'false');

  })

  it('raise enough lp', async () => {
    // 10 lp raising, 100 ifo to offer
    this.ifo = await IFO.new(this.lp.address, this.ifoToken.address, '1120', '1170', '18', '18', alice, { from: minter });
    await this.ifoToken.transfer(this.ifo.address, '100', { from: minter });

    await this.lp.approve(this.ifo.address, '1000', { from: alice });
    await this.lp.approve(this.ifo.address, '1000', { from: bob });
    await this.lp.approve(this.ifo.address, '1000', { from: carol });
    await expectRevert(
      this.ifo.deposit('1', {from: bob}),
      'not ifo time',
    );

    await time.advanceBlockTo('1120');

    await this.ifo.deposit('1', {from: bob});
    await this.ifo.deposit('2', {from: alice});
    await this.ifo.deposit('3', {from: carol});
    await this.ifo.deposit('1', {from: bob});
    await this.ifo.deposit('2', {from: alice});
    await this.ifo.deposit('3', {from: carol});
    await this.ifo.deposit('1', {from: bob});
    await this.ifo.deposit('2', {from: alice});
    await this.ifo.deposit('3', {from: carol});
    assert.equal((await this.ifo.totalAmount()).toString(), '18');
    assert.equal((await this.ifo.getUserAllocation(carol)).toString(), '500000000000000000');
    assert.equal((await this.ifo.getUserAllocation(alice)).toString(), '333333333333333333');
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

    await time.advanceBlockTo('1170');
    assert.equal((await this.lp.balanceOf(carol)).toString(), '1');
    assert.equal((await this.ifoToken.balanceOf(carol)).toString(), '0');
    await this.ifo.harvest({from: carol});
    assert.equal((await this.lp.balanceOf(carol)).toString(), '1');
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
