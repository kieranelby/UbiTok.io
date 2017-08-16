// Helper to build up an order book.

import UbiTokTypes from "ubi-lib/ubi-tok-types.js";
let BigNumber = UbiTokTypes.BigNumber;

class BookBuilder {

  constructor(bridge, subscriberFn) {
    this._bridge = bridge;
    this._subscriberFn = subscriberFn;
    this.isComplete = false;
    this._internalBook = new Map();
    this._queuedMarketEvents = [];
    this._bigZero = new BigNumber(0);
  }

  start = () => {
    this._internalBook.clear();
    this._bridge.subscribeFutureMarketEvents(this._handleFutureMarketEvent);
    this._bridge.walkBook(1, this._handleWalkBook);
  }

  _handleWalkBook = (error, result) => {
    if (error) {
      this._subscriberFn(error, undefined);
      return;
    }
    var pricePacked = result[0].toNumber();
    var depth = result[1]; // use BigNumber - don't want precision loss
    var nextPricePacked;
    var done = false;
    if (!depth.isZero()) {
      this._internalBook.set(pricePacked, {
        count: result[2].toNumber(),
        depth: depth,
        blockNumber: result[3].toNumber(),
        // any events we get must be in newer blocks
        isBlockComplete: true
      });
      if (pricePacked === UbiTokTypes.minSellPricePacked) {
        done = true;
      } else {
        nextPricePacked = pricePacked + 1;
      }
    } else {
      if (pricePacked <= UbiTokTypes.minBuyPricePacked) {
        nextPricePacked = UbiTokTypes.minSellPricePacked;
      } else {
        done = true;
      }
    }
    if (!done) {
      this._bridge.walkBook(nextPricePacked, this._handleWalkBook);
    } else {
      this._endWalkBook();
    }
  }

  _endWalkBook = () => {
    this.isComplete = true;
    this._consumeQueuedMarketEvents();
  }

  getNiceBook = () => {
    let bids = [];
    let asks = [];
    let sortedPairs = Array.from(this._internalBook.entries())
      .filter((a) => a[1].count > 0)
      .sort((a,b) => a[0]-b[0]);
    for (let pair of sortedPairs) {
      let pricePacked = pair[0];
      let entry = pair[1];
      let friendlyDepth = UbiTokTypes.decodeBaseAmount(entry.depth);
      let price = UbiTokTypes.decodePrice(pricePacked);
      let niceEntry = [price, friendlyDepth, entry.count];
      if (pricePacked <= UbiTokTypes.minBuyPricePacked) {
        bids.push(niceEntry);
      } else {
        asks.push(niceEntry);
      }
    }
    asks.reverse();
    return [bids, asks];
  }

  estimateMatches = (fmtPrice, fmtSizeBase) => {
    let ourRawPrice = UbiTokTypes.encodePrice(fmtPrice);
    if (ourRawPrice === UbiTokTypes.invalidPricePacked) {
      return 0;
    }
    // most generous first, only opposite side
    let sortedPairs = fmtPrice.startsWith('Buy') ? (
      Array.from(this._internalBook.entries())
        .filter((a) => a[0] >= UbiTokTypes.minSellPricePacked && a[1].count > 0)
        .sort((a,b) => a[0]-b[0])
    ) : (
      Array.from(this._internalBook.entries())
      // yes, less than minBuyPricePacked looks a bit wrong but it isn't
      .filter((a) => a[0] <= UbiTokTypes.minBuyPricePacked && a[1].count > 0)
        .sort((a,b) => a[0]-b[0])
    );
    let ourRawDepthRemaining = UbiTokTypes.encodeBaseAmount(fmtSizeBase);
    let ourOppositeRawPrice = UbiTokTypes.oppositeEncodedPrice(ourRawPrice);
    let matches = 0;
    for (let pair of sortedPairs) {
      let theirRawPrice = pair[0];
      let theirRawDepth = pair[1].depth;
      if (ourRawDepthRemaining.lte(0)) {
        break;
      }
      if (theirRawPrice > ourOppositeRawPrice) {
        break;
      }
      matches++;
      ourRawDepthRemaining = ourRawDepthRemaining.minus(theirRawDepth);
    }
    return matches;
  }

  _handleFutureMarketEvent = (error, event) => {
    if (error) {
      this._subscriberFn(error, undefined);
      return;
    }
    this._queuedMarketEvents.push(event);
    this._consumeQueuedMarketEvents();
  }

  _consumeQueuedMarketEvents = () => {
    if (!this.isComplete) {
      return;
    }
    for (let event of this._queuedMarketEvents) {
      this.updateInternalBookFromEvent(event);
    }
    this._queuedMarketEvents = [];
    this._subscriberFn(undefined, 'Update');
  }

  updateInternalBookFromEvent = (event) => {
    let entry = this._internalBook.has(event.pricePacked) ? this._internalBook.get(event.pricePacked) : {
      count: 0,
      depth: this._bigZero,
      blockNumber: 0,
      isBlockComplete: false
    };
    // this is a bit nasty, if the entry has come from walkBook we must ignore
    // events that have same block number since they are duplicates,
    // but if the entry is from another event then we allow same block number since
    // there can be multiple events in same block (and hopefully web3 won't give us duplicates!)
    if (event.blockNumber > entry.blockNumber || (event.blockNumber === entry.blockNumber && !entry.isBlockComplete)) {
      entry.blockNumber = event.blockNumber;
      entry.isBlockComplete = false;
      if (event.marketOrderEventType === "Add") {
        entry.count = entry.count + 1;
        entry.depth = entry.depth.add(event.rawDepthBase);
      } else if ( event.marketOrderEventType === "Remove" ||
                  event.marketOrderEventType === "PartialFill" ||
                  event.marketOrderEventType === "CompleteFill" ) {
        entry.depth = entry.depth.minus(event.rawDepthBase);
        if (event.marketOrderEventType !== "PartialFill") {
          entry.count = entry.count - 1;
        }
        if (entry.depth.lt(this._bigZero)) {
          // should not happen but let's not embarass ourselves if it does
          entry.depth = this._bigZero;
        }
        if (entry.count < 1) {
          // should not be needed but let's not embarass ourselves if it does
          entry.count = 0;
          entry.depth = this._bigZero;
        }
      }
    }
    this._internalBook.set(event.pricePacked, entry);
  }

}

export default BookBuilder;