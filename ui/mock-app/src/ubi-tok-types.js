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
  'Done'
];

var enumCancelOrRejectReason = [
  'None',
  'InvalidPrice',
  'InvalidSize',
  'InsufficientFunds',
  'WouldTake',
  'Unmatched',
  'TooManyMatches',
  'ClientCancel'
];

var enumTerms = [
  'GoodTillCancel',
  'ImmediateOrCancel',
  'MakerOnly'
];

function encodeEnum(enumNamedValues, namedValue) {
  var idx = enumNamedValues.indexOf(namedValue);
  if (idx === -1) {
    throw new Error("unknown name " + namedValue + " expected one of " + enumNamedValues);
  }
  return idx;
};

function decodeEnum(enumNamedValues, encodedValue) {
  if (encodedValue.valueOf) encodedValue = encodedValue.valueOf();
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

exports.decodeState = function (state) {
  return {
    status: exports.decodeStatus(state[0]),
    rejectReason: exports.decodeRejectReason(state[1]),
    executedBase: state[2],
    executedQuoted: state[3]
  };
};

exports.encodePrice = function (friendlyPrice) {
  var splitPrice = exports.splitFriendlyPrice(friendlyPrice);
  var direction = splitPrice[0];
  var mantissa = splitPrice[1];
  var exponent = splitPrice[2];
  console.log(friendlyPrice, "=>", direction, mantissa, exponent);
  if (direction === 'Invalid') {
     return 0;
  }
  if (exponent < -8 || exponent > 9) {
    return 0;
  }
  if (mantissa < 100 || mantissa > 999) {
    return 0;
  }
  var zeroBasedExponent = exponent + 8;
  var zeroBasedMantissa = mantissa - 100;
  var priceIndex = zeroBasedExponent * 900 + zeroBasedMantissa;
  var sidedPriceIndex = (direction === 'Buy') ? 16200 - priceIndex : 16201 + priceIndex;
  console.log(friendlyPrice, "=>", direction, mantissa, exponent, "=>", sidedPriceIndex);
  return sidedPriceIndex;
};

exports.splitFriendlyPrice = function(price)  {
  var invalidSplitPrice = ['Invalid', 0, 0];
  if (!price.startsWith) {
    return invalidSplitPrice;
  }
  var direction;
  var pricePart;
  if (price.startsWith('Buy@')) {
    direction = 'Buy';
    pricePart = price.substr('Buy@'.length);
  } else if (price.startsWith('Sell@')) {
    direction = 'Sell';
    pricePart = price.substr('Sell@'.length);
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
