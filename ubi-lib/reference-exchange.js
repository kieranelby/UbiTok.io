var BigNumber = require('bignumber.js');

// Javascript 'reference' implementation of the Solidity exchange contract.
//
// Intended to make it easier to test a large number of scenarios by comparing how
// the Javascript and Solidity versions behave (of course, we could have made the
// same mistakes in both - but the code isn't an /exact/ port, the Solidity one aims
// to minimise gas whereas in JS we can go for readability first).
//
// Until better tools emerge, it's much easier to measure code coverage in JS
// than in Solidity.
//
// Note that unlike the real contract, we use friendly prices, orderIds,
// and enum names throughout. We use wei-denominated sizes though.
//
// Currently limiting ourselves to ES5 here - perhaps should transpile?
//
function ReferenceExchange() {
  if (!(this instanceof ReferenceExchange)) {
    throw new Error("constructor used as function");
  }

  this.bigZero = new BigNumber(0);

  this.balanceBaseForClient = {};
  this.balanceCntrForClient = {};
  this.balanceRwrdForClient = {};

  // not really part of the exchange but doesn't seem worth having separate reference tokens
  this.approvedBaseForClient = {};
  this.approvedRwrdForClient = {};
  this.ownBaseForClient = {};
  this.ownCntrForClient = {};
  this.ownRwrdForClient = {};

  this.orderForOrderId = {};
  this.orderChainForPrice = {};
  this.baseMinRemainingSize = new BigNumber('10');
  this.baseMinInitialSize = new BigNumber('100');
  this.baseMaxSize = new BigNumber('1e32');
  this.cntrMinInitialSize = new BigNumber('10000');
  this.cntrMaxSize = new BigNumber('1e32');
  this.events = [];
}
module.exports = ReferenceExchange;

ReferenceExchange.prototype.collectEvents = function() {
  var events = this.events;
  this.events = [];
  return events;
};

ReferenceExchange.prototype._raiseEvent = function(event) {
  this.events.push(event);
};

ReferenceExchange.prototype._getOrDflt = function(obj, key, dflt) {
  if (obj.hasOwnProperty(key)) {
    return obj[key];
  } else {
    return dflt;
  }
};

ReferenceExchange.prototype.getClientBalances = function(client) {
  return [
    this._getOrDflt(this.balanceBaseForClient, client, this.bigZero),
    this._getOrDflt(this.balanceCntrForClient, client, this.bigZero),
    this._getOrDflt(this.balanceRwrdForClient, client, this.bigZero),
    this._getOrDflt(this.approvedBaseForClient, client, this.bigZero),
    this._getOrDflt(this.approvedRwrdForClient, client, this.bigZero),
    this._getOrDflt(this.ownBaseForClient, client, this.bigZero),
    this._getOrDflt(this.ownRwrdForClient, client, this.bigZero)
  ];
};

// annoying special case due to geth/metamask bug
ReferenceExchange.prototype.getOwnCntrBalance = function(client) {
  return this._getOrDflt(this.ownCntrForClient, client, this.bigZero);
};

ReferenceExchange.prototype.depositBaseForTesting = function(client, amountBase) {
  this._creditFundsBase(client, amountBase);
};

ReferenceExchange.prototype.depositCntrForTesting = function(client, amountCntr)  {
  this._creditFundsCntr(client, amountCntr);
};

ReferenceExchange.prototype._creditFundsBase = function(client, amountBase)  {
  if (!this.balanceBaseForClient.hasOwnProperty(client)) {
    this.balanceBaseForClient[client] = this.bigZero;
  }
  this.balanceBaseForClient[client] = this.balanceBaseForClient[client].add(amountBase);
};

ReferenceExchange.prototype._creditFundsCntr = function(client, amountCntr)  {
  if (!this.balanceCntrForClient.hasOwnProperty(client)) {
    this.balanceCntrForClient[client] = this.bigZero;
  }
  this.balanceCntrForClient[client] = this.balanceCntrForClient[client].add(amountCntr);
};

ReferenceExchange.prototype.walkBook = function(fromPrice) {
  var minBuyPrice = 'Buy @ 0.00000100';
  var maxSellPrice = 'Sell @ 999000';
  var endPrice = this._isBuyPrice(fromPrice) ? minBuyPrice : maxSellPrice;
  var allPrices = this._priceRange(fromPrice, endPrice);
  var price;
  for (var i = 0; i < allPrices.length; i++) {
    price = allPrices[i];
    if (this.orderChainForPrice.hasOwnProperty(price)) {
      var orderChain = this.orderChainForPrice[price];
      var depth = this.bigZero;
      var count = this.bigZero;
      for (var j = 0; j < orderChain.length; j++) {
        var order = orderChain[j];
        depth = depth.add(order.sizeBase.minus(order.executedBase));
        count = count.add(1);
      }
      return [price, depth, count];
    }
  }
  return [endPrice, this.bigZero, this.bigZero];
};

// Follows the slightly weird convention used by walkBook
// TODO - perhaps abstract book building to some separate class that calls walkBook, the real contract does not have this
ReferenceExchange.prototype.getBook = function()  {
  var bidSide = [];
  var askSide = [];
  // why are we using ES5?
  var allPrices, i, orderChain, depth, count, j;
  // ok, this is ludicrously inefficient
  allPrices = this._priceRange('Buy @ 999000', 'Buy @ 0.00000100');
  var price;
  for (i = 0; i < allPrices.length; i++) {
    price = allPrices[i];
    if (this.orderChainForPrice.hasOwnProperty(price)) {
      orderChain = this.orderChainForPrice[price];
      depth = this.bigZero;
      count = this.bigZero;
      for (j = 0; j < orderChain.length; j++) {
        order = orderChain[j];
        depth = depth.add(order.sizeBase.minus(order.executedBase));
        count = count.add(1);
      }
      bidSide.push([price, depth, count]);
    }
  }
  allPrices = this._priceRange('Sell @ 0.00000100', 'Sell @ 999000');
  for (i = 0; i < allPrices.length; i++) {
    price = allPrices[i];
    if (this.orderChainForPrice.hasOwnProperty(price)) {
      orderChain = this.orderChainForPrice[price];
      depth = this.bigZero;
      count = this.bigZero;
      for (j = 0; j < orderChain.length; j++) {
        order = orderChain[j];
        depth = depth.add(order.sizeBase.minus(order.executedBase));
        count = count.add(1);
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
    sizeCntr: this.bigZero,
    terms: terms,
    status : 'Unknown',
    reasonCode: 'None',
    executedBase : this.bigZero,
    executedCntr : this.bigZero,
    fees: this.bigZero // TODO - out of date
  };
  this.orderForOrderId[orderId] = order;
  if (!this._isValidPrice(order.price)) {
    order.status = 'Rejected';
    order.reasonCode = 'InvalidPrice';
    return;
  }
  if (sizeBase.lt(this.baseMinInitialSize) || sizeBase.gte(this.baseMaxSize)) {
    order.status = 'Rejected';
    order.reasonCode = 'InvalidSize';
    return;
  }
  var sizeCntr = this.computeAmountCntr(sizeBase, price);
  if (sizeCntr < this.cntrMinInitialSize || sizeCntr.gte(this.cntrMaxSize)) {
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
    var orderChain = this.orderChainForPrice[order.price];
    if (!orderChain) {
      throw new Error('assertion broken - must be a chain for price of open order');
    }
    var newOrderChain = orderChain.filter(function(v) {
      return v.orderId !== orderId;
    });
    if (newOrderChain.length === orderChain.length) {
      throw new Error('assertion broken - open order must be in the chain for its price');
    }
    if (newOrderChain.length === 0) {
      delete this.orderChainForPrice[order.price];
    } else {
      this.orderChainForPrice[order.price] = newOrderChain;
    }
    this._raiseEvent({
      eventType: 'MarketOrderEvent',
      orderId: orderId,
      marketOrderEventType: 'Remove',
      price: order.price,
      depthBase: order.sizeBase.minus(order.executedBase),
      tradeBase: this.bigZero
    });
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
ReferenceExchange.prototype._splitPrice = function(price)  {
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
  var errorAndResult = this._parseFriendlyPricePart(direction, pricePart);
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
  var result = amountBase;
  result = result.times(splitPrice[1]);
  result = result.times(new BigNumber('10').pow(splitPrice[2] - 3));
  result = result.truncated();
  return result;
};

ReferenceExchange.prototype._debitFundsForOrder = function(order)  {
  if (this._isBuyPrice(order.price)) {
    var availableCntr = this.getClientBalances(order.client)[1];
    if (availableCntr.lt(order.sizeCntr)) {
      return false;
    }
    this.balanceCntrForClient[order.client] = availableCntr.minus(order.sizeCntr);
    return true;
  } else {
    var availableBase = this.getClientBalances(order.client)[0];
    if (availableBase.lt(order.sizeBase)) {
      return false;
    }
    this.balanceBaseForClient[order.client] = availableBase.minus(order.sizeBase);
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
  // TODO - pay fees with rwrd balance
  if (order.executedBase.gt(ourOriginalExecutedBase)) {
    if (this._isBuyPrice(order.price)) {
      var liquidityTakenBase = order.executedBase.minus(ourOriginalExecutedBase);
      var feesBase = liquidityTakenBase.times(0.0005).floor();
      this._creditFundsBase(order.client, liquidityTakenBase.minus(feesBase));
      order.fees = order.fees.add(feesBase);
    } else {
      var liquidityTakenCntr = order.executedCntr.minus(ourOriginalExecutedCntr);
      var feesCntr = liquidityTakenCntr.times(0.0005).floor();
      this._creditFundsCntr(order.client, liquidityTakenCntr.minus(feesCntr));
      order.fees = order.fees.add(feesCntr);
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
    this._creditFundsCntr(order.client, order.sizeCntr.minus(order.executedCntr));
  } else {
    this._creditFundsBase(order.client, order.sizeBase.minus(order.executedBase));
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
      var result = this._matchWithOccupiedPrice(order, theirPrice, matchesLeft);
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
    if (order.executedBase.eq(order.sizeBase)) {
      matchStopReason = 'Satisfied';
    }
    if (theirOrder.status !== 'Open') {
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
  var ourRemainingBase = ourOrder.sizeBase.minus(ourOrder.executedBase);
  var theirRemainingBase = theirOrder.sizeBase.minus(theirOrder.executedBase);
  var matchBase;
  if (ourRemainingBase.lt(theirRemainingBase)) {
    matchBase = ourRemainingBase;
  } else {
    matchBase = theirRemainingBase;
  }
  var matchCntr = this.computeAmountCntr(matchBase, theirOrder.price);
  ourOrder.executedBase = ourOrder.executedBase.add(matchBase);
  ourOrder.executedCntr = ourOrder.executedCntr.add(matchCntr);
  theirOrder.executedBase = theirOrder.executedBase.add(matchBase);
  theirOrder.executedCntr = theirOrder.executedCntr.add(matchCntr);
  if (this._isBuyPrice(theirOrder.price)) {
     // they have bought base (using the Cntr they already paid when creating the order)
     this._creditFundsBase(theirOrder.client, matchBase);
  } else {
    // they have bought Cntr (using the base they already paid when creating the order)
     this._creditFundsCntr(theirOrder.client, matchCntr);
  }
  let theirStillRemainingBase = theirOrder.sizeBase.minus(theirOrder.executedBase);
  if (theirStillRemainingBase.lt(this.baseMinRemainingSize)) {
    this._refundUnmatchedAndFinish(theirOrder, 'Done', 'None');
    this._raiseEvent({
      eventType: 'MarketOrderEvent',
      orderId: theirOrder.orderId,
      marketOrderEventType: 'CompleteFill',
      price: theirOrder.price,
      depthBase: matchBase.add(theirStillRemainingBase),
      tradeBase: matchBase
    });
  } else {
    this._raiseEvent({
      eventType: 'MarketOrderEvent',
      orderId: theirOrder.orderId,
      marketOrderEventType: 'PartialFill',
      price: theirOrder.price,
      depthBase: matchBase,
      tradeBase: matchBase
    });
  }
};

ReferenceExchange.prototype._priceRange = function(priceStart, priceEnd)  {
  var splitPriceStart = this._splitPrice(priceStart);
  var splitPriceEnd = this._splitPrice(priceEnd);
  var prices = [];
  if (splitPriceStart[0] !== splitPriceEnd[0]) {
    throw new Error('mixed directions not supported');
  }
  var e, mStart, mEnd, m;
  if (splitPriceStart[0] === 'Buy') {
    for (e = splitPriceStart[2]; e >= splitPriceEnd[2]; e--) {
      mStart = 999;
      mEnd = 100;
      if (e === splitPriceStart[2]) {
        mStart = splitPriceStart[1];
      }
      if (e === splitPriceEnd[2]) {
        mEnd = splitPriceEnd[1];
      }
      for (m = mStart; m >= mEnd; m--) {
        prices.push(this._makePrice(splitPriceStart[0], m, e));
      }
    }
  } else if (splitPriceStart[0] === 'Sell') {
    for (e = splitPriceStart[2]; e <= splitPriceEnd[2]; e++) {
      mStart = 100;
      mEnd = 999;
      if (e === splitPriceStart[2]) {
        mStart = splitPriceStart[1];
      }
      if (e === splitPriceEnd[2]) {
        mEnd = splitPriceEnd[1];
      }
      for (m = mStart; m <= mEnd; m++) {
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
  this._raiseEvent({
    eventType: 'MarketOrderEvent',
    orderId: order.orderId,
    marketOrderEventType: 'Add',
    price: order.price,
    depthBase: order.sizeBase.minus(order.executedBase),
    tradeBase: this.bigZero
  });
};
