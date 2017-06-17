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
  'WouldEnter',
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
  if (idx == -1) {
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
  if (encodedDirection == 0) {
    return 0;
  } else if (encodedDirection == 1) {
    return 2;
  } else if (encodedDirection == 2) {
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
