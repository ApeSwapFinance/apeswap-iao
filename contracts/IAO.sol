// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/*
 * ApeSwapFinance
 * App:             https://apeswap.finance
 * Medium:          https://ape-swap.medium.com
 * Twitter:         https://twitter.com/ape_swap
 * Telegram:        https://t.me/ape_swap
 * Announcements:   https://t.me/ape_swap_news
 * GitHub:          https://github.com/ApeSwapFinance
 */

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

contract IAO is ReentrancyGuard, Initializable {
    using SafeERC20 for IERC20;

    uint256 constant public HARVEST_PERIODS = 4; 
    uint256[HARVEST_PERIODS] public harvestReleaseBlocks;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many tokens the user has provided.
        bool[HARVEST_PERIODS] claimed; // default false
        bool refunded;
    }

    // flag for admin induced failure
    bool public adminFailure = false;
    // flag for final admin withdraw
    bool public adminWithdraw = false;
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
    event Harvest(address indexed user, uint256 offeringAmount);
    event Refund(address indexed user, uint256 refundAmount);
    event AdminWithdraw(uint256 offeringAmount, uint256 raisingAmount);
    event AdminFailure();
    event SweepWithdraw(address indexed receiver, address indexed token, uint256 balance);


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

    function setOfferingAmount(uint256 _offerAmount) public onlyAdmin {
        require(block.number < startBlock, "cannot update during active iao");
        offeringAmount = _offerAmount;
    }

    function setRaisingAmount(uint256 _raisingAmount) public onlyAdmin {
        require(block.number < startBlock, "cannot update during active iao");
        raisingAmount = _raisingAmount;
    }

    /// @notice Deposits native EVM tokens into the IAO contract as per the value sent
    ///   in the transaction.
    function depositNative() external payable onlyActiveIAO {
        require(isNativeTokenStaking, 'stake token is not native EVM token');
        require(msg.value > 0, 'value not > 0');
        depositInternal(msg.value);
    }

    /// @dev Deposit ERC20 tokens with support for reflect tokens
    function deposit(uint256 _amount) external onlyActiveIAO {
        require(!isNativeTokenStaking, "stake token is native token, deposit through 'depositNative'");
        require(_amount > 0, "_amount not > 0");
        uint256 pre = getTotalStakeTokenBalance();
        stakeToken.safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        uint256 finalDepositAmount = getTotalStakeTokenBalance() - pre;
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
        require(
            // Only allow harvests after the harvest block
            (!adminFailure && block.number > harvestReleaseBlocks[harvestPeriod]) || 
            // If admin fails the IAO then the user can obtain a refund on the first period
            (adminFailure && harvestPeriod == 0), 
            "not harvest time"
        );
        require(userInfo[msg.sender].amount > 0, "have you participated?");
        require(!userInfo[msg.sender].claimed[harvestPeriod], "harvest for period already claimed");
        
        userInfo[msg.sender].claimed[harvestPeriod] = true;
        // Subtract user debt after refund on initial harvest
        if(harvestPeriod == 0) {
            totalDebt -= userInfo[msg.sender].amount;
        }
        
        // Refunds are only given on the first harvest
        uint256 refundingTokenAmount = getRefundingAmount(msg.sender);
        if (refundingTokenAmount > 0) {
            userInfo[msg.sender].refunded = true;
            uint256 refundAmount = safeTransferStakeInternal(msg.sender, refundingTokenAmount);
            emit Refund(msg.sender, refundAmount);
        }
    
        uint256 offeringTokenAmountPerPeriod = getOfferingAmountPerPeriod(msg.sender);
        if (offeringTokenAmountPerPeriod > 0) {
            offeringToken.safeTransfer(msg.sender, offeringTokenAmountPerPeriod);
        }
        emit Harvest(msg.sender, offeringTokenAmountPerPeriod);
    }

    function hasHarvested(address _user, uint256 harvestPeriod) external view returns (bool) {
        return userInfo[_user].claimed[harvestPeriod];
    }

    /// @notice Calculate a users allocation based on the total amount deposited. This is done
    ///  by first scaling the deposited amount and dividing by the total amount.
    /// @param _user Address of the user allocation to look up
    function getUserAllocation(address _user) public view returns (uint256) {
        // avoid division by zero
        if(totalAmount == 0) {
            return 0;
        }

        // allocation: 
        // 1e6 = 100%
        // 1e4 = 1%
        // 1 = 0.0001%
        return (userInfo[_user].amount * 1e12 / totalAmount) / 1e6;
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
    /// @dev User allocation is scaled up by an exponent which is scaled down before returning a value.
    /// @param _user Address of the user allocation to look up
    function getOfferingAmount(address _user) public view returns (uint256) {
        if(adminFailure) {
            // if the iao has been manually failed then no offering tokens are returned
            return 0;
        }

        if (totalAmount > raisingAmount) {
            return (offeringAmount * getUserAllocation(_user)) / 1e6;
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
    /// @dev User allocation is scaled up by the ALLOCATION_PRECISION which is scaled down before returning a value.
    /// @param _user Address of the user allocation to look up
    function getRefundingAmount(address _user) public view returns (uint256) {
        // Users are able to obtain their refund on the first harvest only
        if(userInfo[msg.sender].refunded == true) {
            return 0;
        }

        if(adminFailure) {
            // if the iao has been manually failed then all raising tokens are returned
            return userInfo[_user].amount;
        }

        if (totalAmount <= raisingAmount) {
            return 0;
        }

        // Adding 1 extra to account for rounding errors
        uint256 payAmount = (raisingAmount * getUserAllocation(_user)) / 1e6;
        return userInfo[_user].amount - payAmount;
    }

    /// @notice Get the amount of tokens a user is eligible to receive based on current state. 
    /// @param _user address of user to obtain token status 
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
        if(!adminFailure && currentBlock < endBlock) {
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
    
    /// @notice Call to change the IAO status to failed. 
    /// @dev Can only be called by admin
    function failIAO()
        external
        onlyAdmin
    {
        require(block.number < endBlock, "cannot fail after endBlock");
        adminFailure = true;
        emit AdminFailure();
    }

    function finalWithdraw()
        external
        onlyAdmin
    {
        require(adminFailure || block.number >= endBlock, "not withdraw time");
        require(!adminWithdraw, "admin has already withdrawn");
        adminWithdraw = true;

        if(adminFailure) {
            // On IAO failure all offering tokens should be returned
            uint256 offeringBalance = offeringToken.balanceOf(address(this));
            offeringToken.safeTransfer(msg.sender, offeringBalance);
            emit AdminWithdraw(offeringBalance, 0);
        } else {
            // handle undersubscription
            if (totalAmount < raisingAmount) { // handle undersubscription
                uint256 allocation = totalAmount * 1e6 / raisingAmount;
                uint256 offeringTokensLeft = offeringAmount - (offeringAmount * allocation / 1e6);
                // transfer offer token difference
                offeringToken.safeTransfer(msg.sender, offeringTokensLeft);
                // Transfer the stake amount that was raised
                safeTransferStakeInternal(msg.sender, totalAmount);
                emit AdminWithdraw(offeringTokensLeft, totalAmount);
            // handle oversubscription
            } else {
                // transfer raise amount
                uint256 allowedTransfer = safeTransferStakeInternal(msg.sender, raisingAmount);
                emit AdminWithdraw(0, allowedTransfer);
            }
        }
    }

    /// @notice Internal function to handle stake token transfers. Depending on the stake
    ///   token type, this can transfer ERC-20 tokens or native EVM tokens. 
    /// @param _to address to send stake token to 
    /// @param _amount value of reward token to transfer
    function safeTransferStakeInternal(address _to, uint256 _amount) internal returns (uint256 allowedTransfer){
        allowedTransfer = _amount;
        if(_amount > getTotalStakeTokenBalance()) {
            allowedTransfer = getTotalStakeTokenBalance();
        }

        if (isNativeTokenStaking) {
            // Transfer native token to address
            (bool success, ) = _to.call{gas: 23000, value: allowedTransfer}("");
            require(success, "TransferHelper: NATIVE_TRANSFER_FAILED");
        } else {
            // Transfer ERC20 to address
            IERC20(stakeToken).safeTransfer(_to, allowedTransfer);
        }
    }

    /// @notice Sweep accidental ERC20 transfers to this contract. Can only be called by admin.
    /// @param token The address of the ERC20 token to sweep
    function sweepToken(IERC20 token) external onlyAdmin {
        require(address(token) != address(stakeToken), "can not sweep stake token");
        require(address(token) != address(offeringToken), "can not sweep offering token");
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, balance);
        emit SweepWithdraw(msg.sender, address(token), balance);
    }
}
