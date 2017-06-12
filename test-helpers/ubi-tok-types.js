exports.encodeDirection = function (direction) {
  if (direction == "Invalid") {
    return 0;
  } else if (direction == "Buy") {
    return 1;
  } else if (direction == "Sell") {
    return 2;
  } else {
    throw new Error("unknown direction " + direction)
  }
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

exports.encodeTerms = function (terms) {
  if (terms == "GoodTillCancel") {
    return 0;
  } else if (terms == "ImmediateOrCancel") {
    return 1;
  } else if (terms == "MakerOnly") {
    return 2;
  } else {
    throw new Error("unknown terms " + terms)
  }
};

exports.decodeStatus = function (status) {
  if (status.valueOf) status = status.valueOf();
  if (status == 0) {
    return 'Unknown';
  } else if (status == 1) {
    return 'Pending';
  } else if (status == 2) {
    return 'Rejected';
  } else if (status == 3) {
    return 'Open';
  } else if (status == 4) {
    return 'Done';
  } else {
    throw new Error("unknown status " + status)
  }
};

exports.decodeRejectReason = function (rejectReason) {
  if (rejectReason.valueOf) rejectReason = rejectReason.valueOf();
  if (rejectReason == 0) {
    return 'None';
  } else if (rejectReason == 1) {
    return 'InvalidPrice';
  } else if (rejectReason == 2) {
    return 'InvalidSize';
  } else if (rejectReason == 3) {
    return 'InsufficientFunds';
  } else if (rejectReason == 4) {
    return 'WouldTake';
  } else {
    throw new Error("unknown rejectReason " + rejectReason)
  }
};

exports.decodeState = function (state) {
  return {
    status: exports.decodeStatus(state[0]),
    rejectReason: exports.decodeRejectReason(state[1]),
    executedBase: state[2],
    executedQuoted: state[3]
  };
};
