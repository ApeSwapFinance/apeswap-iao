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

import './IAOUpgradeProxy.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

interface IIAOLinearVesting {
    function initialize(
      IERC20 _stakeToken,
      IERC20 _offeringToken,
      uint256 _startBlock,
      uint256 _endBlockOffset,
      uint256 _vestingBlockOffset, // Block offset between vesting distributions
      uint256 _offeringAmount,
      uint256 _raisingAmount,
      address _adminAddress
    ) external;   
}

/// @title IAOFactory
/// @notice Use to deploy IAO contracts on chain
contract IAOLinearVestingFactory is AccessControlEnumerable {

    IIAOLinearVesting[] public IAOLinearVestingImplementations;
    uint256 public IAOLinearVestingVersion;

    IIAOLinearVesting[] public deployedIAOContracts;
    address public proxyAdmin;

    bytes32 public constant DEPLOYER_ROLE = keccak256("DEPLOYER");

    event IAOLinearVestingCreated(IIAOLinearVesting indexed newIAO);
    event PushIAOLinearVestingVersion(IIAOLinearVesting indexed newIAO, uint256 newVersionId);
    event SetIAOLinearVestingVersion(uint256 previousVersionId, uint256 newVersionId);
    event UpdateProxyAdmin(address indexed previousProxyAdmin, address indexed newProxyAdmin);
    event SweepWithdraw(address indexed receiver, IERC20 indexed token, uint256 balance);


    /// @notice Constructor
    /// @param _admin: Admin to set creation roles. 
    /// @param _proxyAdmin: Admin of the proxy deployed for IAOs. This address has the power to upgrade the IAOLinearVesting Contract
    /// @param _implementation: Address of the implementation contract to use. 
    constructor(
        address _admin,
        address _proxyAdmin,
        IIAOLinearVesting _implementation
    ) {
        // Setup access control
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(DEPLOYER_ROLE, _admin);
        // Admin role can add new users to deployer role 
        _setRoleAdmin(DEPLOYER_ROLE, DEFAULT_ADMIN_ROLE);
        _pushImplementationContract(_implementation);

        proxyAdmin = _proxyAdmin;
    }

    /// @notice Deploy a new IAOLinearVesting contract based on the current implementation version
    function deployNewIAOLinearVesting(
        IERC20 _stakeToken,
        IERC20 _offeringToken,
        uint256 _startBlock,
        uint256 _endBlockOffset,
        uint256 _vestingBlockOffset, // Block offset between vesting distributions
        uint256 _offeringAmount,
        uint256 _raisingAmount,
        address _adminAddress
    ) public onlyRole(DEPLOYER_ROLE) returns (IIAOLinearVesting newIAO) {
        require(_adminAddress != proxyAdmin, 'admin and proxyAdmin cannot be the same address');

        IAOUpgradeProxy newProxy = new IAOUpgradeProxy(
            proxyAdmin,
            address(activeImplementationContract()),
            ""
        );
        newIAO = IIAOLinearVesting(address(newProxy));

        newIAO.initialize(
            _stakeToken,
            _offeringToken,
            _startBlock,
            _endBlockOffset,
            _vestingBlockOffset,
            _offeringAmount,
            _raisingAmount,
            _adminAddress
        );

        deployedIAOContracts.push(newIAO);
        emit IAOLinearVestingCreated(newIAO);
    }

    /// @notice Get total number of IAOLinearVesting contracts deployed through this factory
    function getNumberOfDeployedContracts() external view returns (uint256) {
        return deployedIAOContracts.length;
    }

    /// @notice Returns current active implementation address
    function activeImplementationContract() public view returns (IIAOLinearVesting) {
        return IAOLinearVestingImplementations[IAOLinearVestingVersion];
    }

    /// @notice Add and use new implementation
    /// @dev EXTCODESIZE returns 0 if it is called from the constructor of a contract 
    function pushImplementationContract(IIAOLinearVesting _newImplementation) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint32 size;
        assembly {
            size := extcodesize(_newImplementation)
        }
        require(size > 0, "Not a contract");
        _pushImplementationContract(_newImplementation);
    }

    /// @notice Add and use new implementation
    function _pushImplementationContract(IIAOLinearVesting _newImplementation) internal {
        IAOLinearVestingImplementations.push(_newImplementation);
        IAOLinearVestingVersion = IAOLinearVestingImplementations.length - 1;
        emit PushIAOLinearVestingVersion(_newImplementation, IAOLinearVestingVersion);
    }

    /// @notice Change active implementation
    function setImplementationContract(uint256 _index) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_index < IAOLinearVestingImplementations.length, "version out of bounds");
        emit SetIAOLinearVestingVersion(IAOLinearVestingVersion, _index);
        IAOLinearVestingVersion = _index;
    }

    /// @notice change the address of the proxy admin used when deploying new IAO contracts
    /// @dev The proxy admin must be different than the admin of the implementation as calls from proxyAdmin stop at the proxy contract
    function changeProxyAdmin(address _newProxyAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit UpdateProxyAdmin(proxyAdmin, _newProxyAdmin);
        proxyAdmin = _newProxyAdmin;
    }

    /// @notice A public function to sweep accidental ERC20 transfers to this contract. 
    /// @param _tokens Array of ERC20 addresses to sweep
    /// @param _to Address to send tokens to
    function sweepTokens(IERC20[] memory _tokens, address _to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 index = 0; index < _tokens.length; index++) {
            IERC20 token = _tokens[index];
            uint256 balance = token.balanceOf(address(this));
            token.transfer(_to, balance);
            emit SweepWithdraw(_to, token, balance);
        }
    }
}