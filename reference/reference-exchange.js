"use strict";

var BigNumber = require('bignumber.js');

// Javascript 'reference' implementation of the Solidity exchange contract.
//
// Intended to make it easier to test a large number of scenarios by comparing how
// the Javascript and Solidity versions behave (of course, we could have made the
// same mistakes in both - but the code isn't an /exact/ port, the Solidity one aims
// to minimise gas whereas in JS we can go for readability first).
//
function ReferenceExchange() {
  if (!(this instanceof ReferenceExchange)) {
    throw new Error("constructor used as function");
  }
  this.balanceBaseForClient = {};
  this.balanceCntrForClient = {};
  this.orderForOrderId = {};
  this.orderChainForPrice = {};
  this.baseMinRemainingSize = 10;
  this.baseMinInitialSize = 100;
  this.cntrMinInitialSize = 10000;
}
module.exports = ReferenceExchange;

ReferenceExchange.prototype.getClientBalances = function(client) {
  return [
    this.balanceBaseForClient.hasOwnProperty(client) ? this.balanceBaseForClient[client] : 0,
    this.balanceCntrForClient.hasOwnProperty(client) ? this.balanceCntrForClient[client] : 0
  ];
};

ReferenceExchange.prototype.depositBaseForTesting = function(client, amountBase) {
  this._creditFundsBase(client, amountBase);
};

ReferenceExchange.prototype.depositCntrForTesting = function(client, amountCntr)  {
  this._creditFundsCntr(client, amountCntr);
};

ReferenceExchange.prototype._creditFundsBase = function(client, amountBase)  {
  if (!this.balanceBaseForClient.hasOwnProperty(client)) {
    this.balanceBaseForClient[client] = 0;
  }
  this.balanceBaseForClient[client] += amountBase;
};

ReferenceExchange.prototype._creditFundsCntr = function(client, amountCntr)  {
  if (!this.balanceCntrForClient.hasOwnProperty(client)) {
    this.balanceCntrForClient[client] = 0;
  }
  this.balanceCntrForClient[client] += amountCntr;
};

// Follows the slightly weird convention used by walkBook
ReferenceExchange.prototype.getBook = function()  {
  var bidSide = [];
  var askSide = [];
  // ok, this is ludicrously inefficient
  var allPrices = this._priceRange('Buy @ 999000', 'Buy @ 0.00000100');
  var price;
  for (var i = 0; i < allPrices.length; i++) {
    price = allPrices[i];
    if (this.orderChainForPrice.hasOwnProperty(price)) {
      var orderChain = this.orderChainForPrice[price];
      var depth = 0.0;
      var count = 0;
      for (var order of orderChain) {
        depth += (order.sizeBase - order.executedBase);
        count++;
      }
      bidSide.push([price, depth, count]);
    }
  }
  var allPrices = this._priceRange('Sell @ 0.00000100', 'Sell @ 999000');
  for (var i = 0; i < allPrices.length; i++) {
    price = allPrices[i];
    if (this.orderChainForPrice.hasOwnProperty(price)) {
      var orderChain = this.orderChainForPrice[price];
      var depth = 0.0;
      var count = 0;
      for (var order of orderChain) {
        depth += (order.sizeBase - order.executedBase);
        count++;
      }
      askSide.push([price, depth, count]);
    }
  }
  return [bidSide, askSide];
};

ReferenceExchange.prototype.getOrder = function(orderId)  {
  if (!this.orderForOrderId.hasOwnProperty(orderId)) {
    throw new Error("order " + orderId + " does not exist");
  }
  return this.orderForOrderId[orderId];
};

ReferenceExchange.prototype.createOrder = function(client, orderId, price, sizeBase, terms, maxMatches)  {
  if (this.orderForOrderId.hasOwnProperty(orderId)) {
    throw new Error("order " + orderId + " already exists");
  }
  var order = {
    orderId: orderId,
    client: client,
    price: this._normalisePrice(price),
    sizeBase: sizeBase,
    sizeCntr: 0,
    terms: terms,
    status : 'Unknown',
    reasonCode: 'None',
    executedBase : 0,
    executedCntr : 0,
    fees: 0
  };
  this.orderForOrderId[orderId] = order;
  if (!this._isValidPrice(order.price)) {
    order.status = 'Rejected';
    order.reasonCode = 'InvalidPrice';
    return;
  }
  if (sizeBase < this.baseMinInitialSize || sizeBase > 999999999999) {
    order.status = 'Rejected';
    order.reasonCode = 'InvalidSize';
    return;
  }
  var sizeCntr = this.computeAmountCntr(sizeBase, price);
  if (sizeCntr < this.cntrMinInitialSize || sizeCntr > 999999999999) {
    order.status = 'Rejected';
    order.reasonCode = 'InvalidSize';
    return;
  }
  order.sizeCntr = sizeCntr;
  if (!this._debitFundsForOrder(order)) {
    order.status = 'Rejected';
    order.reasonCode = 'InsufficientFunds';
    return;
  }
  this._processOrder(order, maxMatches);
};

ReferenceExchange.prototype.cancelOrder = function(client, orderId)  {
  var order = this.orderForOrderId[orderId];
  if (order.client !== client) {
    throw new Error('not your order');
  }
  if (order.status !== 'Open' && order.status !== 'NeedsGas') {
    // not really an error as such
    return;
  }
  if (order.status === 'Open') {
    let orderChain = this.orderChainForPrice[order.price];
    if (!orderChain) {
      throw new Error('assertion broken - must be a chain for price of open order');
    }
    let newOrderChain = orderChain.filter((v) => {
      return v.orderId !== orderId;
    });
    if (newOrderChain.length === orderChain.length) {
      throw new Error('assertion broken - open order must be in the chain for its price');
    }
    if (newOrderChain.length === 0) {
      delete this.orderChainForPrice[order.price];
    } else {
      // TODO - raise events!
      this.orderChainForPrice[order.price] = newOrderChain;
    }
  }
  this._refundUnmatchedAndFinish(order, 'Done', 'ClientCancel');
};

ReferenceExchange.prototype.continueOrder = function(client, orderId, maxMatches)  {
  var order = this.orderForOrderId[orderId];
  if (order.client !== client) {
    throw new Error('not your order');
  }
  if (order.status !== 'NeedsGas') {
    // not really an error as such?
    return;
  }
  order.status = 'Unknown';
  this._processOrder(order, maxMatches);
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
ReferenceExchange.prototype._parseFriendlyPricePart = function(direction, pricePart)  {
  if (direction !== 'Buy' && direction !== 'Sell') {
    return [{msg: 'has an unknown problem'}, undefined];
  }
  if (pricePart === undefined) {
    return [{msg: 'is blank'}, undefined];
  }
  let trimmedPricePart = pricePart.trim();
  if (trimmedPricePart === '') {
    return [{msg: 'is blank'}, undefined];
  }
  let looksLikeANumber = /^[0-9]*\.?[0-9]*$/.test(trimmedPricePart);
  if (!looksLikeANumber) {
    return [{msg: 'does not look like a regular number'}, undefined];
  }
  let number = new BigNumber(NaN);
  try {
    number = new BigNumber(trimmedPricePart);
  } catch (e) {
  }
  if (number.isNaN() || !number.isFinite()) {
    return [{msg: 'does not look like a regular number'}, undefined];
  }
  const minPrice = new BigNumber('0.000001');
  const maxPrice = new BigNumber('999000');
  if (number.lt(minPrice)) {
    return [{msg: 'is too small', suggestion: minPrice.toFixed()}, undefined];
  }
  if (number.gt(maxPrice)) {
    return [{msg: 'is too large', suggestion: maxPrice.toFixed()}, undefined];
  }
  let currentPower = new BigNumber('1000000');
  for (let exponent = 6; exponent >= -5; exponent--) {
    if (number.gte(currentPower.times('0.1'))) {
      let rawMantissa = number.div(currentPower);
      let mantissa = rawMantissa.mul(1000);
      if (mantissa.isInteger()) {
        if (mantissa.lt(100) || mantissa.gt(999)) {
          return [{msg: 'has an unknown problem'}, undefined];
        }
        return [undefined, [direction, mantissa.toNumber(), exponent]];
      } else {
        // round in favour of the order placer
        let roundMode = (direction === 'Buy') ? BigNumber.ROUND_DOWN : BigNumber.ROUND_UP;
        let roundMantissa = mantissa.round(0, roundMode);
        let roundedNumber = roundMantissa.div(1000).mul(currentPower);
        return [{msg: 'has too many significant figures', suggestion: roundedNumber.toFixed()}, undefined];
      }
    }
    currentPower = currentPower.times('0.1');
  }
  return [{msg: 'has an unknown problem'}, undefined];
}

// e.g. 'Buy @ 12.3' -> ['Buy', 123, 2]
//
ReferenceExchange.prototype._splitPrice = function(price)  {
  const invalidSplitPrice = ['Invalid', 0, 0];
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
  let errorAndResult = this._parseFriendlyPricePart(direction, pricePart);
  if (errorAndResult[0]) {
    return invalidSplitPrice;
  } else {
    return errorAndResult[1];
  }
};

ReferenceExchange.prototype._makePrice = function(direction, mantissa, exponent) {
  var price = '';
  if (direction === 'Buy') {
    price += 'Buy @ ';
  } else if (direction === 'Sell') {
    price += 'Sell @ ';
  } else {
    return 'Invalid';
  }
  if (!Number.isInteger(mantissa) || mantissa < 100 || mantissa > 999) {
    return 'Invalid';
  }
  if (!Number.isInteger(exponent) || exponent < -5 || exponent > 6) {
    return 'Invalid';
  }
  var effectiveExponent = exponent - 3;
  var dps;
  if (effectiveExponent >= 0) {
    dps = 0;
  } else {
    dps = 0 - effectiveExponent;
  }
  // TODO - consider using bignumber ..
  price += (mantissa * Math.pow(10, effectiveExponent)).toFixed(dps);
  return price;
};

ReferenceExchange.prototype._isValidPrice = function(price)  {
  var splitPrice = this._splitPrice(price);
  return splitPrice[0] !== 'Invalid';
};

ReferenceExchange.prototype._normalisePrice = function(price)  {
  var splitPrice = this._splitPrice(price);
  return this._makePrice(splitPrice[0], splitPrice[1], splitPrice[2]);
};

ReferenceExchange.prototype._isBuyPrice = function(price) {
  var splitPrice = this._splitPrice(price);
  if (splitPrice[0] === 'Invalid') {
    throw("not a valid sided price: " + price);
  }
  return splitPrice[0] === 'Buy';
};

ReferenceExchange.prototype.oppositePrice = function(price)  {
  var splitPrice = this._splitPrice(price);
  var oppositeDirection;
  if (splitPrice[0] === 'Buy') {
    oppositeDirection = 'Sell';
  } else if (splitPrice[0] === 'Sell') {
    oppositeDirection = 'Buy';
  } else {
    oppositeDirection = 'Invalid';
  }
  return this._makePrice(oppositeDirection, splitPrice[1], splitPrice[2]);
};

ReferenceExchange.prototype.computeAmountCntr = function(amountBase, price)  {
  var splitPrice = this._splitPrice(price);
  if (splitPrice[0] === 'Invalid') {
    throw("not a valid sided price: " + price);
  }
  var result = new BigNumber(amountBase);
  result = result.times(splitPrice[1]);
  result = result.times(new BigNumber('10').pow(splitPrice[2] - 3));
  result = result.truncated();
  return result.toNumber();
};

ReferenceExchange.prototype._debitFundsForOrder = function(order)  {
  if (this._isBuyPrice(order.price)) {
    var availableCntr = this.getClientBalances(order.client)[1];
    if (availableCntr < order.sizeCntr) {
      return false;
    }
    this.balanceCntrForClient[order.client] = availableCntr - order.sizeCntr;
    return true;
  } else {
    var availableBase = this.getClientBalances(order.client)[0];
    if (availableBase < order.sizeBase) {
      return false;
    }
    this.balanceBaseForClient[order.client] = availableBase - order.sizeBase;
    return true;
  }
};

ReferenceExchange.prototype._processOrder = function(order, maxMatches)  {
  var ourOriginalExecutedBase = order.executedBase;
  var ourOriginalExecutedCntr = order.executedCntr;
  var theirPriceStart;
  if (this._isBuyPrice(order.price)) {
    theirPriceStart = "Sell @ 0.00000100";
  } else {
    theirPriceStart = "Buy @ 990000";
  }
  var theirPriceEnd = this.oppositePrice(order.price);
  var matchStopReason = this._matchAgainstBook(order, theirPriceStart, theirPriceEnd, maxMatches);
  if (order.executedBase > ourOriginalExecutedBase) {
    if (this._isBuyPrice(order.price)) {
      var liquidityTakenBase = order.executedBase - ourOriginalExecutedBase;
      var feesBase = Math.floor(liquidityTakenBase * 0.0005);
      this._creditFundsBase(order.client, liquidityTakenBase - feesBase);
      order.fees += feesBase;
    } else {
      var liquidityTakenCntr = order.executedCntr - ourOriginalExecutedCntr;
      var feesCntr = Math.floor(liquidityTakenCntr * 0.0005);
      this._creditFundsCntr(order.client, liquidityTakenCntr - feesCntr);
      order.fees += feesCntr;
    }
  }
  if (order.terms === 'ImmediateOrCancel') {
    if (matchStopReason === 'Satisfied') {
      this._refundUnmatchedAndFinish(order, 'Done', 'None');
      return;
    } else if (matchStopReason === 'MaxMatches') {
      this._refundUnmatchedAndFinish(order, 'Done', 'TooManyMatches');
      return;
    } else if (matchStopReason === 'BookExhausted') {
      this._refundUnmatchedAndFinish(order, 'Done', 'Unmatched');
      return;
    }
  } else if (order.terms === 'MakerOnly') {
    if (matchStopReason === 'MaxMatches') {
      this._refundUnmatchedAndFinish(order, 'Rejected', 'WouldTake');
      return;
    } else if (matchStopReason === 'BookExhausted') {
      this._enterOrder(order);
      return;
    }
  } else if (order.terms === 'GTCNoGasTopup') {
    if (matchStopReason === 'Satisfied') {
      this._refundUnmatchedAndFinish(order, 'Done', 'None');
      return;
    } else if (matchStopReason === 'MaxMatches') {
      this._refundUnmatchedAndFinish(order, 'Done', 'TooManyMatches');
      return;
    } else if (matchStopReason === 'BookExhausted') {
      this._enterOrder(order);
      return;
    }
  } else if (order.terms === 'GTCWithGasTopup') {
    if (matchStopReason === 'Satisfied') {
      this._refundUnmatchedAndFinish(order, 'Done', 'None');
      return;
    } else if (matchStopReason === 'MaxMatches') {
      order.status = 'NeedsGas';
      return;
    } else if (matchStopReason === 'BookExhausted') {
      this._enterOrder(order);
      return;
    }
  }
};

ReferenceExchange.prototype._refundUnmatchedAndFinish = function(order, status, reasonCode) {
  if (this._isBuyPrice(order.price)) {
    this._creditFundsCntr(order.client, order.sizeCntr - order.executedCntr);
  } else {
    this._creditFundsBase(order.client, order.sizeBase - order.executedBase);
  }
  order.status = status;
  order.reasonCode = reasonCode;
};

ReferenceExchange.prototype._matchAgainstBook = function(order, theirPriceStart, theirPriceEnd, maxMatches)  {
  var matchesLeft = maxMatches;
  var theirPrices = this._priceRange(theirPriceStart, theirPriceEnd);
  var matchStopReason = 'None';
  for (var i = 0; i < theirPrices.length; i++) {
    var theirPrice = theirPrices[i];
    if (this.orderChainForPrice.hasOwnProperty(theirPrice)) {
      var result = this._matchWithOccupiedPrice(order, theirPrice, matchesLeft)
      var removedLastAtPrice = result[0];
      matchesLeft = result[1];
      matchStopReason = result[2];
      if (removedLastAtPrice) {
        // there's no great reason for this, mostly just by analogy of the
        // bitmaps which the Solidity version maintains ...
        delete this.orderChainForPrice[theirPrice];
      }
      if (matchStopReason === 'PriceExhausted') {
        matchStopReason = 'None';
      } else if (matchStopReason !== 'None') {
        break;
      }
    }
  }
  if (matchStopReason === 'None') {
    matchStopReason = 'BookExhausted';
  }
  return matchStopReason;
};

// Match our order against up to maxMatches resting orders at the given price (which is known
// by the caller to have at least one resting order).
//
// The matches (partial or complete) of the resting orders are recorded, and their funds are credited.
//
// The order chain for the resting orders is updated, but the occupied price bitmap is NOT - the caller
// must clear the relevant bit if removedLastAtPrice = true is returned.
//
// Only updates the executedBase and executedCntr of our order - caller is responsible
// for e.g. crediting our matched funds, updating status.
//
// Calling with maxMatches == 0 is ok - and expected when the order is a maker-only order.
//
// Returns [ removedLastAtPrice, matchesLeft, matchStopReason ] where:
//
// If our order is completely matched, matchStopReason will be Satisfied.
// If our order is not completely matched, matchStopReason will be either:
//     MaxMatches (we are not allowed to match any more times)
//   or:
//     PriceExhausted (nothing left on the book at this exact price)
//
ReferenceExchange.prototype._matchWithOccupiedPrice = function(order, theirPrice, maxMatches)  {
  var matchStopReason = 'None';
  var matchesLeft = maxMatches;
  var orderChain = this.orderChainForPrice[theirPrice];
  while (true) {
    if (matchesLeft === 0) {
      matchStopReason = 'MaxMatches';
      break;
    }
    var theirOrder = orderChain[0];
    this._matchWithTheirs(order, theirOrder);
    matchesLeft -= 1;
    // TODO - dust prevention
    if (order.executedBase === order.sizeBase) {
      matchStopReason = 'Satisfied';
    }
    if (theirOrder.status != 'Open') {
      orderChain.splice(0, 1);
      if (orderChain.length === 0) {
        if (matchStopReason === 'None') {
          matchStopReason = 'PriceExhausted';
        }
      }
    }
    if (matchStopReason !== 'None') {
      break;
    }
  }
  return [ orderChain.length === 0, matchesLeft, matchStopReason ];
};

// Match our order against a resting order in the book (their order).
//
// The match (partial or complete) of the resting order is recorded, and their funds are credited.
//
// The resting order is NOT removed from the book by this call - the caller must do that
// if the resting order has status != Open after the call.
//
// Only updates the executedBase and executedCntr of our order - caller is responsible
// for e.g. crediting our matched funds, updating status.
//
ReferenceExchange.prototype._matchWithTheirs = function(ourOrder, theirOrder)  {
  var ourRemainingBase = ourOrder.sizeBase - ourOrder.executedBase;
  var theirRemainingBase = theirOrder.sizeBase - theirOrder.executedBase;
  var matchBase;
  if (ourRemainingBase < theirRemainingBase) {
    matchBase = ourRemainingBase;
  } else {
    matchBase = theirRemainingBase;
  }
  var matchCntr = this.computeAmountCntr(matchBase, theirOrder.price);
  ourOrder.executedBase += matchBase;
  ourOrder.executedCntr += matchCntr;
  theirOrder.executedBase += matchBase;
  theirOrder.executedCntr += matchCntr;
  if (this._isBuyPrice(theirOrder.price)) {
     // they have bought base (using the Cntr they already paid when creating the order)
     this._creditFundsBase(theirOrder.client, matchBase);
  } else {
    // they have bought Cntr (using the base they already paid when creating the order)
     this._creditFundsCntr(theirOrder.client, matchCntr);
  }
  // TODO - dust prevention (need to refund it tho)
  if (theirOrder.executedBase === theirOrder.sizeBase) {
    theirOrder.status = 'Done';
    theirOrder.reasonCode = 'None';
  }
};

ReferenceExchange.prototype._priceRange = function(priceStart, priceEnd)  {
  var splitPriceStart = this._splitPrice(priceStart);
  var splitPriceEnd = this._splitPrice(priceEnd);
  var prices = [];
  if (splitPriceStart[0] !== splitPriceEnd[0]) {
    throw new Error('mixed directions not supported');
  }
  if (splitPriceStart[0] === 'Buy') {
    for (var e = splitPriceStart[2]; e >= splitPriceEnd[2]; e--) {
      var mStart = 999;
      var mEnd = 100;
      if (e === splitPriceStart[2]) {
        mStart = splitPriceStart[1];
      }
      if (e === splitPriceEnd[2]) {
        mEnd = splitPriceEnd[1];
      }
      for (var m = mStart; m >= mEnd; m--) {
        prices.push(this._makePrice(splitPriceStart[0], m, e));
      }
    }
  } else if (splitPriceStart[0] === 'Sell') {
    for (var e = splitPriceStart[2]; e <= splitPriceEnd[2]; e++) {
      var mStart = 100;
      var mEnd = 999;
      if (e === splitPriceStart[2]) {
        mStart = splitPriceStart[1];
      }
      if (e === splitPriceEnd[2]) {
        mEnd = splitPriceEnd[1];
      }
      for (var m = mStart; m <= mEnd; m++) {
        prices.push(this._makePrice(splitPriceStart[0], m, e));
      }
    }
  } else {
    throw new Error("unexpected starting price " + priceStart);
  }
  return prices;
};

ReferenceExchange.prototype._enterOrder = function(order)  {
  if (!this.orderChainForPrice.hasOwnProperty(order.price)) {
    this.orderChainForPrice[order.price] = [];
  }
  this.orderChainForPrice[order.price].push(order);
  order.status = 'Open';
};
