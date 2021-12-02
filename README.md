# Initial Ape Offering

[![Actions Status](https://github.com/ApeSwapFinance/apeswap-iao/workflows/CI/badge.svg)](https://github.com/ApeSwapFinance/apeswap-iao/actions)

This set of contracts is used to run Ape Swap's version of initial farm offerings. This set of offering contracts provides for vesting periods. These vesting periods divide the offering tokens into equal parts and allows for the release of each part after each harvest period ends. 

## Operation
- Each IAO raises a predefined `stakeToken` amount in exchange for a predefined `offeringToken` amount
- Once the `startBlock` arrives, users can supply as much of the raising token as they would like 
- Once the `endBlock` arrives, users can withdraw their first harvest and obtain a refund

### Linear Vesting
25% of tokens are released at the `endBlock` of this IAO and the other 75% are distributed linearly between the `endBlock` and `vestingEndBlock`. 

- `vestingEndBlock` is set to define when all of the offering tokens will be 100% unlocked. 
- A refund of `stakeTokens` when there is an oversubscription of the IAO will be given on the first harvest
- `offeringTokens` are sent to users based on the number of vesting blocks that have passed since the end of the IAO. 25% is released on the first harvest along with a refund for over-subscriptions 
### Period Based Vesting
- `harvestPeriods` set the block when new vesting tokens may be unlocked. After enough time elapses, a user will be able to withdraw the next harvest until there are no more  
- A refund of `stakeTokens` when there is an oversubscription of the IAO will be given on the first harvest of any period
- `offeringTokens` are sent to the users based on the percentage of their allocation divided by the number of harvest periods
  

# Development

The following assumes the use of `node@>=12`.

## Install Dependencies

`yarn`

## Compile Contracts

`yarn compile`

## Migrate Contracts
Create a file named `.env` in the root project directory and copy in the variables from `.env.example`. Provide variables for each relevant item.  

To deploy to BSC mainnet:   
`yarn migrate:bsc`    
  
To deploy to BSC Testnet:  
`yarn migrate:testnet`  
 
## Run Tests

`yarn test`
