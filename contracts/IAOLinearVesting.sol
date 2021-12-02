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

contract IAOLinearVesting is ReentrancyGuard, Initializable {
    using SafeERC20 for IERC20;

    uint256 constant public INITIAL_RELEASE_PERCENTAGE = 2500;
    uint256 constant public PERCENTAGE_FACTOR = 10000;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many tokens the user has provided.
        uint256 vestedOfferingHarvested;
        uint256 offeringTokensClaimed;
        uint256 lastBlockHarvested;
        bool hasHarvestedInitial;
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
    // The block number when 100% of tokens have been released
    uint256 public vestingEndBlock;
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
        // Setup token variables
        stakeToken = _stakeToken;
        /// @dev address(0) turns this contract into a native token staking pool
        if(address(stakeToken) == address(0)) {
            isNativeTokenStaking = true;
        }
        offeringToken = _offeringToken;
        // Setup block variables
        startBlock = _startBlock;
        endBlock = _startBlock + _endBlockOffset;
        vestingEndBlock = endBlock + _vestingBlockOffset;
        // Setup amount variables
        offeringAmount = _offeringAmount;
        raisingAmount = _raisingAmount;
        totalAmount = 0;
        // Setup admin variable
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

    function harvest() external nonReentrant {
        require(block.number > endBlock, "not harvest time");
        require(userInfo[msg.sender].amount > 0, "have you participated?");
        require(userInfo[msg.sender].lastBlockHarvested < vestingEndBlock, "nothing left to harvest");
        require(userInfo[msg.sender].lastBlockHarvested < block.number, "cannot harvest in the same block");
        
        (
            uint256 stakeTokenHarvest, 
            uint256 offeringTokenTotalHarvest,,,
        ) = userTokenStatus(msg.sender);

        userInfo[msg.sender].lastBlockHarvested = block.number;
        // Flag initial harvest
        if(!userInfo[msg.sender].hasHarvestedInitial) {
            userInfo[msg.sender].hasHarvestedInitial = true;
        }
        // Settle refund
        if(!userInfo[msg.sender].refunded) {
            if (stakeTokenHarvest > 0) {
                safeTransferStakeInternal(msg.sender, stakeTokenHarvest);
            }
            userInfo[msg.sender].refunded = true;
        }
        uint256 offeringAllocationLeft = getOfferingAmount(msg.sender) - userInfo[msg.sender].offeringTokensClaimed;
        uint256 allocatedTokens = offeringAllocationLeft >= offeringTokenTotalHarvest ? offeringTokenTotalHarvest : offeringAllocationLeft;
        if(allocatedTokens > 0) {
            userInfo[msg.sender].offeringTokensClaimed += allocatedTokens;
            // Transfer harvestable tokens
            offeringToken.safeTransfer(msg.sender, allocatedTokens);
        }

        emit Harvest(msg.sender, offeringTokenTotalHarvest, stakeTokenHarvest);
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
    /// @dev User allocation is scaled up by the ALLOCATION_PRECISION which is scaled down before returning a value.
    /// @param _user Address of the user allocation to look up
    function getOfferingAmount(address _user) public view returns (uint256) {
        if (totalAmount > raisingAmount) {
            return (offeringAmount * getUserAllocation(_user)) / 1e12;
        } else {
            // Return an offering amount equal to a proportion of the raising amount
            return (userInfo[_user].amount * offeringAmount) / raisingAmount;
        }
    }

    // get the amount of IAO token you will get per harvest period
    function getOfferingAmountAllocations(address _user) 
        public 
        view 
        returns (
            uint256 offeringInitialHarvestAmount, 
            uint256 offeringTokenVestedAmount
        ) 
    {
        uint256 userTotalOfferingAmount = getOfferingAmount(_user);

        offeringInitialHarvestAmount = userTotalOfferingAmount * INITIAL_RELEASE_PERCENTAGE / PERCENTAGE_FACTOR;
        offeringTokenVestedAmount = userTotalOfferingAmount - offeringInitialHarvestAmount;
    }

    /// @notice Calculate a user's refunding amount to be received by multiplying the raising amount by
    ///  the user allocation percentage.
    /// @dev User allocation is scaled up by the ALLOCATION_PRECISION which is scaled down before returning a value.
    /// @param _user Address of the user allocation to look up
    function getRefundingAmount(address _user) public view returns (uint256) {
        // Users are able to obtain their refund on the first harvest only
        if (totalAmount <= raisingAmount) {
            return 0;
        }
        uint256 payAmount = (raisingAmount * getUserAllocation(_user)) / 1e12;
        return userInfo[_user].amount - payAmount;
    }

    // TODO: Return the stakeTokenHarvest, offeringTokenHarvest, offeringTokensVested,
    // TODO: natspec for return vars
    /// @notice Get the amount of tokens a user is eligible to receive based on current state. 
    /// @param _user address of user to obtain token status 
    function userTokenStatus(address _user) 
        public 
        view 
        returns (
            uint256 stakeTokenHarvest, 
            uint256 offeringTokenTotalHarvest, 
            uint256 offeringTokenInitialHarvest,
            uint256 offeringTokenVestedHarvest, 
            uint256 offeringTokensVested
        ) 
    {
        uint256 currentBlock = block.number;
        if(currentBlock < endBlock) {
            return (0,0,0,0,0); 
        }
        // Setup refund amount
        stakeTokenHarvest = 0;
        if(!userInfo[_user].refunded) {
            stakeTokenHarvest = getRefundingAmount(_user);
        }

        (uint256 offeringInitialHarvestAmount , uint256 offeringTokenVestedAmount) = getOfferingAmountAllocations(_user);
        // Setup initial harvest amount
        offeringTokenInitialHarvest = 0;
        if(!userInfo[_user].hasHarvestedInitial) {
            offeringTokenInitialHarvest = offeringInitialHarvestAmount;
        }
        // Setup harvestable vested token amount
        uint256 totalVestingBlocks = vestingEndBlock - endBlock;
        // Use the lower value of block.number or vestingEndBlock
        uint256 unlockEndBlock = block.number < vestingEndBlock ? block.number : vestingEndBlock;
        // endBlock is the earliest harvest block
        uint256 lastHarvestBlock = userInfo[_user].lastBlockHarvested < endBlock ? endBlock : userInfo[_user].lastBlockHarvested;
        offeringTokenVestedHarvest = 0;
        if(unlockEndBlock > lastHarvestBlock ) {
            uint256 unlockBlocks = unlockEndBlock - lastHarvestBlock;
            offeringTokenVestedHarvest = (offeringTokenVestedAmount * unlockBlocks) / totalVestingBlocks;
        }
        
        offeringTokenTotalHarvest = offeringTokenInitialHarvest + offeringTokenVestedHarvest;

        offeringTokensVested = 0;
        if(block.number < vestingEndBlock) {
            uint256 vestingBlocksLeft = vestingEndBlock - block.number;
            offeringTokensVested = offeringTokenVestedAmount * vestingBlocksLeft / totalVestingBlocks;
        }
    }

    function getAddressListLength() external view returns (uint256) {
        return addressList.length;
    }

    function finalWithdraw(uint256 _stakeTokenAmount, uint256 _offerAmount)
        external
        onlyAdmin
    {
        require(
            _offerAmount <= offeringToken.balanceOf(address(this)),
            "not enough offering token"
        );
        safeTransferStakeInternal(msg.sender, _stakeTokenAmount);
        offeringToken.safeTransfer(msg.sender, _offerAmount);
    }

    /// @notice Internal function to handle stake token transfers. Depending on the stake
    ///   token type, this can transfer ERC-20 tokens or native EVM tokens. 
    /// @param _to address to send stake token to 
    /// @param _amount value of reward token to transfer
    function safeTransferStakeInternal(address _to, uint256 _amount) internal {
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
            IERC20(stakeToken).safeTransfer(_to, _amount);
        }
    }

    /// @notice Sweep accidental ERC20 transfers to this contract. Can only be called by admin.
    /// @param _token The address of the ERC20 token to sweep
    function sweepToken(IERC20 _token) external onlyAdmin {
        require(address(_token) != address(stakeToken), "can not sweep stake token");
        require(address(_token) != address(offeringToken), "can not sweep offering token");
        uint256 balance = _token.balanceOf(address(this));
        _token.safeTransfer(msg.sender, balance);
        emit EmergencySweepWithdraw(msg.sender, address(_token), balance);
    }
}
