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
  this.balanceQuotedForClient = {};
  this.orderForOrderId = {};
  this.orderChainForPrice = {};
  this.baseMinRemainingSize = 10;
  this.baseMinInitialSize = 100;
  this.quotedMinRemainingSize = 1000;
  this.quotedMinInitialSize = 10000;
}
module.exports = ReferenceExchange;

ReferenceExchange.prototype.getBalanceBaseForClient = function(client)  {
  if (!this.balanceBaseForClient.hasOwnProperty(client)) {
    return 0;
  }
  return this.balanceBaseForClient[client];
};

ReferenceExchange.prototype.getBalanceQuotedForClient = function(client)  {
  if (!this.balanceQuotedForClient.hasOwnProperty(client)) {
    return 0;
  }
  return this.balanceQuotedForClient[client];
};

ReferenceExchange.prototype.depositBaseForTesting = function(client, amountBase) {
  this._creditFundsBase(client, amountBase);
};

ReferenceExchange.prototype.depositQuotedForTesting = function(client, amountQuoted)  {
  this._creditFundsQuoted(client, amountQuoted);
};

ReferenceExchange.prototype._creditFundsBase = function(client, amountBase)  {
  if (!this.balanceBaseForClient.hasOwnProperty(client)) {
    this.balanceBaseForClient[client] = 0;
  }
  this.balanceBaseForClient[client] += amountBase;
};

ReferenceExchange.prototype._creditFundsQuoted = function(client, amountQuoted)  {
  if (!this.balanceQuotedForClient.hasOwnProperty(client)) {
    this.balanceQuotedForClient[client] = 0;
  }
  this.balanceQuotedForClient[client] += amountQuoted;
};

ReferenceExchange.prototype.getOrder = function(orderId)  {
  if (!this.orderForOrderId.hasOwnProperty(orderId)) {
    throw new Error("order " + orderId + " does not exist");
  }
  return this.orderForOrderId[orderId];
};

ReferenceExchange.prototype.createOrder = function(client, orderId, price, sizeBase, terms)  {
  if (this.orderForOrderId.hasOwnProperty(orderId)) {
    throw new Error("order " + orderId + " already exists");
  }
  var order = {
    orderId: orderId,
    client: client,
    price: price,
    sizeBase: sizeBase,
    sizeQuoted: 0,
    terms: terms,
    status : 'Unknown',
    cancelOrRejectReason: 'None',
    executedBase : 0,
    executedQuoted : 0
  };
  this.orderForOrderId[orderId] = order;
  if (!this.isValidPrice(price)) {
    order.status = 'Rejected';
    order.cancelOrRejectReason = 'InvalidPrice';
    return;
  }
  if (sizeBase < this.baseMinInitialSize || sizeBase > 999999999999) {
    order.status = 'Rejected';
    order.cancelOrRejectReason = 'InvalidSize';
    return;
  }
  var sizeQuoted = this.computeAmountQuoted(sizeBase, price);
  if (sizeQuoted < this.quotedMinInitialSize || sizeQuoted > 999999999999) {
    order.status = 'Rejected';
    order.cancelOrRejectReason = 'InvalidSize';
    return;
  }
  order.sizeQuoted = sizeQuoted;
  if (!this._debitFundsForOrder(order)) {
    order.status = 'Rejected';
    order.cancelOrRejectReason = 'InsufficientFunds';
    return;
  }
  this._processOrder(order);
};

ReferenceExchange.prototype.getOrder = function(orderId)  {
  if (!this.orderForOrderId.hasOwnProperty(orderId)) {
    throw new Error("order " + orderId + " does not exist");
  }
  return this.orderForOrderId[orderId];
};

// For the reference implementation, our "native" price is the human-friendly one,
// examples are:
//
//  'Invalid'
//  'Buy@0.00000100' // always write out all 3 sig figs
//  'Buy@0.00000101'
//  ...
//  'Buy@1.00'
//  ...
//  'Buy@998000'
//  'Buy@999000'
//  'Sell@0.00000100' // always include leading zero before decimal point
//  ...
//  'Sell@999000'
//
ReferenceExchange.prototype._splitPrice = function(price)  {
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

ReferenceExchange.prototype._makePrice = function(direction, mantissa, exponent) {
  var price = '';
  if (direction === 'Buy') {
    price += 'Buy@';
  } else if (direction === 'Sell') {
    price += 'Sell@';
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

ReferenceExchange.prototype.isValidPrice = function(price)  {
  var splitPrice = this._splitPrice(price);
  return splitPrice[0] !== 'Invalid';
};

ReferenceExchange.prototype.isBuyPrice = function(price) {
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

ReferenceExchange.prototype.computeAmountQuoted = function(amountBase, price)  {
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
  if (this.isBuyPrice(order.price)) {
    var availableQuoted = this.getBalanceQuotedForClient(order.client);
    if (availableQuoted < order.sizeQuoted) {
      return false;
    }
    this.balanceQuotedForClient[order.client] = availableQuoted - order.sizeQuoted;
    return true;
  } else {
    var availableBase = this.getBalanceBaseForClient(order.client);
    if (availableBase < order.sizeBase) {
      return false;
    }
    this.balanceBaseForClient[order.client] = availableBase - order.sizeBase;
    return true;
  }
};

ReferenceExchange.prototype._processOrder = function(order)  {
  var ourOriginalExecutedBase = order.executedBase;
  var ourOriginalExecutedQuoted = order.executedQuoted;
  var theirPriceStart;
  if (this.isBuyPrice(order.price)) {
    theirPriceStart = "Sell@0.00000100";
  } else {
    theirPriceStart = "Buy@990000";
  }
  var theirPriceEnd = this.oppositePrice(order.price);
  var maxMatches = (order.terms === 'MakerOnly') ? 0 : 10; // TODO - will it always be ten?
  var matchStopReason = this._matchAgainstBook(order, theirPriceStart, theirPriceEnd, maxMatches);
  if (order.executedBase > ourOriginalExecutedBase) {
    if (this.isBuyPrice(order.price)) {
      this._creditFundsBase(order.client, order.executedBase - ourOriginalExecutedBase);
    } else {
      this._creditFundsQuoted(order.client, order.executedQuoted - ourOriginalExecutedQuoted);
    }
  }
  if (order.terms === 'ImmediateOrCancel') {
    if (matchStopReason === 'Satisfied') {
      this._refundUnmatchedAndFinish(order, 'Done', 'None');
      return;
    } else if (matchStopReason === MatchStopReason.MaxMatches) {
      this._refundUnmatchedAndFinish(order, 'Done', 'TooManyMatches');
      return;
    } else if (matchStopReason === MatchStopReason.BookExhausted) {
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
  } else if (order.terms === 'GoodTillCancel') {
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
  }
};

ReferenceExchange.prototype._refundUnmatchedAndFinish = function(order, status, cancelOrRejectReason) {
  if (this.isBuyPrice(order.price)) {
    this._creditFundsQuoted(order.client, order.sizeQuoted - order.executedQuoted);
  } else {
    this._creditFundsBase(order.client, order.sizeBase - order.executedBase);
  }
  order.status = status;
  order.cancelOrRejectReason = cancelOrRejectReason;
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
// Only updates the executedBase and executedQuoted of our order - caller is responsible
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
    if (maxMatches === 0) {
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
// Only updates the executedBase and executedQuoted of our order - caller is responsible
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
  var matchQuoted = this.computeAmountQuoted(matchBase, theirOrder.price);
  ourOrder.executedBase += matchBase;
  ourOrder.executedQuoted += matchQuoted;
  theirOrder.executedBase += matchBase;
  theirOrder.executedQuoted += matchQuoted;
  if (this.isBuyPrice(theirOrder.price)) {
     // they have bought base (using the quoted they already paid when creating the order)
     this._creditFundsBase(theirOrder.client, matchBase);
  } else {
    // they have bought quoted (using the base they already paid when creating the order)
     this._creditFundsQuoted(theirOrder.client, matchQuoted);
  }
  // TODO - dust prevention (need to refund it tho)
  if (theirOrder.executedBase === theirOrder.sizeBase) {
    theirOrder.status = 'Done';
    theirOrder.cancelOrRejectReason = 'None';
  }
};

ReferenceExchange.prototype._priceRange = function(priceStart, priceEnd)  {
  var splitPriceStart = this._splitPrice(priceStart);
  var splitPriceEnd = this._splitPrice(priceEnd);
  var prices = [];
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
