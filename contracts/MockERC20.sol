// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MockERC20 is ERC20 {
    uint256 constant public MINT_AMOUNT = 10000 * 1e18;

    constructor(
        string memory name,
        string memory symbol,
        uint256 supply
    ) ERC20(name, symbol) {
        _mint(msg.sender, supply);
    }

    function mint() external {
        _mint(msg.sender, MINT_AMOUNT);
    }
}