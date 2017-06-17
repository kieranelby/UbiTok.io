pragma solidity ^0.4.4;

contract UbiTokExchange {

  enum TradableType {
    Ether,
    ERC20
  }

  enum Direction {
    Invalid,
    Buy,
    Sell
  }

  enum Status {
    Unknown,
    Rejected,
    Open,
    Done
  }

  enum CancelOrRejectReason {
    None,
    InvalidPrice,
    InvalidSize,
    InsufficientFunds,
    WouldTake,
    WouldEnter,
    TooManyMatches,
    ClientCancel
  }

  enum Terms {
    GoodTillCancel,
    ImmediateOrCancel,
    MakerOnly
  }
  
  struct Order {
    address client;
    uint16 pricePacked;
    uint sizeBase;
    Terms terms;
    Status status;
    CancelOrRejectReason cancelOrRejectReason;
    uint executedBase;
    uint executedQuoted;
  }
  
  struct OrderChain {
    uint128 firstOrderId;
    uint128 lastOrderId;
  }

  struct OrderChainNode {
    uint128 nextOrderId;
    uint128 prevOrderId;
  }
  
  event Debug(string message);
  
  int8 public minimumPriceExponent = -8;
  
  string public baseTradableSymbol = 'UBI';
  uint public baseTradableDisplayDecimals = 18;
  TradableType public baseTradableType = TradableType.ERC20;
  uint public baseMinInitialSize = 10 szabo;
  uint public baseMinRemainingSize = 1 szabo;

  string public quotedTradableSymbol = 'ETH';
  uint public quotedTradableDisplayDecimals = 18;
  TradableType public quotedTradableType = TradableType.Ether;
  uint public quotedMinInitialSize = 10 finney;
  uint public quotedMinRemainingSize = 1 finney;

  mapping (address => uint) public balanceBaseForClient;
  mapping (address => uint) public balanceQuotedForClient;
  
  mapping (uint128 => Order) orderForOrderId;
  
  // Effectively a compact mapping from uint16 pricePacked to bool occupied.
  // See explanation of our price packing above the packPrice function as to why 127.
  // By occupied we mean "a chain of one or more open orders currently exist at this price level".

  uint256[127] occupiedPricePackedBitmaps;

  // These allow us to walk over the orders in the book at a given price level (and add more).

  mapping (uint16 => OrderChain) orderChainForOccupiedPricePacked;
  mapping (uint128 => OrderChainNode)  orderChainNodeForOpenOrderId;

  function UbiTokExchange() {
  }
  
  // Public Funds Manipulation.
  //
  function depositBaseForTesting(address client, uint amountBase) public {
    balanceBaseForClient[client] += amountBase;
  }

  // Public Funds Manipulation.
  //
  function depositQuotedForTesting(address client, uint amountQuoted) public {
    balanceQuotedForClient[client] += amountQuoted;
  }

  // Public Order View.
  //
  function getOrder(uint128 orderId) public constant returns (address client, uint16 pricePacked, uint sizeBase, Terms terms) {
    Order order = orderForOrderId[orderId];
    return (order.client, order.pricePacked, order.sizeBase, order.terms);
  }

  // Public Order View.
  //
  function getOrderState(uint128 orderId) public constant returns (Status status, CancelOrRejectReason cancelOrRejectReason, uint executedBase, uint executedQuoted) {
    Order order = orderForOrderId[orderId];
    return (order.status, order.cancelOrRejectReason, order.executedBase, order.executedQuoted);
  }
  
  // We pack direction and price into a crafty decimal floating point representation
  // for efficient indexing by price, the main thing we lose by doing so is precision -
  // we only have 3 significant figures in our prices.
  //
  // An unpacked price consists of:
  //
  //   direction - invalid / buy / sell
  //   mantissa - ranges from 100 to 999 representing 0.100 to 0.999
  //   exponent - ranges from minimumPriceExponent to minimumPriceExponent + 17
  //              (e.g. -8 to +9 for a typical pair where minimumPriceExponent = -8)
  //
  // The packed representation has 32001 different price values:
  //
  //      0  = invalid (can be used as marker value)
  //      1  = buy at maximum price (0.999 * 10 ** 9)
  //    ...  = other buy prices in descending order
  //  16200  = buy at minimum price (0.100 * 10 ** -8)
  //  16201  = sell at minimum price (0.100 * 10 ** -8)
  //    ...  = other sell prices in descending order
  //  32400  = sell at maximum price (0.999 * 10 ** 9)
  //  32401+ = do not use
  //
  // If we want to map each packed price to a boolean value (which we do),
  // we require 127 256-bit words. Or 63.5 for each side of the book.
  //
  // TODO - This is still too expensive, perhaps reduce exponent range to -5 to +6 ..?
  
  uint constant invalidPricePacked = 0;
  uint constant maxBuyPricePacked = 1;
  uint constant minBuyPricePacked = 16200;
  uint constant minSellPricePacked = 16201;
  uint constant maxSellPricePacked = 32400;
  
  // Public Price Calculation.
  //
  function packPrice(Direction direction, uint16 mantissa, int8 exponent) public constant returns (uint16) {
    if (direction == Direction.Invalid) {
      return 0;
    }
    if (exponent < minimumPriceExponent || exponent > minimumPriceExponent + 17) {
      return 0;
    }
    if (mantissa < 100 || mantissa > 999) {
      return 0;
    }
    uint zeroBasedExponent = uint(exponent - minimumPriceExponent);
    uint zeroBasedMantissa = uint(mantissa - 100);
    uint priceIndex = zeroBasedExponent * 900 + zeroBasedMantissa;
    uint sidedPriceIndex = (direction == Direction.Buy) ? 16200 - priceIndex : 16201 + priceIndex;
    return uint16(sidedPriceIndex);
  }

  // Public Price Calculation.
  //
  function unpackPrice(uint16 pricePacked) public constant returns (Direction direction, uint16 mantissa, int8 exponent) {
    uint sidedPriceIndex = uint(pricePacked);
    uint priceIndex;
    if (sidedPriceIndex < 1 || sidedPriceIndex > 32400) {
      direction = Direction.Invalid;
      mantissa = 0;
      exponent = 0;
      return;
    } else if (sidedPriceIndex <= 16200) {
      direction = Direction.Buy;
      priceIndex = 16200 - sidedPriceIndex;
    } else {
      direction = Direction.Sell;
      priceIndex = sidedPriceIndex - 16201;
    }
    uint zeroBasedMantissa = priceIndex % 900;
    uint zeroBasedExponent = priceIndex / 900;
    mantissa = uint16(zeroBasedMantissa + 100);
    exponent = int8(zeroBasedExponent) + minimumPriceExponent;
    return;
  }
  
  // Public Price Calculation.
  //
  function isBuyPrice(uint16 validPricePacked) public constant returns (bool) {
    // TODO - could be much more efficient by keeping in packed form
    var (direction,) = unpackPrice(validPricePacked);
    if (direction == Direction.Buy) {
      return true;
    } else if (direction == Direction.Sell) {
      return false;
    } else {
      throw;
    }
  }
  
  // Public Price Calculation.
  //
  function oppositePackedPrice(uint16 pricePacked) public constant returns (uint16) {
    // TODO - this can be implemented much more efficiently by keeping in packed form
    var (direction, mantissa, exponent) = unpackPrice(pricePacked);
    Direction oppositeDirection;
    if (direction == Direction.Buy) {
      oppositeDirection = Direction.Sell;
    } else if (direction == Direction.Sell) {
      oppositeDirection = Direction.Buy;
    } else {
      oppositeDirection = Direction.Invalid;
    }
    return packPrice(oppositeDirection, mantissa, exponent);
  }
  
  // Public Price Calculation.
  //
  function computeQuotedAmount(uint baseAmount, uint16 mantissa, int8 exponent) public constant returns (uint) {
    // NB: danger of wrap-around overflow if baseAmount ridiculously large
    // NB: danger of truncation to zero if baseAmount too small
    if (exponent < 0) {
      return baseAmount * uint(mantissa) / 1000 / 10 ** uint(-exponent);
    } else {
      return baseAmount * uint(mantissa) / 1000 * 10 ** uint(exponent);
    }
  }

  // Public Price Calculation.
  //
  function computeQuotedAmountUsingPacked(uint baseAmount, uint16 pricePacked) public constant returns (uint) {
    // NB: danger of wrap-around overflow if baseAmount ridiculously large
    // NB: danger of truncation to zero if baseAmount too small
    var (, mantissa, exponent) = unpackPrice(pricePacked);
    return computeQuotedAmount(baseAmount, mantissa, exponent);
  }
  
  // Public Order Placement.
  //
  //
  function createOrder(uint128 orderId, uint16 pricePacked, uint sizeBase, Terms terms) public {
    address client = msg.sender;
    if (client == 0 || orderId == 0 || orderForOrderId[orderId].client != 0) {
      // Can't return graceful error here - nowhere to store the reject reason.
      throw;
    }
    orderForOrderId[orderId] = Order(client, pricePacked, sizeBase, terms, Status.Unknown, CancelOrRejectReason.None, 0, 0);
    Order order = orderForOrderId[orderId];
    var (direction, mantissa, exponent) = unpackPrice(pricePacked);
    if (direction == Direction.Invalid) {
      order.status = Status.Rejected;
      order.cancelOrRejectReason = CancelOrRejectReason.InvalidPrice;
      return;
    }
    if (sizeBase < baseMinInitialSize || sizeBase > 2 ** 127) {
      order.status = Status.Rejected;
      order.cancelOrRejectReason = CancelOrRejectReason.InvalidSize;
      return;
    }
    uint sizeQuoted = computeQuotedAmount(sizeBase, mantissa, exponent);
    if (sizeQuoted < quotedMinInitialSize || sizeQuoted > 2 ** 127) {
      order.status = Status.Rejected;
      order.cancelOrRejectReason = CancelOrRejectReason.InvalidSize;
      return;
    }
    if (!debitFunds(client, direction, sizeBase, sizeQuoted)) {
      order.status = Status.Rejected;
      order.cancelOrRejectReason = CancelOrRejectReason.InsufficientFunds;
      return;
    }
    processOrder(orderId);
  }

  //
  //
  //
  function processOrder(uint128 orderId) internal {
    Order order = orderForOrderId[orderId];

    uint ourOriginalExecutedBase = order.executedBase;
    uint ourOriginalExecutedQuoted = order.executedQuoted;
    
    var (ourDirection,) = unpackPrice(order.pricePacked);
    uint theirPricePackedStart = (ourDirection == Direction.Buy) ? minSellPricePacked : maxBuyPricePacked;
    uint theirPricePackedEnd = oppositePackedPrice(order.pricePacked);

    uint maxMatches = (order.terms == Terms.MakerOnly) ? 0 : 10; // TODO - tune me (or even choose base on gas? quite unpredicatable tho)
    
    MatchStopReason matchStopReason = matchAgainstBook(orderId, theirPricePackedStart, theirPricePackedEnd, maxMatches);

    if (order.executedBase > ourOriginalExecutedBase) {
      if (isBuyPrice(order.pricePacked)) {
        balanceBaseForClient[order.client] += order.executedBase - ourOriginalExecutedBase;
      } else {
        balanceQuotedForClient[order.client] += order.executedQuoted - ourOriginalExecutedQuoted;
      }
    }

    if (order.terms == Terms.ImmediateOrCancel) {
      if (matchStopReason == MatchStopReason.Satisfied) {
        refundUnmatchedAndFinish(orderId, Status.Done, CancelOrRejectReason.None);
        return;
      } else if (matchStopReason == MatchStopReason.MaxMatches) {
        refundUnmatchedAndFinish(orderId, Status.Done, CancelOrRejectReason.TooManyMatches);
        return;
      } else if (matchStopReason == MatchStopReason.BookExhausted) {
        refundUnmatchedAndFinish(orderId, Status.Done, CancelOrRejectReason.WouldEnter);
        return;
      }
    } else if (order.terms == Terms.MakerOnly) {
      if (matchStopReason == MatchStopReason.MaxMatches) {
        refundUnmatchedAndFinish(orderId, Status.Rejected, CancelOrRejectReason.WouldTake);
        return;
      } else if (matchStopReason == MatchStopReason.BookExhausted) {
        enterOrder(orderId);
        return;
      }
    } else if (order.terms == Terms.GoodTillCancel) {
      if (matchStopReason == MatchStopReason.Satisfied) {
        refundUnmatchedAndFinish(orderId, Status.Done, CancelOrRejectReason.None);
        return;
      } else if (matchStopReason == MatchStopReason.MaxMatches) {
        refundUnmatchedAndFinish(orderId, Status.Done, CancelOrRejectReason.TooManyMatches);
        return;
      } else if (matchStopReason == MatchStopReason.BookExhausted) {
        enterOrder(orderId);
        return;
      }
    }
    throw;
  }
 
  enum MatchStopReason {
    None,
    MaxMatches,
    Satisfied,
    PriceExhausted,
    BookExhausted
  }
 
  // Internal Order Placement.
  //
  // Match the given order against the book.
  //
  // Resting orders matched will be updated, removed from book and funds credited to their owners.
  //
  // Only updates the executedBase and executedQuoted of the given order - caller is responsible
  // for crediting matched funds or marking order as done / entering it into the book.
  //
  function matchAgainstBook(uint128 orderId, uint theirPricePackedStart, uint theirPricePackedEnd, uint maxMatches) internal returns (MatchStopReason matchStopReason) {
    Order order = orderForOrderId[orderId];
    
    uint bmi = theirPricePackedStart / 256;  // index into array of bitmaps
    uint bti = theirPricePackedStart % 256;  // bit position within bitmap
    uint bmiEnd = theirPricePackedEnd / 256; // last bitmap to search
    uint btiEnd = theirPricePackedEnd % 256; // stop at this bit in the last bitmap

    uint cbm = occupiedPricePackedBitmaps[bmi]; // original copy of current bitmap
    uint dbm = cbm; // dirty version of current bitmap where we may have cleared bits
    uint wbm = cbm >> bti; // working copy of current bitmap which we keep shifting
    
    // this is pretty ugly, and pretty unpredicatable in terms of gas
    // (the one plus side is that it's pretty quick in a JS EVM as used for testing
    //  ... oh, and that no-one else has come up with a better matching engine yet!)

    bool removedLastAtPrice;
    matchStopReason = MatchStopReason.None;

    while (bmi < bmiEnd) {
      if (wbm == 0 || bti == 256) {
        if (dbm != cbm) {
          occupiedPricePackedBitmaps[bmi] = dbm;
        }
        bti = 0;
        bmi++;
        cbm = occupiedPricePackedBitmaps[bmi];
        wbm = cbm;
        dbm = cbm;
      } else {
        if ((wbm & 1) != 0) {
          // careful - copy-and-pasted in loop below ...
          (removedLastAtPrice, maxMatches, matchStopReason) = matchWithOccupiedPrice(order, uint16(bmi * 256 + bti), maxMatches);
          if (removedLastAtPrice) {
            dbm ^= 2 ** bti;
          }
          if (matchStopReason == MatchStopReason.PriceExhausted) {
            matchStopReason = MatchStopReason.None;
          } else if (matchStopReason != MatchStopReason.None) {
            break;
          }
        }
        bti += 1;
        wbm /= 2;
      }
    }
    if (matchStopReason == MatchStopReason.None) {
      while (bti <= btiEnd && wbm != 0) {
        if ((wbm & 1) != 0) {
          // careful - copy-and-pasted in loop above ...
          (removedLastAtPrice, maxMatches, matchStopReason) = matchWithOccupiedPrice(order, uint16(bmi * 256 + bti), maxMatches);
          if (removedLastAtPrice) {
            dbm ^= 2 ** bti;
          }
          if (matchStopReason == MatchStopReason.PriceExhausted) {
            matchStopReason = MatchStopReason.None;
          } else if (matchStopReason != MatchStopReason.None) {
            break;
          }
        }
        bti += 1;
        wbm /= 2;
      }
    }
    // careful - have to do this if broke out of first loop with a match stop reason ...
    if (dbm != cbm) {
      occupiedPricePackedBitmaps[bmi] = dbm;
    }
    if (matchStopReason == MatchStopReason.None) {
      matchStopReason = MatchStopReason.BookExhausted;
    }
  }

  // Internal Order Placement.
  //
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
  // Returns:
  //   removedLastAtPrice:
  //     true iff there are no longer any resting orders at this price - caller will need
  //     to update the occupied price bitmap.
  //
  //   matchesLeft:
  //     maxMatches passed in minus the number of matches made by this call
  //
  //   matchStopReason:
  //     If our order is completely matched, matchStopReason will be Satisfied.
  //     If our order is not completely matched, matchStopReason will be either:
  //        MaxMatches (we are not allowed to match any more times)
  //     or:
  //        PriceExhausted (nothing left on the book at this exact price)
  //
  function matchWithOccupiedPrice(Order storage ourOrder, uint16 theirPricePacked, uint maxMatches) internal
           returns (bool removedLastAtPrice, uint matchesLeft, MatchStopReason matchStopReason) {
    matchesLeft = maxMatches;
    uint workingOurExecutedBase = ourOrder.executedBase;
    uint workingOurExecutedQuoted = ourOrder.executedQuoted;
    uint128 theirOrderId = orderChainForOccupiedPricePacked[theirPricePacked].firstOrderId;
    matchStopReason = MatchStopReason.None;
    while (true) {
      if (maxMatches == 0) {
        matchStopReason = MatchStopReason.MaxMatches;
        break;
      }
      uint matchBase;
      uint matchQuoted;
      (theirOrderId, matchBase, matchQuoted, matchStopReason) =
        matchWithTheirs((ourOrder.sizeBase - workingOurExecutedBase), theirOrderId, theirPricePacked);
      workingOurExecutedBase += matchBase;
      workingOurExecutedQuoted += matchQuoted;
      matchesLeft -= 1;
      if (matchStopReason != MatchStopReason.None) {
        break;
      }
    }
    ourOrder.executedBase = workingOurExecutedBase;
    ourOrder.executedQuoted = workingOurExecutedQuoted;
    if (matchStopReason == MatchStopReason.MaxMatches) {
      removedLastAtPrice = false;
    } else {
      if (theirOrderId == 0) {
        orderChainForOccupiedPricePacked[theirPricePacked].firstOrderId = 0;
        orderChainForOccupiedPricePacked[theirPricePacked].lastOrderId = 0;
        removedLastAtPrice = true;
      } else {
        orderChainForOccupiedPricePacked[theirPricePacked].firstOrderId = theirOrderId;
        orderChainNodeForOpenOrderId[theirOrderId].prevOrderId = 0;
        removedLastAtPrice = false;
      }
    }
  }
  
  // Internal Order Placement.
  //
  // Match up to our remaining amount against a resting order in the book.
  //
  // The match (partial or complete) of the resting order is recorded, and their funds are credited.
  //
  // The order is NOT removed from the book by this call - the caller must do that if the
  // nextTheirOrderId returned is not equal to the theirOrderId passed in.
  //
  // Returns:
  //
  //   nextTheirOrderId:
  //     If we did not completely match their order, will be same as theirOrderId.
  //     If we completely matched their order, will be orderId of next order at the
  //     same price - or zero if this was the last order and we've now filled it.
  //
  //   matchStopReason:
  //     If our order is completely matched, matchStopReason will be Satisfied.
  //     If our order is not completely matched, matchStopReason will be either
  //     PriceExhausted (if nothing left at this exact price) or None (if can continue).
  // 
  function matchWithTheirs(uint ourRemainingBase, uint128 theirOrderId, uint16 theirPricePacked) internal
    returns (uint128 nextTheirOrderId, uint matchBase, uint matchQuoted, MatchStopReason matchStopReason) {
    Order theirOrder = orderForOrderId[theirOrderId];
    uint theirRemainingBase = theirOrder.sizeBase - theirOrder.executedBase;
    if (ourRemainingBase < theirRemainingBase) {
      matchBase = ourRemainingBase;
    } else {
      matchBase = theirRemainingBase;
    }
    matchQuoted = computeQuotedAmountUsingPacked(matchBase, theirPricePacked);
    // TODO - dust prevention (need to refund it tho)
    if (matchBase == ourRemainingBase) {
      matchStopReason = MatchStopReason.Satisfied;
    } else {
      matchStopReason = MatchStopReason.None;
    }
    bool theirsDead = recordTheirMatch(theirOrder, theirPricePacked, matchBase, matchQuoted);
    if (theirsDead) {
      nextTheirOrderId = orderChainNodeForOpenOrderId[theirOrderId].nextOrderId;
      if (matchStopReason == MatchStopReason.None && nextTheirOrderId == 0) {
        matchStopReason = MatchStopReason.PriceExhausted;
      }
    } else {
      nextTheirOrderId = theirOrderId;
    }
  }

  // Internal Order Placement.
  //
  // Record match (partial or complete) of resting order, and credit them their funds.
  //
  // If their order is completely matched, the order is marked as done, and "theirsDead" is returned as true.
  //
  // The order is NOT removed from the book by this call - the caller must do that if theirsDead is true.
  //
  // No sanity checks are made - the caller must be sure the order is not already done and has sufficient remaining.
  //
  function recordTheirMatch(Order storage theirOrder, uint16 theirPricePacked, uint matchBase, uint matchQuoted) internal returns (bool theirsDead) {
    theirOrder.executedBase += matchBase;
    theirOrder.executedQuoted += matchQuoted;
    if (isBuyPrice(theirPricePacked)) {
      // they have bought base (using the quoted they already paid when creating the order)
      balanceBaseForClient[theirOrder.client] += matchBase;
    } else {
      // they have bought quoted (using the base they already paid when creating the order)
      balanceQuotedForClient[theirOrder.client] += matchQuoted;
    }
    // TODO - dust prevention (need to refund it tho)
    if (theirOrder.executedBase == theirOrder.sizeBase) {
      theirOrder.status = Status.Done;
      theirOrder.cancelOrRejectReason = CancelOrRejectReason.None;
      return true;
    } else {
      return false;
    }
  }

  // Refund any unmatched funds in an order (based on executed vs size) and move to a final state.
  //
  // The order is NOT removed from the book by this call.
  //
  // No sanity checks are made - the caller must be sure the order has not already been refunded.
  //
  function refundUnmatchedAndFinish(uint128 orderId, Status status, CancelOrRejectReason cancelOrRejectReason) internal {
    Order order = orderForOrderId[orderId];
    if (isBuyPrice(order.pricePacked)) {
      uint sizeQuoted = computeQuotedAmountUsingPacked(order.sizeBase, order.pricePacked);
      balanceQuotedForClient[order.client] += sizeQuoted - order.executedQuoted;
    } else {
      balanceBaseForClient[order.client] += order.sizeBase - order.executedBase;
    }
    order.status = status;
    order.cancelOrRejectReason = cancelOrRejectReason;
  }

  // Internal Order Placement.
  //
  // Enter a not completely matched order into the book, marking the order as open.
  //
  // This updates the occupied price bitmap and chain.
  //
  // No sanity checks are made - the caller must be sure the order has some unmatched amount and has been paid for!
  //
  function enterOrder(uint128 orderId) internal {
    Order order = orderForOrderId[orderId];
    uint16 pricePacked = order.pricePacked;
    OrderChain orderChain = orderChainForOccupiedPricePacked[pricePacked];
    OrderChainNode orderChainNode = orderChainNodeForOpenOrderId[orderId];
    if (orderChain.firstOrderId == 0) {
      orderChain.firstOrderId = orderId;
      orderChain.lastOrderId = orderId;
      orderChainNode.nextOrderId = 0;
      orderChainNode.prevOrderId = 0;
      uint bitmapIndex = pricePacked / 256;
      uint bitIndex = pricePacked % 256;
      occupiedPricePackedBitmaps[bitmapIndex] |= (2 ** bitIndex);
    } else {
      uint128 existingLastOrderId = orderChain.lastOrderId;
      OrderChainNode existingLastOrderChainNode = orderChainNodeForOpenOrderId[existingLastOrderId];
      orderChainNode.nextOrderId = 0;
      orderChainNode.prevOrderId = existingLastOrderId;
      existingLastOrderChainNode.nextOrderId = orderId;
      orderChain.lastOrderId = orderId;
    }
    order.status = Status.Open;
  }

  // Charge the client for the cost of placing an order in the given direction.
  //
  // Return true if successful, false otherwise.
  //
  function debitFunds(address client, Direction direction, uint sizeBase, uint sizeQuoted) internal returns (bool success) {
    if (direction == Direction.Buy) {
      uint availableQuoted = balanceQuotedForClient[client];
      if (availableQuoted < sizeQuoted) {
        return false;
      }
      balanceQuotedForClient[client] = availableQuoted - sizeQuoted;
      return true;
    } else if (direction == Direction.Sell) {
      uint availableBase = balanceBaseForClient[client];
      if (availableBase < sizeBase) {
        return false;
      }
      balanceBaseForClient[client] = availableBase - sizeBase;
      return true;
    } else {
      return false;
    }
  }

  // Intended for public book depth enumeration.
  //
  // Search for the first open order with the given direction in descending
  // order of their aggressiveness, starting at the given price.
  //
  // Returns the order id of the order found, or zero if there are no open orders of the given
  // direction with a price equal to or less aggressive than the given price.
  //
  function findFirstOpenOrderFrom(uint16 pricePacked) public constant returns (uint128 orderId) {
    var (direction,) = unpackPrice(pricePacked);
    uint pricePackedStart = pricePacked;
    uint pricePackedEnd = (direction == Direction.Buy) ? minBuyPricePacked : maxSellPricePacked;
    
    uint bmi = pricePackedStart / 256;
    uint bti = pricePackedStart % 256;
    uint bmiEnd = pricePackedEnd / 256;
    uint btiEnd = pricePackedEnd % 256;

    uint wbm = occupiedPricePackedBitmaps[bmi] >> bti;
    
    while (bmi < bmiEnd) {
      if (wbm == 0 || bti == 256) {
        bti = 0;
        bmi++;
        wbm = occupiedPricePackedBitmaps[bmi];
      } else {
        if ((wbm & 1) != 0) {
          // careful - copy-pasted in below loop
          return orderChainForOccupiedPricePacked[uint16(bmi * 256 + bti)].firstOrderId;
        }
        bti += 1;
        wbm /= 2;
      }
    }
    while (bti <= btiEnd && wbm != 0) {
      if ((wbm & 1) != 0) {
        // careful - copy-pasted in above loop
        return orderChainForOccupiedPricePacked[uint16(bmi * 256 + bti)].firstOrderId;
      }
      bti += 1;
      wbm /= 2;
    }
    return 0;
  }

  // Intended for public book depth enumeration.
  //
  // Find the next (lower priority / newer) open order after the given open order at the same price and direction.
  //
  // Returns either:
  //  isStillOpen = false if the given order is not open (in which case nextOrderId is meaningless).
  //  isStillOpen = true if the given order is open, in which case nextOrderId is the order id of the
  //                next order - or zero if there is no next order at the same price and direction.
  //
  function nextOpenOrderFrom(uint128 orderId) public constant returns (bool isStillOpen, uint128 nextOrderId) {
    Order order = orderForOrderId[orderId];
    if (order.status != Status.Open) {
      return (false, 0);
    }
    return (true, orderChainNodeForOpenOrderId[orderId].nextOrderId);
  }
  
}
