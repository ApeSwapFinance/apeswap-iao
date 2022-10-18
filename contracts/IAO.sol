// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/*
  ______                     ______                                 
 /      \                   /      \                                
|  ▓▓▓▓▓▓\ ______   ______ |  ▓▓▓▓▓▓\__   __   __  ______   ______  
| ▓▓__| ▓▓/      \ /      \| ▓▓___\▓▓  \ |  \ |  \|      \ /      \ 
| ▓▓    ▓▓  ▓▓▓▓▓▓\  ▓▓▓▓▓▓\\▓▓    \| ▓▓ | ▓▓ | ▓▓ \▓▓▓▓▓▓\  ▓▓▓▓▓▓\
| ▓▓▓▓▓▓▓▓ ▓▓  | ▓▓ ▓▓    ▓▓_\▓▓▓▓▓▓\ ▓▓ | ▓▓ | ▓▓/      ▓▓ ▓▓  | ▓▓
| ▓▓  | ▓▓ ▓▓__/ ▓▓ ▓▓▓▓▓▓▓▓  \__| ▓▓ ▓▓_/ ▓▓_/ ▓▓  ▓▓▓▓▓▓▓ ▓▓__/ ▓▓
| ▓▓  | ▓▓ ▓▓    ▓▓\▓▓     \\▓▓    ▓▓\▓▓   ▓▓   ▓▓\▓▓    ▓▓ ▓▓    ▓▓
 \▓▓   \▓▓ ▓▓▓▓▓▓▓  \▓▓▓▓▓▓▓ \▓▓▓▓▓▓  \▓▓▓▓▓\▓▓▓▓  \▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓ 
         | ▓▓                                             | ▓▓      
         | ▓▓                                             | ▓▓      
          \▓▓                                              \▓▓         

 * App:             https://apeswap.finance
 * Medium:          https://ape-swap.medium.com
 * Twitter:         https://twitter.com/ape_swap
 * Discord:         https://discord.com/invite/apeswap
 * Telegram:        https://t.me/ape_swap
 * Announcements:   https://t.me/ape_swap_news
 * GitHub:          https://github.com/ApeSwapFinance
 */

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';

/// @title Harvest Period based Initial Ape Offering
/// @notice safeTransferStakeInternal uses a fixed gas limit for native transfers which should be evaluated when deploying to new networks.
contract IAO is ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    uint256 constant public HARVEST_PERIODS = 4; 
    uint256[HARVEST_PERIODS] public harvestReleaseBlocks;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many tokens the user has provided.
        bool[HARVEST_PERIODS] claimed; // default false
        bool refunded;
    }

    // admin address
    address public adminAddress;
    // The raising token
    IERC20 public stakeToken;
    // Flag if stake token is native EVM token
    bool public isNativeTokenStaking;
    // The offering token
    IERC20 public offeringToken;
    // The block number when IAO starts
    uint256 public startBlock;
    // The block number when IAO ends
    uint256 public endBlock;
    // total amount of raising tokens need to be raised
    uint256 public raisingAmount;
    // total amount of offeringToken that will offer
    uint256 public offeringAmount;
    // total amount of raising tokens that have already raised
    uint256 public totalAmount;
    // total amount of tokens to give back to users
    uint256 public totalDebt;
    // address => amount
    mapping(address => UserInfo) public userInfo;
    // participators
    address[] public addressList;
    

    event Deposit(address indexed user, uint256 amount);
    event Harvest(
        address indexed user,
        uint256 offeringAmount,
        uint256 excessAmount
    );
    event UpdateOfferingAmount(uint256 previousOfferingAmount, uint256 newOfferingAmount);
    event UpdateRaisingAmount(uint256 previousRaisingAmount, uint256 newRaisingAmount);
    event AdminFinalWithdraw(uint256 stakeTokenAmount, uint256 offerAmount);
    event EmergencySweepWithdraw(address indexed receiver, address indexed token, uint256 balance);


    function initialize(
      IERC20 _stakeToken,
      IERC20 _offeringToken,
      uint256 _startBlock,
      uint256 _endBlockOffset,
      uint256 _vestingBlockOffset, // Block offset between vesting distributions
      uint256 _offeringAmount,
      uint256 _raisingAmount,
      address _adminAddress
    ) external initializer {
        stakeToken = _stakeToken;
        /// @dev address(0) turns this contract into a native token staking pool
        if(address(stakeToken) == address(0)) {
            isNativeTokenStaking = true;
        }
        offeringToken = _offeringToken;
        startBlock = _startBlock;
        endBlock = _startBlock + _endBlockOffset;
        // Setup vesting release blocks
        for (uint256 i = 0; i < HARVEST_PERIODS; i++) {
            harvestReleaseBlocks[i] = endBlock + (_vestingBlockOffset * i);
        }

        offeringAmount = _offeringAmount;
        raisingAmount = _raisingAmount;
        totalAmount = 0;
        adminAddress = _adminAddress;
        __ReentrancyGuard_init();
    }

    modifier onlyAdmin() {
        require(msg.sender == adminAddress, "caller is not admin");
        _;
    }

    modifier onlyActiveIAO() {
        require(
            block.number >= startBlock && block.number < endBlock,
            "not iao time"
        );
        _;
    }

    function setOfferingAmount(uint256 _offerAmount) external onlyAdmin {
        require(block.number < startBlock, "cannot update during active iao");
        emit UpdateOfferingAmount(offeringAmount, _offerAmount);
        offeringAmount = _offerAmount;
    }

    function setRaisingAmount(uint256 _raisingAmount) external onlyAdmin {
        require(block.number < startBlock, "cannot update during active iao");
        emit UpdateRaisingAmount(raisingAmount, _raisingAmount);
        raisingAmount = _raisingAmount;
    }

    /// @notice Deposits native EVM tokens into the IAO contract as per the value sent
    ///   in the transaction.
    function depositNative() external payable onlyActiveIAO nonReentrant {
        require(isNativeTokenStaking, 'stake token is not native EVM token');
        require(msg.value > 0, 'value not > 0');
        depositInternal(msg.value);
    }

    /// @dev Deposit ERC20 tokens with support for reflect tokens
    function deposit(uint256 _amount) external onlyActiveIAO nonReentrant {
        require(!isNativeTokenStaking, "stake token is native token, deposit through 'depositNative'");
        require(_amount > 0, "_amount not > 0");
        uint256 pre = getTotalStakeTokenBalance();
        stakeToken.safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        uint256 finalDepositAmount = getTotalStakeTokenBalance() - pre;
        require(finalDepositAmount > 0, 'final deposit amount is zero');
        depositInternal(finalDepositAmount);
    }

    /// @notice To support ERC20 and native token deposits this function does not transfer
    ///  any tokens in, but only updates the state. Make sure to transfer in the funds
    ///  in a parent function
    function depositInternal(uint256 _amount) internal {
        if (userInfo[msg.sender].amount == 0) {
            addressList.push(msg.sender);
        }
        userInfo[msg.sender].amount += _amount;
        totalAmount += _amount;
        totalDebt += _amount;
        emit Deposit(msg.sender, _amount);
    }

    function harvest(uint256 harvestPeriod) external nonReentrant {
        require(harvestPeriod < HARVEST_PERIODS, "harvest period out of range");
        require(block.number > harvestReleaseBlocks[harvestPeriod], "not harvest time");
        require(userInfo[msg.sender].amount > 0, "have you participated?");
        require(!userInfo[msg.sender].claimed[harvestPeriod], "harvest for period already claimed");
        // Refunds are only given on the first harvest
        uint256 refundingTokenAmount = getRefundingAmount(msg.sender);
        if (refundingTokenAmount > 0) {
            userInfo[msg.sender].refunded = true;
            safeTransferStakeInternal(msg.sender, refundingTokenAmount);
        }
    
        userInfo[msg.sender].claimed[harvestPeriod] = true;
        // Subtract user debt after refund on initial harvest
        if(harvestPeriod == 0) {
            totalDebt -= userInfo[msg.sender].amount;
        }

        uint256 offeringTokenAmountPerPeriod = getOfferingAmountPerPeriod(msg.sender);
        offeringToken.safeTransfer(msg.sender, offeringTokenAmountPerPeriod);

        emit Harvest(msg.sender, offeringTokenAmountPerPeriod, refundingTokenAmount);
    }

    function hasHarvested(address _user, uint256 harvestPeriod) external view returns (bool) {
        return userInfo[_user].claimed[harvestPeriod];
    }

    /// @notice Calculate a users allocation based on the total amount deposited. This is done
    ///  by first scaling the deposited amount and dividing by the total amount.
    /// @param _user Address of the user allocation to look up
    /// @notice This function has been deprecated, but leaving in the contract for backwards compatibility.
    function getUserAllocation(address _user) external view returns (uint256) {
        // avoid division by zero
        if(totalAmount == 0) {
            return 0;
        }

        // allocation: 
        // 1e12 = 100%
        // 1e10 = 1%
        // 1e8 = 0.01%
        return (userInfo[_user].amount * 1e12 / totalAmount);
    }

    function getTotalStakeTokenBalance() public view returns (uint256) {
        if(isNativeTokenStaking) {
            return address(this).balance;
        } else {
            // Return ERC20 balance
            return stakeToken.balanceOf(address(this));
        }
    }

    /// @notice Calculate a user's offering amount to be received by multiplying the offering amount by
    ///  the user allocation percentage.
    /// @param _user Address of the user allocation to look up
    function getOfferingAmount(address _user) public view returns (uint256) {
        if (totalAmount > raisingAmount) {
            return (userInfo[_user].amount * offeringAmount) / totalAmount;
        } else {
            // Return an offering amount equal to a proportion of the raising amount
            return (userInfo[_user].amount * offeringAmount) / raisingAmount;
        }
    }

    // get the amount of IAO token you will get per harvest period
    function getOfferingAmountPerPeriod(address _user) public view returns (uint256) {
        return getOfferingAmount(_user) / HARVEST_PERIODS;
    }

    /// @notice Calculate a user's refunding amount to be received by multiplying the raising amount by
    ///  the user allocation percentage.
    /// @param _user Address of the user allocation to look up
    function getRefundingAmount(address _user) public view returns (uint256) {
        // Users are able to obtain their refund on the first harvest only
        if (totalAmount <= raisingAmount || userInfo[_user].refunded == true) {
            return 0;
        }
        uint256 userAmount = userInfo[_user].amount;
        uint256 payAmount = (userAmount * raisingAmount) / totalAmount;
        return userAmount - payAmount;
    }

    /// @notice Get the amount of tokens a user is eligible to receive based on current state. 
    /// @param _user address of user to obtain token status 
    /// @notice offeringTokensVested should be named offeringTokensVesting. Leaving for backward compatibility
    function userTokenStatus(address _user) 
        public 
        view 
        returns (
            uint256 stakeTokenHarvest, 
            uint256 offeringTokenHarvest, 
            uint256 offeringTokensVested
        ) 
    {
        uint256 currentBlock = block.number;
        if(currentBlock < endBlock) {
            return (0,0,0); 
        }

        stakeTokenHarvest = getRefundingAmount(_user);
        uint256 userOfferingPerPeriod = getOfferingAmountPerPeriod(_user);

        for (uint256 i = 0; i < HARVEST_PERIODS; i++) {
            if(currentBlock >= harvestReleaseBlocks[i] && !userInfo[_user].claimed[i]) {
                // If offering tokens are available for harvest AND user has not claimed yet
                offeringTokenHarvest += userOfferingPerPeriod;
            } else if (currentBlock < harvestReleaseBlocks[i]) {
                // If harvest period is in the future
                offeringTokensVested += userOfferingPerPeriod;
            }
        }

        return (stakeTokenHarvest, offeringTokenHarvest, offeringTokensVested);
    }

    function getAddressListLength() external view returns (uint256) {
        return addressList.length;
    }

    function finalWithdraw(uint256 _stakeTokenAmount, uint256 _offerAmount)
        external
        onlyAdmin
    {
        safeTransferStakeInternal(msg.sender, _stakeTokenAmount);
        if(_offerAmount > 0) {
            require(
                _offerAmount <= offeringToken.balanceOf(address(this)),
                "not enough offering token"
            );
            offeringToken.safeTransfer(msg.sender, _offerAmount);
        }
        emit AdminFinalWithdraw(_stakeTokenAmount, _offerAmount);
    }

    /// @notice Internal function to handle stake token transfers. Depending on the stake
    ///   token type, this can transfer ERC-20 tokens or native EVM tokens. 
    /// @param _to address to send stake token to 
    /// @param _amount value of reward token to transfer
    function safeTransferStakeInternal(address _to, uint256 _amount) internal {
        if(_amount == 0) { return; }
        require(
            _amount <= getTotalStakeTokenBalance(),
            "not enough stake token"
        );

        if (isNativeTokenStaking) {
            // Transfer native token to address
            (bool success, ) = _to.call{gas: 23000, value: _amount}("");
            require(success, "TransferHelper: NATIVE_TRANSFER_FAILED");
        } else {
            // Transfer ERC20 to address
            stakeToken.safeTransfer(_to, _amount);
        }
    }

    /// @notice Sweep accidental ERC20 transfers to this contract. Can only be called by admin.
    /// @param token The address of the ERC20 token to sweep
    function sweepToken(IERC20 token) external onlyAdmin {
        require(address(token) != address(stakeToken), "can not sweep stake token");
        require(address(token) != address(offeringToken), "can not sweep offering token");
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, balance);
        emit EmergencySweepWithdraw(msg.sender, address(token), balance);
    }
}
