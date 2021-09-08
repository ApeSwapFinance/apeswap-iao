# Initial Ape Offering

[![Actions Status](https://github.com/ApeSwapFinance/apeswap-iao/workflows/CI/badge.svg)](https://github.com/ApeSwapFinance/apeswap-iao/actions)

This set of contracts is used to run Ape Swap's version of initial farm offerings. This set of offering contracts provides for vesting periods. These vesting periods divide the offering tokens into equal parts and allows for the release of each part after each harvest period ends. 

## Operation
- Each IAO raises a predefined `stakeToken` amount in exchange for a predefined `offeringToken` amount
- Once the `startBlock` arrives, users can supply as much of the raising token as they would like 
- Once the `endBlock` arrives, users can withdraw their first harvest period and obtain a refund
- `offeringTokens` are sent to the users based on the percentage of their allocation divided by the number of harvest periods
- `harvestPeriods` set the block when new vesting tokens may be unlocked. After enough time elapses, a user will be able to withdraw the next harvest until there are no more  
- A refund of `stakeTokens` when there is an oversubscription of the IAO will be given on the first harvest of any period

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
