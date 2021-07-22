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
    }

    // admin address
    address public adminAddress;
    // The raising token
    IERC20 public stakeToken;
    // Flag if stake token is BNB
    bool public isBNBStaking;
    // The offering token
    IERC20 public offeringToken;
    // The block number when IFO starts
    uint256 public startBlock;
    // The block number when IFO ends
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
    // FIXME: Using this allocation resulted in an error last time. Need to dive deeper
    // allocation precision 
    uint256 private ALLOCATION_PRECISION = 1e18; // Try using 1e8? 

    event Deposit(address indexed user, uint256 amount);
    event Harvest(
        address indexed user,
        uint256 offeringAmount,
        uint256 excessAmount
    );
    event EmergencySweepWithdraw(address indexed receiver, address indexed token, uint256 balance);


    // https://docs.soliditylang.org/en/v0.8.6/introduction-to-smart-contracts.html#storage-memory-and-the-stack
    // Functions can take up to 16 arguments
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
        /// @dev address(0) turns this contract into a BNB staking pool
        if(address(stakeToken) == address(0)) {
            isBNBStaking = true;
        }
        offeringToken = _offeringToken;
        startBlock = _startBlock;
        endBlock = _startBlock + _endBlockOffset;
        // Setup vesting release blocks
        for (uint256 i = 0; i < HARVEST_PERIODS; i++) {
            // https://blog.soliditylang.org/2020/12/16/solidity-v0.8.0-release-announcement/
            harvestReleaseBlocks[i] = endBlock + (_vestingBlockOffset * i);
        }


        offeringAmount = _offeringAmount;
        raisingAmount = _raisingAmount;
        totalAmount = 0;
        adminAddress = _adminAddress;
    }

    modifier onlyAdmin() {
        require(msg.sender == adminAddress, "admin: wut?");
        _;
    }

    modifier onlyActiveIFO() {
        require(
            block.number > startBlock && block.number < endBlock,
            "not ifo time"
        );
        _;
    }

    function setOfferingAmount(uint256 _offerAmount) public onlyAdmin {
        require(block.number < startBlock, "no");
        offeringAmount = _offerAmount;
    }

    function setRaisingAmount(uint256 _raisingAmount) public onlyAdmin {
        require(block.number < startBlock, "no");
        raisingAmount = _raisingAmount;
    }

    function depositBNB() external payable onlyActiveIFO {
        require(isBNBStaking, 'stake token is not BNB');
        require(msg.value > 0, 'need _amount > 0');
        depositInternal(msg.value);
    }

    /// @dev Deposit ERC20 tokens with support for reflect tokens
    function deposit(uint256 _amount) external onlyActiveIFO {
        require(!isBNBStaking, "stake token is BNB, deposit through 'depositBNB'");
        require(_amount > 0, "need _amount > 0");
        uint256 pre = getTotalStakeTokenBalance();
        stakeToken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        uint256 finalDepositAmount = getTotalStakeTokenBalance() - pre;
        depositInternal(finalDepositAmount);
    }

    /// @notice To support ERC20 and BNB deposits this function does not transfer
    ///  any tokens in, but only updates the state. Make sure to transfer in the funds
    ///  in a parent function
    function depositInternal(uint256 _amount) internal {
        if (userInfo[msg.sender].amount == 0) {
            addressList.push(address(msg.sender));
        }
        userInfo[msg.sender].amount = userInfo[msg.sender].amount + _amount;
        totalAmount = totalAmount + _amount;
        totalDebt = totalDebt + _amount;
        emit Deposit(msg.sender, _amount);
    }

    function harvest(uint256 harvestPeriod) external nonReentrant {
        require(harvestPeriod < HARVEST_PERIODS, "harvest period out of range");
        // TODO: we should be able to remove the line below in favor of the line two lines below
        require(block.number > endBlock, "not harvest time");
        require(block.number > harvestReleaseBlocks[harvestPeriod], "not harvest time");
        require(userInfo[msg.sender].amount > 0, "have you participated?");
        require(!userInfo[msg.sender].claimed[harvestPeriod], "nothing to harvest");
        // Refunds are only given on the first harvest
        uint256 refundingTokenAmount = getRefundingAmount(msg.sender);
        if (refundingTokenAmount > 0) {
            safeTransferStakeInternal(address(msg.sender), refundingTokenAmount);
        }
    
        uint256 offeringTokenAmountPerPeriod = getOfferingAmountPerPeriod(msg.sender);
        offeringToken.safeTransfer(address(msg.sender), offeringTokenAmountPerPeriod);

        userInfo[msg.sender].claimed[harvestPeriod] = true;
        // Subtract user debt after refund on initial harvest
        if(harvestPeriod == 0) {
            totalDebt = totalDebt + userInfo[msg.sender].amount;
        }
        emit Harvest(msg.sender, offeringTokenAmountPerPeriod, refundingTokenAmount);
    }

    function hasHarvest(address _user, uint256 harvestPeriod) external view returns (bool) {
        return userInfo[_user].claimed[harvestPeriod];
    }

    /**
     * allocation: 
     * 1e17 = 0.1 (10%)
     * 1e18 = 1 (100%)
     * 1 = 0.000000 000000 000001 (0.000000 000000 0001%)
     */ 
    function getUserAllocation(address _user) public view returns (uint256) {
        return userInfo[_user].amount * ALLOCATION_PRECISION / totalAmount;
    }

    function getTotalStakeTokenBalance() public view returns (uint256) {
        if(isBNBStaking) {
            return address(this).balance;
        } else {
            // Return ERC20 balance
            return stakeToken.balanceOf(address(this));
        }
    }

    // get the amount of IFO token you will get
    function getOfferingAmount(address _user) public view returns (uint256) {
        if (totalAmount > raisingAmount) {
            uint256 allocation = getUserAllocation(_user);
            return (offeringAmount * allocation) / ALLOCATION_PRECISION;
        } else {
            // userInfo[_user] / (raisingAmount / offeringAmount)
            // TODO: Double check this math
            return (userInfo[_user].amount * offeringAmount) / raisingAmount;
        }
    }

    // get the amount of IFO token you will get per harvest period
    function getOfferingAmountPerPeriod(address _user) public view returns (uint256) {
        return getOfferingAmount(_user) / HARVEST_PERIODS;
    }

    // get the amount of lp token you will be refunded
    function getRefundingAmount(address _user) public view returns (uint256) {
        // Users are able to obtain their refund on the first harvest only
        if (totalAmount <= raisingAmount || userInfo[msg.sender].claimed[0] == true) {
            return 0;
        }
        uint256 allocation = getUserAllocation(_user);
        uint256 payAmount = (raisingAmount * allocation) / ALLOCATION_PRECISION;
        return userInfo[_user].amount - payAmount;
    }

    // get the amount of IFO token you will get per harvest period
    function tokensAvailableForHarvest(address _user) public view returns (uint256 stakeTokenHarvest, uint256 offeringTokenHarvest) {
        uint256 currentBlock = block.number;
        stakeTokenHarvest = 0;
        offeringTokenHarvest = 0;
        if(currentBlock < endBlock) {
            return (0,0);
        }
        stakeTokenHarvest = getRefundingAmount(_user);

        for (uint256 i = HARVEST_PERIODS - 1; i >= 0; i--) {
            if(currentBlock > harvestReleaseBlocks[i]) {
                offeringTokenHarvest += getOfferingAmountPerPeriod(_user);
            }
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
            "not enough reward token"
        );
        safeTransferStakeInternal(address(msg.sender), _stakeTokenAmount);
        offeringToken.safeTransfer(address(msg.sender), _offerAmount);
    }

    /// @param _to address to send stake token to 
    /// @param _amount value of reward token to transfer
    function safeTransferStakeInternal(address _to, uint256 _amount) internal {
        uint256 stakeBalance = getTotalStakeTokenBalance();
        require(
            _amount <= stakeBalance,
            "not enough stakeToken"
        );

        if (isBNBStaking) {
            // Transfer BNB to address
            (bool success, ) = _to.call{gas: 23000, value: _amount}("");
            require(success, "TransferHelper: BNB_TRANSFER_FAILED");
        } else {
            // Transfer ERC20 to address
            IERC20(stakeToken).safeTransfer(_to, _amount);
        }
    }

    /// @notice A public function to sweep accidental ERC20 transfers to this contract. 
    ///   Tokens are sent to owner
    /// @param token The address of the ERC20 token to sweep
    function sweepToken(IERC20 token) external onlyAdmin {
        require(address(token) != address(stakeToken), "can not sweep stake token");
        require(address(token) != address(offeringToken), "can not sweep offering token");
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, balance);
        emit EmergencySweepWithdraw(msg.sender, address(token), balance);
    }
}