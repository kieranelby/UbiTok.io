// Conversion functions for talking to the BookERC20EthV1 contract.
//
// Currently limiting ourselves to ES5 here - perhaps should transpile?
//

var BigNumber = require('bignumber.js');
var uuidv4 = require('uuid/v4');

var enumTradableType = [
  'Ether',
  'ERC20'
];

var enumDirection = [
  'Invalid',
  'Buy',
  'Sell'
];

var enumStatus = [
  'Unknown',
  'Rejected',
  'Open',
  'Done',
  'NeedsGas',
  'Sending', // web3 only
  'FailedSend', // web3 only
  'FailedTxn' // web3 only
];

var enumReasonCode = [
  'None',
  'InvalidPrice',
  'InvalidSize',
  'InvalidTerms',
  'InsufficientFunds',
  'WouldTake',
  'Unmatched',
  'TooManyMatches',
  'ClientCancel'
];

var enumTerms = [
  'GTCNoGasTopup',
  'GTCWithGasTopup',
  'ImmediateOrCancel',
  'MakerOnly'
];

var enumMarketOrderEventType = [
  'Add',
  'Remove',
  'CompleteFill',
  'PartialFill'
];

function encodeEnum(enumNamedValues, namedValue) {
  var idx = enumNamedValues.indexOf(namedValue);
  if (idx === -1) {
    throw new Error("unknown name " + namedValue + " expected one of " + enumNamedValues);
  }
  return idx;
}

function decodeEnum(enumNamedValues, encodedValue) {
  if (encodedValue.toNumber) encodedValue = encodedValue.toNumber();
  if (encodedValue >= enumNamedValues.length) {
    throw new Error("unknown encodedValue " + encodedValue + " expected one of " + enumNamedValues);
  }
  return enumNamedValues[encodedValue];
}

exports.BigNumber = BigNumber;
exports.uuidv4 = uuidv4;

exports.encodeDirection = function (directionName) {
  return encodeEnum(enumDirection, directionName);
};

exports.oppositeEncodedDirection = function(encodedDirection) {
  if (encodedDirection === 0) {
    return 0;
  } else if (encodedDirection === 1) {
    return 2;
  } else if (encodedDirection === 2) {
    return 1;
  } else {
    throw new Error("unknown encodedDirection " + encodedDirection);
  }
};

exports.encodeTerms = function (termsName) {
  return encodeEnum(enumTerms, termsName);
};

exports.decodeTerms = function (encodedTerms) {
  return decodeEnum(enumTerms, encodedTerms);
};

exports.decodeStatus = function (encodedStatus) {
  return decodeEnum(enumStatus, encodedStatus);
};

exports.decodeReasonCode = function (encodedReasonCode) {
  return decodeEnum(enumReasonCode, encodedReasonCode);
};

exports.decodeMarketOrderEventType = function (encodedMarketOrderEventType) {
  return decodeEnum(enumMarketOrderEventType, encodedMarketOrderEventType);
};

// TODO - need to find sensible way to allow these to vary

exports.baseDecimals = 18;
exports.cntrDecimals = 18;
exports.rwrdDecimals = 18;

exports.minimumPriceExponent = -5;
exports.invalidPricePacked = 0;
exports.maxBuyPricePacked = 1;
exports.minBuyPricePacked = 10800;
exports.minSellPricePacked = 10801;
exports.maxSellPricePacked = 21600;

// e.g. 'Buy @ 1.00' -> 5401
//
exports.encodePrice = function (friendlyPrice) {
  var splitPrice = exports.splitFriendlyPrice(friendlyPrice);
  var direction = splitPrice[0];
  var mantissa = splitPrice[1];
  var exponent = splitPrice[2];
  if (direction === 'Invalid') {
     return 0;
  }
  if (exponent < exports.minimumPriceExponent || exponent > exports.minimumPriceExponent + 11) {
    return 0;
  }
  if (mantissa < 100 || mantissa > 999) {
    return 0;
  }
  var zeroBasedExponent = exponent - exports.minimumPriceExponent;
  var zeroBasedMantissa = mantissa - 100;
  var priceIndex = zeroBasedExponent * 900 + zeroBasedMantissa;
  var sidedPriceIndex = (direction === 'Buy') ? exports.minBuyPricePacked - priceIndex : exports.minSellPricePacked + priceIndex;
  return sidedPriceIndex;
};

// e.g. 5401 -> 'Buy @ 1.00'
//
exports.decodePrice = function (packedPrice) {
  if (packedPrice.toNumber) {
    packedPrice = packedPrice.toNumber();
  }
  var direction;
  var priceIndex;
  if (packedPrice < exports.maxBuyPricePacked || packedPrice > exports.maxSellPricePacked) {
    return 'Invalid';
  } else if (packedPrice <= exports.minBuyPricePacked) {
    direction = 'Buy';
    priceIndex = exports.minBuyPricePacked - packedPrice;
  } else {
    direction = 'Sell';
    priceIndex = packedPrice - exports.minSellPricePacked;
  }
  var zeroBasedMantissa = priceIndex % 900;
  var zeroBasedExponent = Math.floor(priceIndex / 900 + 1e-6);
  var mantissa = zeroBasedMantissa + 100;
  var exponent = zeroBasedExponent + exports.minimumPriceExponent;
  var mantissaDigits = '' + mantissa; // 100 - 999
  var friendlyPricePart;
  if (exponent === -5) {
    friendlyPricePart = '0.00000' + mantissaDigits;
  } else if (exponent === -4) {
    friendlyPricePart = '0.0000' + mantissaDigits;
  } else if (exponent === -3) {
    friendlyPricePart = '0.000' + mantissaDigits;
  } else if (exponent === -2) {
    friendlyPricePart = '0.00' + mantissaDigits;
  } else if (exponent === -1) {
    friendlyPricePart = '0.0' + mantissaDigits;
  } else if (exponent === 0) {
    friendlyPricePart = '0.' + mantissaDigits;
  } else if (exponent === 1) {
    friendlyPricePart = mantissaDigits[0] + '.' + mantissaDigits[1] + mantissaDigits[2];
  } else if (exponent === 2) {
    friendlyPricePart = mantissaDigits[0] + mantissaDigits[1] + '.' + mantissaDigits[2];
  } else if (exponent === 3) {
    friendlyPricePart = mantissaDigits;
  } else if (exponent === 4) {
    friendlyPricePart = mantissaDigits + '0';
  } else if (exponent === 5) {
    friendlyPricePart = mantissaDigits + '00';
  } else if (exponent === 6) {
    friendlyPricePart = mantissaDigits + '000';
  }
  return direction + ' @ ' + friendlyPricePart;
};

// Take the number part of a price entered by a human as a string (e.g. '1.23'),
// along with the intended direction ('Buy' or 'Sell') (not entered by a human),
// and turn it into either [ error, undefined] or [ undefined, result] where:
//   error = { msg: 'problem description', suggestion: 'optional replacement'}
//   result = [ direction, mantissa, exponent ]
// where direction = Buy/Sell, mantissa is a number from 100-999, exponent is
// a number from -5 to 6 as used by the book contract's packed price format.
//
// e.g. ('Buy', '12.3') -> [undefined, ['Buy', 123, 2]]
//
exports.parseFriendlyPricePart = function(direction, pricePart)  {
  if (direction !== 'Buy' && direction !== 'Sell') {
    return [{msg: 'has an unknown problem'}, undefined];
  }
  if (pricePart === undefined) {
    return [{msg: 'is blank'}, undefined];
  }
  var trimmedPricePart = pricePart.trim();
  if (trimmedPricePart === '') {
    return [{msg: 'is blank'}, undefined];
  }
  var looksLikeANumber = /^[0-9]*\.?[0-9]*$/.test(trimmedPricePart);
  if (!looksLikeANumber) {
    return [{msg: 'does not look like a regular number'}, undefined];
  }
  var number = new BigNumber(NaN);
  try {
    number = new BigNumber(trimmedPricePart);
  } catch (e) {
  }
  if (number.isNaN() || !number.isFinite()) {
    return [{msg: 'does not look like a regular number'}, undefined];
  }
  var minPrice = new BigNumber('0.000001');
  var maxPrice = new BigNumber('999000');
  if (number.lt(minPrice)) {
    return [{msg: 'is too small', suggestion: minPrice.toFixed()}, undefined];
  }
  if (number.gt(maxPrice)) {
    return [{msg: 'is too large', suggestion: maxPrice.toFixed()}, undefined];
  }
  var currentPower = new BigNumber('1000000');
  for (var exponent = 6; exponent >= -5; exponent--) {
    if (number.gte(currentPower.times('0.1'))) {
      var rawMantissa = number.div(currentPower);
      var mantissa = rawMantissa.mul(1000);
      if (mantissa.isInteger()) {
        if (mantissa.lt(100) || mantissa.gt(999)) {
          return [{msg: 'has an unknown problem'}, undefined];
        }
        return [undefined, [direction, mantissa.toNumber(), exponent]];
      } else {
        // round in favour of the order placer
        var roundMode = (direction === 'Buy') ? BigNumber.ROUND_DOWN : BigNumber.ROUND_UP;
        var roundMantissa = mantissa.round(0, roundMode);
        var roundedNumber = roundMantissa.div(1000).mul(currentPower);
        return [{msg: 'has too many significant figures', suggestion: roundedNumber.toFixed()}, undefined];
      }
    }
    currentPower = currentPower.times('0.1');
  }
  return [{msg: 'has an unknown problem'}, undefined];
};

// e.g. 'Buy @ 12.3' -> ['Buy', 123, 2]
//
exports.splitFriendlyPrice = function(price)  {
  var invalidSplitPrice = ['Invalid', 0, 0];
  if (!price.startsWith) {
    return invalidSplitPrice;
  }
  var direction;
  var pricePart;
  if (price.startsWith('Buy @ ')) {
    direction = 'Buy';
    pricePart = price.substr('Buy @ '.length);
  } else if (price.startsWith('Sell @ ')) {
    direction = 'Sell';
    pricePart = price.substr('Sell @ '.length);
  } else {
    return invalidSplitPrice;
  }
  var errorAndResult = exports.parseFriendlyPricePart(direction, pricePart);
  if (errorAndResult[0]) {
    return invalidSplitPrice;
  } else {
    return errorAndResult[1];
  }
};

exports.oppositeEncodedPrice = function(encodedPrice) {
  if (encodedPrice < exports.maxBuyPricePacked || encodedPrice > exports.maxSellPricePacked) {
    return exports.invalidPricePacked;
  } else if (encodedPrice <= exports.minBuyPricePacked) {
    return exports.maxSellPricePacked - (encodedPrice - exports.maxBuyPricePacked);
  } else {
    return exports.maxBuyPricePacked + (exports.maxSellPricePacked - encodedPrice);
  }
}

exports.decodeAmount = function(amountWei, decimals) {
  return new BigNumber(amountWei).div('1e' + decimals).toFixed(null);
};

exports.encodeAmount = function(friendlyAmount, decimals) {
  return new BigNumber(friendlyAmount).times('1e' + decimals);
};

exports.decodeBaseAmount = function(amountWei) {
  return exports.decodeAmount(amountWei, exports.baseDecimals);
};

exports.encodeBaseAmount = function(friendlyAmount, decimals) {
  return exports.encodeAmount(friendlyAmount, exports.baseDecimals);
};

exports.decodeCntrAmount = function(amountWei) {
  return exports.decodeAmount(amountWei, exports.cntrDecimals);
};

exports.encodeCntrAmount = function(friendlyAmount, decimals) {
  return exports.encodeAmount(friendlyAmount, exports.cntrDecimals);
};

exports.decodeRwrdAmount = function(amountWei) {
  return exports.decodeAmount(amountWei, exports.rwrdDecimals);
};

exports.encodeRwrdAmount = function(friendlyAmount, decimals) {
  return exports.encodeAmount(friendlyAmount, exports.rwrdDecimals);
};

exports.decodeOrderId = function(rawOrderId) {
  // pad to allow string ordering comparison
  // 128 bits needs 25 base36 digits
  var padding = '0000000000000000000000';
  return 'R' + (padding + rawOrderId.toString(36)).substr(-25);
};

exports.encodeOrderId = function(friendlyOrderId) {
  if (!friendlyOrderId.startsWith('R')) {
    throw new Error('bad friendly order id');
  }
  var base36OrderId = friendlyOrderId.substr(1);
  var numericOrderId = new BigNumber(base36OrderId, 36);
  return numericOrderId;
};

// See generateEncodedOrderId below.
exports.computeEncodedOrderId = function(date, randomHex) {
  var padding = '000000000000000000000000';
  var secondsSinceEpoch = parseInt(date.getTime() / 1000);
  var hex =
      (padding + secondsSinceEpoch.toString(16)).substr(-8) +
      (padding + randomHex).substr(-24);
  return new BigNumber(hex, 16);
};

exports.generateEncodedOrderId = function() {
  // Want to:
  //  - minimise storage costs
  //  - avoid collisions between clients
  //  - sort by creation time (within the scope of one client!)
  //  - extract creation time from order (for display to creator only!)
  // So we:
  //  - use client seconds since epoch (32bit) * 2^96 + 96 bits of client randomness
  // TODO: errm, yes, this has Y2K38 bug
  var date = new Date();
  var fullUuidWithoutDashes = uuidv4().replace(/-/g, '');
  return exports.computeEncodedOrderId(date, fullUuidWithoutDashes);
};

exports.generateDecodedOrderId = function() {
  return exports.decodeOrderId(exports.generateEncodedOrderId());
};

exports.deliberatelyInvalidEncodedOrderId = function() {
  return new BigNumber(0);
};

exports.extractClientDateFromDecodedOrderId = function(friendlyOrderId) {
  var encodedOrderId = exports.encodeOrderId(friendlyOrderId);
  var multiplier = (new BigNumber(2)).toPower(96);
  var datePartSeconds = encodedOrderId.div(multiplier).floor();
  return new Date(datePartSeconds.times(1000).toNumber());
};

// Suitable for use with getClientBalances().
exports.decodeClientBalances = function (result) {
  return {
    exchangeBase: exports.decodeBaseAmount(result[0]),
    exchangeCntr: exports.decodeCntrAmount(result[1]),
    exchangeRwrd: exports.decodeRwrdAmount(result[2]),
    approvedBase: exports.decodeBaseAmount(result[3]),
    approvedRwrd: exports.decodeRwrdAmount(result[4]),
    ownBase: exports.decodeBaseAmount(result[5]),
    ownRwrd: exports.decodeRwrdAmount(result[6])
  };
};

// Suitable for use with walkClientOrders().
exports.decodeWalkClientOrder = function (order) {
  return {
    orderId: exports.decodeOrderId(order[0]),
    price: exports.decodePrice(order[1]),
    sizeBase: exports.decodeBaseAmount(order[2]),
    terms: exports.decodeTerms(order[3]),
    status: exports.decodeStatus(order[4]),
    reasonCode: exports.decodeReasonCode(order[5]),
    rawExecutedBase: order[6],
    rawExecutedCntr: order[7],
    rawFees: order[8]
  };
};

// Suitable for use with getOrder().
exports.decodeOrder = function (orderId, order) {
  return {
    orderId: orderId,
    client: order[0],
    price: exports.decodePrice(order[1]),
    sizeBase: exports.decodeBaseAmount(order[2]),
    terms: exports.decodeTerms(order[3]),
    status: exports.decodeStatus(order[4]),
    reasonCode: exports.decodeReasonCode(order[5]),
    rawExecutedBase: order[6],
    rawExecutedCntr: order[7],
    rawFees: order[8]
  };
};

// Suitable for use with getOrderState().
exports.decodeOrderState = function (orderId, state) {
  return {
    orderId: orderId,
    status: exports.decodeStatus(state[0]),
    reasonCode: exports.decodeReasonCode(state[1]),
    rawExecutedBase: state[2],
    rawExecutedCntr: state[3],
    rawFees: state[4]
  };
};

// Suitable for use with a callback from an eth.filter watching for MarketOrderEvent.
exports.decodeMarketOrderEvent = function(result) {
  return {
      blockNumber: result.blockNumber,
      logIndex: result.logIndex,
      eventRemoved: result.removed,
      eventTimestamp: new Date(1000.0 * result.args.eventTimestamp.toNumber()),
      marketOrderEventType: exports.decodeMarketOrderEventType(result.args.marketOrderEventType),
      orderId: exports.decodeOrderId(result.args.orderId),
      pricePacked: result.args.price.toNumber(),
      rawDepthBase: result.args.depthBase,
      rawTradeBase: result.args.tradeBase
  };
};
