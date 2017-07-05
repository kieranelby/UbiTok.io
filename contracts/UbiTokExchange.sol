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
    Unmatched,
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
    uint128 clientPrevOrderId;
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
  
  event Debug(string message, address client, uint amount);

  event ClientOrderCreated(address indexed client, uint128 orderId);

  enum MarketOrderEventType {
    Add,
    Remove,
    Trade
  }

  event MarketOrderEvent(MarketOrderEventType marketOrderEventType, uint128 orderId, uint16 pricePacked, uint amountBase);
  
  int8 public minimumPriceExponent = -6;
  
  string public baseTradableSymbol = 'UBI';
  uint public baseTradableDisplayDecimals = 18;
  TradableType public baseTradableType = TradableType.ERC20;
  uint public baseMinInitialSize = 100; // yes, far too small - testing only!
  uint public baseMinRemainingSize = 10;

  string public quotedTradableSymbol = 'ETH';
  uint public quotedTradableDisplayDecimals = 18;
  TradableType public quotedTradableType = TradableType.Ether;
  uint public quotedMinInitialSize = 10000; // yes, far too small - testing only!
  uint public quotedMinRemainingSize = 1000;

  mapping (address => uint) balanceBaseForClient;
  mapping (address => uint) balanceQuotedForClient;
  
  mapping (uint128 => Order) orderForOrderId;
  
  // Effectively a compact mapping from uint16 pricePacked to bool occupied.
  // See explanation of our price packing above the packPrice function as to why 85.
  // By occupied we mean "a chain of one or more open orders currently exist at this price level".

  uint256[85] occupiedPricePackedBitmaps;

  // These allow us to walk over the orders in the book at a given price level (and add more).

  mapping (uint16 => OrderChain) orderChainForOccupiedPricePacked;
  mapping (uint128 => OrderChainNode)  orderChainNodeForOpenOrderId;

  // These allow a client to (reasonably) efficiently find their own orders
  // without relying on events (which even indexed are a bit expensive to search
  // through months of blocks).

  mapping (address => uint128) public mostRecentOrderIdForClient;
  mapping (uint128 => uint128) clientPreviousOrderIdBeforeOrderId;

  function UbiTokExchange() {
  }
  
  // Public Funds View.
  //
  function getClientBalances(address client) public constant returns (uint balanceBase, uint balanceQuoted) {
    return (balanceBaseForClient[client], balanceQuotedForClient[client]);
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
  function getOrder(uint128 orderId) public constant returns (address client, uint16 pricePacked, uint sizeBase, Terms terms, uint128 clientPrevOrderId) {
    Order order = orderForOrderId[orderId];
    return (order.client, order.pricePacked, order.sizeBase, order.terms, order.clientPrevOrderId);
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
  //   exponent - ranges from minimumPriceExponent to minimumPriceExponent + 11
  //              (e.g. -6 to +5 for a typical pair where minimumPriceExponent = -6)
  //
  // The packed representation has 32001 different price values:
  //
  //      0  = invalid (can be used as marker value)
  //      1  = buy at maximum price (0.999 * 10 ** 9)
  //    ...  = other buy prices in descending order
  //  10800  = buy at minimum price (0.100 * 10 ** -8)
  //  10801  = sell at minimum price (0.100 * 10 ** -8)
  //    ...  = other sell prices in descending order
  //  21600  = sell at maximum price (0.999 * 10 ** 9)
  //  21601+ = do not use
  //
  // If we want to map each packed price to a boolean value (which we do),
  // we require 85 256-bit words. Or 42.5 for each side of the book.
  
  uint constant invalidPricePacked = 0;
  uint constant maxBuyPricePacked = 1;
  uint constant minBuyPricePacked = 10800;
  uint constant minSellPricePacked = 10801;
  uint constant maxSellPricePacked = 21600;
  
  // Public Price Calculation.
  //
  function packPrice(Direction direction, uint16 mantissa, int8 exponent) public constant returns (uint16) {
    if (direction == Direction.Invalid) {
      return 0;
    }
    if (exponent < minimumPriceExponent || exponent > minimumPriceExponent + 11) {
      return 0;
    }
    if (mantissa < 100 || mantissa > 999) {
      return 0;
    }
    uint zeroBasedExponent = uint(exponent - minimumPriceExponent);
    uint zeroBasedMantissa = uint(mantissa - 100);
    uint priceIndex = zeroBasedExponent * 900 + zeroBasedMantissa;
    uint sidedPriceIndex = (direction == Direction.Buy) ? minBuyPricePacked - priceIndex : minSellPricePacked + priceIndex;
    return uint16(sidedPriceIndex);
  }

  // Public Price Calculation.
  //
  function unpackPrice(uint16 pricePacked) public constant returns (Direction direction, uint16 mantissa, int8 exponent) {
    uint sidedPriceIndex = uint(pricePacked);
    uint priceIndex;
    if (sidedPriceIndex < 1 || sidedPriceIndex > maxSellPricePacked) {
      direction = Direction.Invalid;
      mantissa = 0;
      exponent = 0;
      return;
    } else if (sidedPriceIndex <= minBuyPricePacked) {
      direction = Direction.Buy;
      priceIndex = minBuyPricePacked - sidedPriceIndex;
    } else {
      direction = Direction.Sell;
      priceIndex = sidedPriceIndex - minSellPricePacked;
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
    ClientOrderCreated(client, orderId);
    uint128 previousMostRecentOrderIdForClient = mostRecentOrderIdForClient[client];
    orderForOrderId[orderId] = Order(client, pricePacked, sizeBase, terms, previousMostRecentOrderIdForClient, Status.Unknown, CancelOrRejectReason.None, 0, 0);
    mostRecentOrderIdForClient[client] = orderId;
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
        Debug("taker got base", order.client, (order.executedBase - ourOriginalExecutedBase));
        balanceBaseForClient[order.client] += (order.executedBase - ourOriginalExecutedBase);
      } else {
        Debug("taker got quoted", order.client, (order.executedQuoted - ourOriginalExecutedQuoted));
        balanceQuotedForClient[order.client] += (order.executedQuoted - ourOriginalExecutedQuoted);
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
        refundUnmatchedAndFinish(orderId, Status.Done, CancelOrRejectReason.Unmatched);
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
    bool theirsDead = recordTheirMatch(theirOrder, theirOrderId, theirPricePacked, matchBase, matchQuoted);
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
  function recordTheirMatch(Order storage theirOrder, uint128 theirOrderId, uint16 theirPricePacked, uint matchBase, uint matchQuoted) internal returns (bool theirsDead) {
    theirOrder.executedBase += matchBase;
    theirOrder.executedQuoted += matchQuoted;
    MarketOrderEvent(MarketOrderEventType.Trade, theirOrderId, theirPricePacked, matchBase);
    if (isBuyPrice(theirPricePacked)) {
      // they have bought base (using the quoted they already paid when creating the order)
      Debug("maker got base", theirOrder.client, matchBase);
      balanceBaseForClient[theirOrder.client] += matchBase;
    } else {
      // they have bought quoted (using the base they already paid when creating the order)
      Debug("maker got quoted", theirOrder.client, matchQuoted);
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
    MarketOrderEvent(MarketOrderEventType.Add, orderId, pricePacked, order.sizeBase - order.executedBase);
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

  // Intended for public book depth enumeration from web3 (or similar).
  // Not suitable for use from a smart contract transaction - gas usage
  // could be very high if we have many orders at the same price.
  //
  // Start at the given price (and side) and walk down the book (getting
  // less aggressive) until we find some open orders or reach the least
  // aggressive price.
  //
  // Returns the price where we found the order(s), the depth at that
  // price (zero if none found), and the current blockNumber.
  //
  // (The blockNumber is handy if you're taking a snapshot which you intend
  //  to keep up-to-date with the market order events).
  //
  // To walk the book, the caller should start by calling walkBook with the
  // most aggressive buy price. If the price returned is the least aggressive
  // buy price, the side is complete. Otherwise, call walkBook again with the
  // price returned + 1. Then repeat for the sell side.
  //
  function walkBook(uint16 fromPricePacked) public constant returns (uint16 pricePacked, uint depthBase, uint blockNumber) {
    var (direction,) = unpackPrice(fromPricePacked); // TODO - inefficient
    if (direction == Direction.Invalid) {
      return (0, 0, 0);
    }
    uint pricePackedStart = fromPricePacked;
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
          pricePacked = uint16(bmi * 256 + bti);
          return (pricePacked, sumDepth(orderChainForOccupiedPricePacked[pricePacked].firstOrderId), block.number);
        }
        bti += 1;
        wbm /= 2;
      }
    }
    while (bti <= btiEnd && wbm != 0) {
      if ((wbm & 1) != 0) {
        // careful - copy-pasted in above loop
        pricePacked = uint16(bmi * 256 + bti);
        return (pricePacked, sumDepth(orderChainForOccupiedPricePacked[pricePacked].firstOrderId), block.number);
      }
      bti += 1;
      wbm /= 2;
    }
    return (uint16(pricePackedEnd), 0, block.number);
  }

  // See walkBook - adds up open depth at a price starting from an order which is assumed to be open.
  //
  function sumDepth(uint128 orderId) internal constant returns (uint depth) {
    depth = 0;
    while (true) {
      Order order = orderForOrderId[orderId];
      depth += order.sizeBase - order.executedBase;
      orderId = orderChainNodeForOpenOrderId[orderId].nextOrderId;
      if (orderId == 0) {
        return;
      }
    }
  }
  
}
