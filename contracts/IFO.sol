pragma solidity 0.6.12;

/*
 * ApeSwapFinance
 * App:             https://apeswap.finance
 * Medium:          https://ape-swap.medium.com
 * Twitter:         https://twitter.com/ape_swap
 * Telegram:        https://t.me/ape_swap
 * Announcements:   https://t.me/ape_swap_news
 * GitHub:          https://github.com/ApeSwapFinance
 */

import "@pancakeswap/pancake-swap-lib/contracts/math/SafeMath.sol";
import "@pancakeswap/pancake-swap-lib/contracts/token/BEP20/IBEP20.sol";
import "@pancakeswap/pancake-swap-lib/contracts/token/BEP20/SafeBEP20.sol";
import "@pancakeswap/pancake-swap-lib/contracts/utils/ReentrancyGuard.sol";

contract IFO is ReentrancyGuard {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many tokens the user has provided.
        bool claimed; // default false
    }

    // admin address
    address public adminAddress;
    // The raising token
    IBEP20 public stakeToken;
    // Flag if stake token is BNB
    bool public isBNBStaking;
    // The offering token
    IBEP20 public offeringToken;
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

    event Deposit(address indexed user, uint256 amount);
    event Harvest(
        address indexed user,
        uint256 offeringAmount,
        uint256 excessAmount
    );

    constructor(
        IBEP20 _stakeToken,
        IBEP20 _offeringToken,
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _offeringAmount,
        uint256 _raisingAmount,
        address _adminAddress
    ) public {
        stakeToken = _stakeToken;
        /// @dev address(0) turns this contract into a BNB staking pool
        if(address(stakeToken) == address(0)) {
            isBNBStaking = true;
        }
        offeringToken = _offeringToken;
        startBlock = _startBlock;
        endBlock = _endBlock;
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
        require(msg.value > 0, 'need _amount > 0');
        depositInternal(msg.value);
    }

    /// @dev Deposit BEP20 tokens with support for reflect tokens
    function deposit(uint256 _amount) external onlyActiveIFO {
        require(_amount > 0, "need _amount > 0");
        uint256 pre = getTotalStakeTokenBalance();
        stakeToken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        if (userInfo[msg.sender].amount == 0) {
            addressList.push(address(msg.sender));
        }
        uint256 finalDepositAmount = getTotalStakeTokenBalance().sub(pre);
        depositInternal(finalDepositAmount);
    }

    /// @notice To support BEP20 and BNB deposits this function does not transfer
    ///  any tokens in, but only updates the state. Make sure to transfer in the funds
    ///  in a parent function
    function depositInternal(uint256 _amount) internal {
        userInfo[msg.sender].amount = userInfo[msg.sender].amount.add(
            _amount
        );
        totalAmount = totalAmount.add(_amount);
        totalDebt = totalDebt.add(_amount);
        emit Deposit(msg.sender, _amount);
    }

    function harvest() external nonReentrant {
        require(block.number > endBlock, "not harvest time");
        require(userInfo[msg.sender].amount > 0, "have you participated?");
        require(!userInfo[msg.sender].claimed, "nothing to harvest");
        uint256 offeringTokenAmount = getOfferingAmount(msg.sender);
        uint256 refundingTokenAmount = getRefundingAmount(msg.sender);
        offeringToken.safeTransfer(address(msg.sender), offeringTokenAmount);
        if (refundingTokenAmount > 0) {
            safeTransferStakeInternal(address(msg.sender), refundingTokenAmount);
        }
        userInfo[msg.sender].claimed = true;
        totalDebt = totalDebt.sub(userInfo[msg.sender].amount);
        emit Harvest(msg.sender, offeringTokenAmount, refundingTokenAmount);
    }

    function hasHarvest(address _user) external view returns (bool) {
        return userInfo[_user].claimed;
    }

    // allocation 100000 means 0.1(10%), 1 meanss 0.000001(0.0001%), 1000000 means 1(100%)
    function getUserAllocation(address _user) public view returns (uint256) {
        return userInfo[_user].amount.mul(1e12).div(totalAmount).div(1e6);
    }

    // allocation 100000 means 0.1(10%), 1 meanss 0.000001(0.0001%), 1000000 means 1(100%)
    function getTotalStakeTokenBalance() public view returns (uint256) {
        if(isBNBStaking) {
            return address(this).balance;
        } else {
            // Return BEP20 balance
            return stakeToken.balanceOf(address(this));
        }
    }

    // get the amount of IFO token you will get
    function getOfferingAmount(address _user) public view returns (uint256) {
        if (totalAmount > raisingAmount) {
            uint256 allocation = getUserAllocation(_user);
            return offeringAmount.mul(allocation).div(1e6);
        } else {
            // userInfo[_user] / (raisingAmount / offeringAmount)
            return
                userInfo[_user].amount.mul(offeringAmount).div(raisingAmount);
        }
    }

    // get the amount of lp token you will be refunded
    function getRefundingAmount(address _user) public view returns (uint256) {
        if (totalAmount <= raisingAmount) {
            return 0;
        }
        uint256 allocation = getUserAllocation(_user);
        uint256 payAmount = raisingAmount.mul(allocation).div(1e6);
        return userInfo[_user].amount.sub(payAmount);
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
            // Transfer BEP20 to address
            IBEP20(stakeToken).safeTransfer(_to, _amount);
        }
    }
}
