const BigDecimal = require('bignumber.js');
const uuidv4 = require('uuid/v4');

const enumTradableType = [
  'Ether',
  'ERC20'
];

const enumDirection = [
  'Invalid',
  'Buy',
  'Sell'
];

const enumStatus = [
  'Unknown',
  'Rejected',
  'Open',
  'Done',
  'NeedsGas',
  'New',
  'Sent',
  'FailedSend'
];

const enumCancelOrRejectReason = [
  'None',
  'InvalidPrice',
  'InvalidSize',
  'InsufficientFunds',
  'WouldTake',
  'Unmatched',
  'TooManyMatches',
  'ClientCancel'
];

const enumTerms = [
  'GoodTillCancel',
  'ImmediateOrCancel',
  'MakerOnly',
  'GTCWithGasTopup'
];

const enumMarketOrderEventType = [
  'Add',
  'Remove',
  'Trade'
];

function encodeEnum(enumNamedValues, namedValue) {
  var idx = enumNamedValues.indexOf(namedValue);
  if (idx === -1) {
    throw new Error("unknown name " + namedValue + " expected one of " + enumNamedValues);
  }
  return idx;
};

function decodeEnum(enumNamedValues, encodedValue) {
  if (encodedValue.toNumber) encodedValue = encodedValue.toNumber();
  if (encodedValue >= enumNamedValues.length) {
    throw new Error("unknown encodedValue " + encodedValue + " expected one of " + enumNamedValues);
  }
  return enumNamedValues[encodedValue];
};

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
    throw new Error("unknown encodedDirection " + encodedDirection)
  }
};

exports.encodeTerms = function (termsName) {
  return encodeEnum(enumTerms, termsName);
};

exports.decodeStatus = function (encodedStatus) {
  return decodeEnum(enumStatus, encodedStatus);
};

exports.decodeRejectReason = function (encodedRejectReason) {
  return decodeEnum(enumCancelOrRejectReason, encodedRejectReason);
};

exports.decodeMarketOrderEventType = function (encodedMarketOrderEventType) {
  return decodeEnum(enumMarketOrderEventType, encodedMarketOrderEventType);
};

exports.decodeState = function (state) {
  return {
    status: exports.decodeStatus(state[0]),
    rejectReason: exports.decodeRejectReason(state[1]),
    executedBase: state[2],
    executedQuoted: state[3]
  };
};

exports.minimumPriceExponent = -5; // should come from contract really?
exports.maxBuyPricePacked = 1;
exports.minBuyPricePacked = 10800;
exports.minSellPricePacked = 10801;
exports.maxSellPricePacked = 21600;

exports.encodePrice = function (friendlyPrice) {
  var splitPrice = exports.splitFriendlyPrice(friendlyPrice);
  var direction = splitPrice[0];
  var mantissa = splitPrice[1];
  var exponent = splitPrice[2];
  console.log(friendlyPrice, "=>", direction, mantissa, exponent);
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
  console.log(friendlyPrice, "=>", direction, mantissa, exponent, "=>", sidedPriceIndex);
  return sidedPriceIndex;
};

exports.decodePrice = function (packedPrice) {
  if (packedPrice.toNumber) {
    packedPrice = packedPrice.toNumber()
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
  let zeroBasedMantissa = priceIndex % 900;
  let zeroBasedExponent = Math.floor(priceIndex / 900 + 1e-6);
  let mantissa = zeroBasedMantissa + 100;
  let exponent = zeroBasedExponent + exports.minimumPriceExponent;
  let mantissaDigits = '' + mantissa; // 100 - 999
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
  var match;
  match = pricePart.match(/^([1-9][0-9][0-9])000$/);
  if (match) {
    return [direction, parseInt(match[1], 10), 6];
  }
  match = pricePart.match(/^([1-9][0-9][0-9])00$/);
  if (match) {
    return [direction, parseInt(match[1], 10), 5];
  }
  match = pricePart.match(/^([1-9][0-9][0-9])0$/);
  if (match) {
    return [direction, parseInt(match[1], 10), 4];
  }
  match = pricePart.match(/^([1-9][0-9][0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10), 3];
  }
  // TODO - handle no decimal point (e.g. 1-99) ...
  // TODO - handle missing trailing zeroes ...
  match = pricePart.match(/^([1-9][0-9])\.([0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10) * 10 + parseInt(match[2], 10), 2];
  }
  match = pricePart.match(/^([1-9])\.([0-9][0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10) * 100 + parseInt(match[2], 10), 1];
  }
  match = pricePart.match(/^0\.([1-9][0-9][0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10), 0];
  }
  match = pricePart.match(/^0\.0([1-9][0-9][0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10), -1];
  }
  match = pricePart.match(/^0\.00([1-9][0-9][0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10), -2];
  }
  match = pricePart.match(/^0\.000([1-9][0-9][0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10), -3];
  }
  match = pricePart.match(/^0\.0000([1-9][0-9][0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10), -4];
  }
  match = pricePart.match(/^0\.00000([1-9][0-9][0-9])$/);
  if (match) {
    return [direction, parseInt(match[1], 10), -5];
  }
  return invalidSplitPrice;
};

exports.decodeAmount = function(amountWei, decimals) {
  return new BigDecimal(amountWei).div('1e' + decimals).toFixed(null);
};

exports.encodeAmount = function(friendlyAmount, decimals) {
  return new BigDecimal(friendlyAmount).times('1e' + decimals);
};

exports.decodeOrderId = (rawOrderId) => {
  return 'R' + rawOrderId.toString(36);
};

exports.encodeOrderId = (friendlyOrderId) => {
  if (!friendlyOrderId.startsWith('R')) {
    throw new Error('bad friendly order id');
  }
  var base36OrderId = friendlyOrderId.substr(1);
  var numericOrderId = new BigDecimal(base36OrderId, 36);
  return numericOrderId;
};

exports.generateEncodedOrderId = () => {
  let uuidWithoutDashes = uuidv4().replace(/-/g, '');
  return new BigDecimal(uuidWithoutDashes, 16);
};
