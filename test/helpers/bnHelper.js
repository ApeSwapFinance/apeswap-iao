const { BN } = require('@openzeppelin/test-helpers');

function addBNStr(bnStrA, bnStrB) {
  return (new BN(bnStrA).add(new BN(bnStrB))).toString();
}

function subBNStr(bnStrA, bnStrB) {
  return (new BN(bnStrA).sub(new BN(bnStrB))).toString();
}

function mulBNStr(bnStrA, bnStrB) {
  return (new BN(bnStrA).mul(new BN(bnStrB))).toString();
}

function divBNStr(bnStrA, bnStrB) {
  return (new BN(bnStrA).div(new BN(bnStrB))).toString();
}

/**
 * Pass an BN object returned from a smart contract and convert all BN values to strings to easily read them.
 * 
 * @param {*} bigNumberObject 
 * @returns 
 */
function formatBNObjectToString(bigNumberObject) {
  let formattedObj = {}

  for (let [key, value] of Object.entries(bigNumberObject)) {
    if (typeof value == 'boolean') {
      formattedObj[key] = value;
    } else {
      formattedObj[key] = value.toString();
    }
  }
  return formattedObj;
}

/**
 * Check that a BN/BN String is within a percentage tolerance of another big number
 * 
 * @param {*} bnToCheck Value to check
 * @param {*} bnExpected Expected value
 * @param {*} tolerancePercentage Percentage to add/subtract from expected value to check tolerance
 * @returns boolean
 */
function isWithinLimit(bnToCheck, bnExpected, tolerancePercentage = 2) {
  bnToCheck = new BN(bnToCheck)
  bnExpected = new BN(bnExpected)
  const tolerance = bnExpected.mul(new BN(tolerancePercentage)).div(new BN(100));
  let withinTolerance = true;
  if (bnToCheck.gte(bnExpected.add(tolerance))) {
    console.error(`bnHelper::isWithinLimit - ${bnToCheck.toString()} gte upper tolerance limit of ${tolerancePercentage}% to a value of ${(bnExpected.add(tolerance)).toString()}`);
    withinTolerance = false;
  }

  if (bnToCheck.lte(bnExpected.sub(tolerance))) {
    console.error(`bnHelper::isWithinLimit - ${bnToCheck.toString()} lte lower tolerance limit of ${tolerancePercentage}% to a value of ${(bnExpected.sub(tolerance)).toString()}`);
    withinTolerance = false;
  }

  return withinTolerance;
}

/**
 * Check that a BN/BN String is within a percentage tolerance of another big number
 * 
 * @param {*} bnToCheck Value to check
 * @param {*} bnExpected Expected value
 * @param {*} tolerancePercentage Percentage to add/subtract from expected value to check tolerance
 * @returns boolean
 */
function isWithinWeiLimit(bnToCheck, bnExpected, tolerance = new BN(0)) {
  bnToCheck = new BN(bnToCheck)
  bnExpected = new BN(bnExpected)
  let withinTolerance = true;
  if (bnToCheck.gte(bnExpected.add(tolerance))) {
    console.error(`bnHelper::isWithinWeiLimit - ${bnToCheck.toString()} gte upper tolerance limit of ${tolerancePercentage}% to a value of ${(bnExpected.add(tolerance)).toString()}`);
    withinTolerance = false;
  }

  if (bnToCheck.lte(bnExpected.sub(tolerance))) {
    console.error(`bnHelper::isWithinWeiLimit - ${bnToCheck.toString()} lte lower tolerance limit of ${tolerancePercentage}% to a value of ${(bnExpected.sub(tolerance)).toString()}`);
    withinTolerance = false;
  }

  return withinTolerance;
}

module.exports = { addBNStr, subBNStr, mulBNStr, divBNStr, formatBNObjectToString, isWithinLimit, isWithinWeiLimit }