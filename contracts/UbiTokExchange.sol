pragma solidity ^0.4.4;

contract UbiTokExchange {

	enum TradableType {
		ERC20,
		Ether
	}

	enum Direction {
		Invalid,
		Buy,
		Sell
	}

  enum Status {
    Unknown,
    Pending,
    Rejected,
    Open,
    Done
  }

  enum RejectReason {
    None,
    InvalidPrice,
    InvalidSize,
    InsufficientFunds,
    WouldTake
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
    RejectReason rejectReason;
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
	
	int8 public minimumPriceExponent = -8;
	
	string public baseTradableSymbol = 'UBI';
	uint public baseTradableDisplayDecimals = 18;
	TradableType public baseTradableType = TradableType.ERC20;

	string public quotedTradableSymbol = 'ETH';
	uint public quotedTradableDisplayDecimals = 18;
	TradableType public quotedTradableType = TradableType.Ether;
	
	mapping (address => uint) public balanceBaseForClient;
	mapping (address => uint) public balanceQuotedForClient;
	
	mapping (uint128 => Order) orderForOrderId;
	
	// Effectively a compact mapping from uint16 pricePacked to bool occupied.
	// See explanation of our price packing above the packPrice function as to why 127.
	// By occupied we mean "a chain of one or more open orders currently exist at this price level".

	uint256[127] occupiedPricePackedBitmaps;

	// These allow us to walk over the orders in the book at a given price level (and add more).

	mapping (uint16 => OrderChain) orderChainForOccupiedPricePacked;
	mapping (uint128 => OrderChainNode)	orderChainNodeForOpenOrderId;

	function UbiTokExchange() {
	}
	
	function depositBaseForTesting(address client, uint amountBase) public {
		balanceBaseForClient[client] += amountBase;
	}

	function depositQuotedForTesting(address client, uint amountQuoted) public {
		balanceQuotedForClient[client] += amountQuoted;
	}
	
	function getOrder(uint128 orderId) public constant returns (address client, uint16 pricePacked, uint sizeBase, Terms terms) {
		Order order = orderForOrderId[orderId];
		return (order.client, order.pricePacked, order.sizeBase, order.terms);
	}

	function getOrderState(uint128 orderId) returns (Status status, RejectReason rejectReason, uint executedBase, uint executedQuoted) {
		Order order = orderForOrderId[orderId];
		return (order.status, order.rejectReason, order.executedBase, order.executedQuoted);
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
	
	function computeQuotedAmount(uint baseAmount, uint16 mantissa, int8 exponent) public constant returns (uint) {
		// NB: danger of wrap-around overflow if baseAmount rediculously large
		// NB: danger of truncation to zero if baseAmount too small
		if (exponent < 0) {
			return baseAmount * uint(mantissa) / 1000 / 10 ** uint(-exponent);
		} else {
			return baseAmount * uint(mantissa) / 1000 * 10 ** uint(exponent);
		}
	}
	
	function createOrder(uint128 orderId, uint16 pricePacked, uint sizeBase, Terms terms) public {
		address client = msg.sender;
		orderForOrderId[orderId] = Order(client, pricePacked, sizeBase, terms, Status.Unknown, RejectReason.None, 0, 0);
		Order order = orderForOrderId[orderId];
		var (direction, mantissa, exponent) = unpackPrice(pricePacked);
		if (direction == Direction.Invalid) {
			order.status = Status.Rejected;
			order.rejectReason = RejectReason.InvalidPrice;
			return;
		}
		if (sizeBase < 1 || sizeBase > 2 ** 127) {
			order.status = Status.Rejected;
			order.rejectReason = RejectReason.InvalidSize;
			return;
		}
		uint sizeQuoted = computeQuotedAmount(sizeBase, mantissa, exponent);
		// TODO - check sizes not insane (e.g. below some min, not >= 2**127)
		if (!debitFunds(client, direction, sizeBase, sizeQuoted)) {
			order.status = Status.Rejected;
			order.rejectReason = RejectReason.InsufficientFunds;
			return;
		}
		// TODO - start trying to match it ...
		order.status = Status.Open;
	}
	
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
	
}
