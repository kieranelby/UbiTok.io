import UbiTokTypes from "ubi-lib/ubi-tok-types.js";
import ReferenceExchange from "ubi-lib/reference-exchange.js";
let BigNumber = UbiTokTypes.BigNumber;

class DemoBridge {

  // bookInfo and targetNetworkInfo are as in UbiBooks ...
  constructor(bookInfo, targetNetworkInfo) {

    if (targetNetworkInfo.networkId !== "demo") {
      throw new Error("demo bridge only works on demo network");
    }
    
    this.bookInfo = bookInfo;
    this.targetNetworkInfo = targetNetworkInfo;

    this.statusSubscribers = [];
    this.futureMarketEventSubscribers = [];

    this.chosenAccount = "0xDemoAccount1";
    this.blockNumber = 1000000;
    this.txnCounter = 0;

    this.rx = new ReferenceExchange();
    this.rxQueue = [];

    // TODO - set up simulated market history
    // TODO - set up simulated market actors
    let actorAccount = '0xDemoActor1';
    this.rx.depositBaseForTesting(actorAccount, UbiTokTypes.encodeBaseAmount("10000"));
    this.rx.depositCntrForTesting(actorAccount, UbiTokTypes.encodeCntrAmount("1000"));
    this.rx.createOrder(
      actorAccount,
      UbiTokTypes.generateDecodedOrderId(),
      "Buy @ 0.0120",
      UbiTokTypes.encodeBaseAmount("1000"),
      "MakerOnly",
      0
    );
    this.rx.createOrder(
      actorAccount,
      UbiTokTypes.generateDecodedOrderId(),
      "Sell @ 0.0175",
      UbiTokTypes.encodeBaseAmount("2000"),
      "MakerOnly",
      0
    );
    this.rx.collectEvents();
    
    this.rx.depositBaseForTesting(this.chosenAccount, UbiTokTypes.encodeBaseAmount("10000"));
    this.rx.depositCntrForTesting(this.chosenAccount, UbiTokTypes.encodeCntrAmount("1000"));

    window.setInterval(this._mineQueue, 5000);
    window.setTimeout(this._pollStatus, 1000);
  }

  _mineQueue = () => {
    this.blockNumber++;
    let errors = [];
    for (let txn of this.rxQueue) {
      try {
        txn.invokeFn();
      } catch (e) {
        // TODO - txn failures
        errors.push(e);
      }
      try {
        txn.callback(undefined, {event:"Mined"});
      } catch (e) {
        errors.push(e);
      }
    }
    this.rxQueue = [];
    for (let delayedError of errors) {
      throw delayedError;
    }
    let events = this.rx.collectEvents();
    let logIndex = 0;
    for (let event of events) {
      event.blockNumber = this.blockNumber;
      event.logIndex = logIndex++;
      if (event.eventType === "MarketOrderEvent") {
        this._deliverFutureMarketEvent(event);
      }
    }
  }

  _queueTxn = (invokeFn, txnObj, callback) => {
    // TODO - txns, callbacks, etc
    this.rxQueue.push({
      invokeFn: invokeFn,
      txnObj: txnObj,
      callback: callback
    });
    this.txnCounter++;
    this._scheduleConfirmTxn(() => {
      callback(undefined, {event: "GotTxnHash", txnHash: "0xDemoTxn" + this.txnCounter});
    });
  }

  _scheduleConfirmTxn = (invokeFn) => {
    window.setTimeout(invokeFn, 2000);
  }

  _scheduleRead = (invokeFn) => {
    window.setTimeout(invokeFn, 500);
  }

  // Used to initialise our page before polling starts.
  // TODO - document status format.
  getInitialStatus = () => {
    return {
      web3Present: false,
      chosenSupportedNetworkName: undefined,
      targetNetworkName: this.targetNetworkInfo.name,
      unsupportedNetwork: false,
      networkChanged: false,
      chosenAccount: undefined,
      accountLocked: false,
      accountChanged: false,
      canMakePublicCalls: false,
      canMakeAccountCalls: false,
      withinGracePeriod: true
    };
  }

  _pollStatus = () => {
    let status = this.getUpdatedStatus();
    for (let subscriber of this.statusSubscribers) {
      subscriber(undefined, status);
    }
    window.setTimeout(this._pollStatus, 1000);
  }

  getUpdatedStatus = () => {
    return {
      web3Present: true,
      unsupportedNetwork: false,
      chosenSupportedNetworkName: this.targetNetworkInfo.name,
      targetNetworkName: this.targetNetworkInfo.name,
      networkChanged: false,
      chosenAccount: this.chosenAccount,
      accountLocked: false,
      accountChanged: false,
      canMakePublicCalls: true,
      canMakeAccountCalls: true,
      withinGracePeriod: false
    };
  }

  // Request periodic callbacks with latest bridge status.
  // Callback fn should take (error, result) where result is as getInitialStatus().
  // Returns nothing useful.
  subscribeStatus = (callback) => {
    this.statusSubscribers.push(callback);
  }

  // Check if the bridge currently appears able to make public (constant, no account needed) calls.
  // Returns boolean immediately; if callbackIfNot given it will be invoked with an error.
  checkCanMakePublicCalls = (callbackIfNot) => {
    return true;
  }

  // Check if the bridge currently appears able to make account-related calls.
  // Returns boolean immediately; if callbackIfNot given it will be invoked with an error.
  checkCanMakeAccountCalls = (callbackIfNot) => {
    return true;
  }

  // Request callback with client's balances (if available).
  // Callback fn should take (error, result) where result is an object
  // containing zero or more of the following formatted balances:
  //   exchangeBase
  //   exchangeCntr
  //   exchangeRwrd
  //   approvedBase
  //   approvedRwrd
  //   ownBase
  //   ownCntr
  //   ownRwrd
  // The callback may be invoked more than once with different subsets.
  // Returns nothing useful.
  getBalances = (callback) => {
    this._scheduleRead(() => {
      const rawBalances = this.rx.getClientBalances(this.chosenAccount);
      const fmtBalances = UbiTokTypes.decodeClientBalances(rawBalances);
      // the off-book eth balance is an oddity
      fmtBalances.ownCntr = UbiTokTypes.decodeCntrAmount(this.rx.getOwnCntrBalance(this.chosenAccount));
      callback(undefined, fmtBalances);
    });
  }

  // Submit a base deposit approval for given friendly base amount.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitDepositBaseApprove = (fmtAmount, callback) => {
    // TODO
  }

  // Submit a base deposit collection.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitDepositBaseCollect = (callback) => {
    // TODO
  }

  // Submit a base withdrawal.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitWithdrawBaseTransfer = (fmtAmount, callback) => {
    // TODO
  }

  // Submit a counter deposit for given friendly amount.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitDepositCntr = (fmtAmount, callback) => {
    // TODO
  }

  // Submit a counter withdrawal for given friendly amount.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitWithdrawCntr = (fmtAmount, callback) => {
    // TODO
  }
  
  // Used to build a snapshot of the order book.
  // Thin wrapper over the contract walkBook - it's quite hard to explain (TODO)
  // Returns nothing useful.
  walkBook = (fromPricePacked, callback) => {
    this._scheduleRead(() => {
      const rawResult = this.rx.walkBook(UbiTokTypes.decodePrice(fromPricePacked));
      callback(undefined, [
        new BigNumber(UbiTokTypes.encodePrice(rawResult[0])),
        rawResult[1],
        rawResult[2],
        new BigNumber(this.blockNumber)
      ]);
    });
  }

  // Request a callback with the client's newest order or previous order before the given order.
  // Callback fn should take (error, result) - where result is as passed INTO UbiTokTypes.decodeWalkClientOrder.
  // Call with undefined maybeLastOrderId to get newest order, or with the orderId from
  // the last callback to walk through. If no order found, orderId returned will be invalid.
  // Skips closed orders if they're too old.
  // Returns nothing useful.
  walkMyOrders = (maybeLastOrderId, callback) => {
    // TODO - should we bother implementing this? Or just pretend we have none?
    this._scheduleRead(() => {
      callback(undefined, [
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0)
      ]);
    });
  }
  
  // Submit a request to create an order.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitCreateOrder = (fmtOrderId, fmtPrice, fmtSizeBase, fmtTerms, maxMatches, callback) => {
    let gasAmount = 300000 + 100000 * maxMatches;
    this._queueTxn(() => {
      this.rx.createOrder(
        this.chosenAccount,
        fmtOrderId,
        fmtPrice,
        UbiTokTypes.encodeBaseAmount(fmtSizeBase),
        fmtTerms,
        maxMatches
      );
    }, {gas: gasAmount}, callback);
  }

  // Submit a request to continue an order.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitContinueOrder = (fmtOrderId, maxMatches, callback) => {
    let gasAmount = 150000 + 100000 * maxMatches;
    this._queueTxn(() => {
      this.rx.continueOrder(
        this.chosenAccount,
        fmtOrderId,
        maxMatches
      );
    }, {gas: gasAmount}, callback);
  }

  // Submit a request to cancel an order.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitCancelOrder = (fmtOrderId, callback) => {
    this._queueTxn(() => {
      this.rx.cancelOrder(
        this.chosenAccount,
        fmtOrderId
      );
    }, {}, callback);
  }

  // Request a callback with the state of the given order.
  // Callback fn should take (error, result) where result is as UbiTokTypes.decodeOrderState.
  // Returns nothing useful.
  getOrderState = (fmtOrderId, callback) => {
    this._scheduleRead(() => {
      const refOrder = this.rx.getOrder(fmtOrderId);
      const fmtOrder = {
        orderId: refOrder.orderId,
        status: refOrder.status,
        reasonCode: refOrder.reasonCode,
        rawExecutedBase: refOrder.executedBase,
        rawExecutedCntr: refOrder.executedCntr,
        rawFees: refOrder.fees
      };
      callback(undefined, fmtOrder);
    });
  }

  // Subscribe to receive a callback whenever a market event occurs.
  // Callback fn should take (error, result) where result is as UbiTokTypes.decodeMarketOrderEvent.
  // Returns nothing useful.
  subscribeFutureMarketEvents = (callback) => {
    this.futureMarketEventSubscribers.push(callback);
  }

  _deliverFutureMarketEvent = (refEvent) => {
    let fmtEvent = {
      blockNumber: refEvent.blockNumber,
      logIndex: refEvent.logIndex,
      eventRemoved: false,
      eventTimestamp: new Date(), // TODO - virtualize
      marketOrderEventType: refEvent.marketOrderEventType,
      orderId: refEvent.orderId,
      pricePacked: UbiTokTypes.encodePrice(refEvent.price),
      rawDepthBase: refEvent.depthBase,
      rawTradeBase: refEvent.tradeBase
    };
    for (let observer of this.futureMarketEventSubscribers) {
      observer(undefined, fmtEvent);
    }
  }

  // Request a callback with market events that occurred before the bridge connected.
  // Callback fn should take (error, result) where result is an array of
  // elements as returned by UbiTokTypes.decodeMarketOrderEvent.
  // Returns nothing useful.
  getHistoricMarketEvents = (callback) => {
    // TODO - should we bother implementing this?
    // Perhaps by running through events in contract at time
    // of bridge creation? Maybe assigning made up dates? Hmm.
    this._scheduleRead(() => {
      callback(undefined, []);
    });
  }

}

export { DemoBridge as default };