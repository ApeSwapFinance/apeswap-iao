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
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

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
contract IAOLinearVestingFactory is AccessControlEnumerable, Initializable {

    IIAOLinearVesting[] public IAOLinearVestingImplementations;
    uint256 public IAOLinearVestingVersion;

    IIAOLinearVesting[] public deployedIAOContracts;
    address public iaoProxyAdmin;
    address public iaoAdmin;

    bytes32 public constant DEPLOYER_ROLE = keccak256("DEPLOYER");

    event IAOLinearVestingCreated(IIAOLinearVesting indexed newIAO);
    event PushIAOLinearVestingVersion(IIAOLinearVesting indexed newIAO, uint256 newVersionId);
    event SetIAOLinearVestingVersion(uint256 previousVersionId, uint256 newVersionId);
    event UpdateIAOAdmins(address previousIAOProxyAdmin, address indexed newIAOProxyAdmin, address indexed previousIAOAdmin, address indexed newIAOAdmin);
    event SweepWithdraw(address indexed receiver, IERC20 indexed token, uint256 balance);


    /// @notice Constructor
    /// @param _factoryAdmin: Admin to set creation roles. 
    /// @param _iaoProxyAdmin: Admin of the proxy deployed for IAOs. This address has the power to upgrade the IAOLinearVesting Contract
    /// @param _iaoAdmin: Admin of the IAOs. This address has the power to change IAO settings
    /// @param _implementation: Address of the implementation contract to use. 
    function initialize(
        address _factoryAdmin,
        address _iaoProxyAdmin,
        address _iaoAdmin,
        IIAOLinearVesting _implementation
    ) external initializer {
        require(_iaoProxyAdmin != _iaoAdmin, 'iaoProxyAdmin and iaoAdmin cannot be the same');
        // Setup access control
        _setupRole(DEFAULT_ADMIN_ROLE, _factoryAdmin);
        _setupRole(DEPLOYER_ROLE, _factoryAdmin);
        // Admin role can add new users to deployer role 
        _setRoleAdmin(DEPLOYER_ROLE, DEFAULT_ADMIN_ROLE);
        _pushImplementationContract(_implementation);

        iaoProxyAdmin = _iaoProxyAdmin;
        iaoAdmin = _iaoAdmin;
    }

    /// @notice Deploy a new IAOLinearVesting contract based on the current implementation version
    function deployNewIAOLinearVesting(
        IERC20 _stakeToken,
        IERC20 _offeringToken,
        uint256 _startBlock,
        uint256 _endBlockOffset,
        uint256 _vestingBlockOffset, // Block offset between vesting distributions
        uint256 _offeringAmount,
        uint256 _raisingAmount
    ) public onlyRole(DEPLOYER_ROLE) returns (IIAOLinearVesting newIAO) {
        IAOUpgradeProxy newProxy = new IAOUpgradeProxy(
            iaoProxyAdmin,
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
            iaoAdmin
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
    function setIAOAdmins(address _newIAOProxyAdmin, address _newIAOAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newIAOProxyAdmin != _newIAOAdmin, 'iaoProxyAdmin and iaoAdmin cannot be the same');
        emit UpdateIAOAdmins(iaoProxyAdmin, _newIAOProxyAdmin, iaoAdmin, _newIAOAdmin);
        iaoProxyAdmin = _newIAOProxyAdmin;
        iaoAdmin = _newIAOAdmin;
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