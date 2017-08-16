import Web3 from "web3";
import UbiTokTypes from "ubi-lib/ubi-tok-types.js";

class Bridge {

  // bookInfo and targetNetworkInfo are as in UbiBooks ...
  constructor(bookInfo, targetNetworkInfo) {

    this.bookInfo = bookInfo;
    this.targetNetworkInfo = targetNetworkInfo;

    this.web3 = undefined;
    this.chosenSupportedNetworkId = undefined;
    this.chosenSupportedNetworkName = undefined;
    this.chosenAccount = undefined;
    this.initialBlockNumber = undefined;
    this.statusSubscribers = [];
    this.startedConnectingAt = new Date();

    window.setTimeout(this.pollStatus, 1000);
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

  pollStatus = () => {
    let status = this.getUpdatedStatus();
    for (let subscriber of this.statusSubscribers) {
      subscriber(undefined, status);
    }
    window.setTimeout(this.pollStatus, 1000);
  }

  // TODO - this is very yucky
  getUpdatedStatus = () => {
    if (this.web3 === undefined && window.web3) {
      console.log("found web3 provider");
      this.web3 = new Web3(window.web3.currentProvider);
    }
    let web3Present = this.web3 !== undefined && this.web3.hasOwnProperty("version");
    let networkId = undefined;
    try {
      networkId = web3Present ? this.web3.version.network.toString() : undefined;
    } catch (e) {
      // in some web3 versions this seems to throw when the page is being closed?
      // treat as web3 not available yet?
      console.log("problem using web3", e);
    }
    if (networkId === undefined) {
      web3Present = false;
    }
    let unsupportedNetwork = web3Present && networkId !== this.targetNetworkInfo.networkId;
    if (web3Present && this.chosenSupportedNetworkId === undefined && !unsupportedNetwork) {
      console.log("choosing network", networkId);
      this.chosenSupportedNetworkId = networkId;
      this.chosenSupportedNetworkName = this.targetNetworkInfo.name;
      const bookContractAbiArray = this.bookInfo.bookAbiArray;
      let BookContract = this.web3.eth.contract(bookContractAbiArray);
      this.bookContract = BookContract.at(this.bookInfo.bookAddress);
      const baseTokenAbiArray = this.bookInfo.base.abiArray;
      let BaseTokenContract = this.web3.eth.contract(baseTokenAbiArray);
      this.baseToken = BaseTokenContract.at(this.bookInfo.base.address);
      const rwrdTokenAbiArray = this.bookInfo.rwrd.abiArray;
      let RwrdTokenContract = this.web3.eth.contract(rwrdTokenAbiArray);
      this.rwrdToken = RwrdTokenContract.at(this.bookInfo.rwrd.address);
      this.web3.eth.getBlockNumber(this._handleBlockNumber);
    }
    let networkChanged = web3Present && this.chosenSupportedNetworkId !== undefined && networkId !== this.chosenSupportedNetworkId;
    var firstAccount = web3Present ? this.web3.eth.accounts[0] : undefined;
    let accountLocked = web3Present && firstAccount === undefined; // TODO - perhaps check not all zeroes?
    if (web3Present && this.chosenAccount === undefined && !accountLocked) {
      console.log("choosing account", firstAccount);
      this.chosenAccount = firstAccount;
    }
    let accountChanged = web3Present && this.chosenAccount !== undefined && firstAccount !== this.chosenAccount;
    let canMakePublicCalls = web3Present && !unsupportedNetwork && !networkChanged && this.initialBlockNumber;
    return {
      web3Present: web3Present,
      unsupportedNetwork: unsupportedNetwork,
      chosenSupportedNetworkName: this.chosenSupportedNetworkName,
      targetNetworkName: this.targetNetworkInfo.name,
      networkChanged: networkChanged,
      chosenAccount: this.chosenAccount,
      accountLocked: accountLocked,
      accountChanged: accountChanged,
      canMakePublicCalls: canMakePublicCalls,
      canMakeAccountCalls: canMakePublicCalls && !accountLocked && !accountChanged,
      withinGracePeriod: (new Date() - this.startedConnectingAt) < 5000
    };
  }

  // Internal - we need this to help filter events.
  // We don't consider the bridge ready to make calls until we've got it.
  _handleBlockNumber = (error, result) => {
    if (error) {
      // TODO
      return;
    }
    this.initialBlockNumber = result;
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
    let status = this.getUpdatedStatus();
    if (!status.canMakePublicCalls && callbackIfNot) {
      window.setTimeout(function () { callbackIfNot(new Error("cannot make public calls: " + status));}, 0);
    }
    return status.canMakePublicCalls;
  }

  // Check if the bridge currently appears able to make account-related calls.
  // Returns boolean immediately; if callbackIfNot given it will be invoked with an error.
  checkCanMakeAccountCalls = (callbackIfNot) => {
    let status = this.getUpdatedStatus();
    if (!status.canMakeAccountCalls && callbackIfNot) {
      window.setTimeout(function () { callbackIfNot(new Error("cannot make account calls: " + status));}, 0);
    }
    return status.canMakeAccountCalls;
  }

  // Internal. Can fail if web3 not ready / locked.
  _getOurAddress = () => {
    return this.web3.eth.accounts[0];
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
  // The callback may be invoked more than once with different subsets -
  // it should merge the results with any balances it already has.
  // Returns nothing useful.
  getBalances = (callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    let wrapperCallback = (error, result) => {
      if (error) {
        return callback(error, undefined);
      } else {
        let translatedResult = UbiTokTypes.decodeClientBalances(result);
        return callback(error, translatedResult);
      }
    };
    let ourAddress = this._getOurAddress();
    this.bookContract.getClientBalances(ourAddress, wrapperCallback);
    // We can't use the contract to get our eth balance due to a rather odd geth bug
    let wrapperCallback2 = (error, result) => {
      if (error) {
        return callback(error, undefined);
      } else {
        let translatedResult = {
          ownCntr: UbiTokTypes.decodeCntrAmount(result)
        }
        return callback(error, translatedResult);
      }
    };
    this.web3.eth.getBalance(ourAddress, wrapperCallback2);
  }

  // Submit a base deposit approval for given friendly base amount.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitDepositBaseApprove = (fmtAmount, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // use fixed amount so can detect failures by max consumption
    // TODO - different tokens may require different amounts ...
    let gasAmount = 250000;
    this.baseToken.approve.sendTransaction(
      this.bookContract.address,
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeBaseAmount(fmtAmount).valueOf(),
      { from: this._getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback, gasAmount)).handleTxn
    );
  }

  // Submit a base deposit collection.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitDepositBaseCollect = (callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // use fixed amount so can detect failures by max consumption
    // TODO - different tokens may require different amounts ...
    let gasAmount = 250000;
    this.bookContract.transferFromBase.sendTransaction(
      { from: this._getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback, gasAmount)).handleTxn
    );
  }

  // Submit a base withdrawal.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitWithdrawBaseTransfer = (fmtAmount, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // use fixed amount so can detect failures by max consumption
    // TODO - different tokens may require different amounts ...
    let gasAmount = 250000;
    this.bookContract.transferBase.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeBaseAmount(fmtAmount).valueOf(),
      { from: this._getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback, gasAmount)).handleTxn
    );
  }

  // Submit a counter deposit for given friendly amount.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitDepositCntr = (fmtAmount, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // use fixed amount so can detect failures by max consumption
    let gasAmount = 150000;
    this.bookContract.depositCntr.sendTransaction(
      {
        from: this._getOurAddress(),
        gas: gasAmount,
        value: UbiTokTypes.encodeCntrAmount(fmtAmount)
      },
      (new TransactionWatcher(this.web3, callback, gasAmount)).handleTxn
    );
  }

  // Submit a counter withdrawal for given friendly amount.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitWithdrawCntr = (fmtAmount, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // use fixed amount so can detect failures by max consumption
    let gasAmount = 150000;
    this.bookContract.withdrawCntr.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeCntrAmount(fmtAmount).valueOf(),
      { from: this._getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback, gasAmount)).handleTxn
    );
  }
  
  // Used to build a snapshot of the order book.
  // Thin wrapper over the contract walkBook - it's quite hard to explain (TODO)
  // Returns nothing useful.
  walkBook = (fromPricePacked, callback) => {
    this.bookContract.walkBook.call(fromPricePacked, callback);
  }

  // Request a callback with the client's newest order or previous order before the given order.
  // Callback fn should take (error, result) - TODO what format for result?
  // Call with undefined maybeLastOrderId to get newest order, or with the orderId from
  // the last callback to walk through. If no order found, orderId returned will be invalid.
  // Skips closed orders if they're too old.
  // Returns nothing useful.
  walkMyOrders = (maybeLastOrderId, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    let now = new Date();
    let recentCutoffDate = new Date(now.getTime() - 24 * 3600 * 1000);
    let recentCutoffEncodedOrderId = UbiTokTypes.computeEncodedOrderId(recentCutoffDate, "0");
    var encodedLastOrderId;
    if (!maybeLastOrderId) {
      encodedLastOrderId = UbiTokTypes.deliberatelyInvalidEncodedOrderId();
    } else {
      encodedLastOrderId = UbiTokTypes.encodeOrderId(maybeLastOrderId);
    }
    // TODO - shouldn't we be responsible for decoding?
    this.bookContract.walkClientOrders.call(this._getOurAddress(), encodedLastOrderId.valueOf(), recentCutoffEncodedOrderId.valueOf(),
      callback
    );
  }
  
  // Submit a request to create an order.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitCreateOrder = (fmtOrderId, fmtPrice, fmtSizeBase, fmtTerms, maxMatches, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // probably too pessimistic, can reduce once analysed worst-case properly
    let gasAmount = 300000 + 100000 * maxMatches;
    this.bookContract.createOrder.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeOrderId(fmtOrderId).valueOf(),
      UbiTokTypes.encodePrice(fmtPrice).valueOf(),
      UbiTokTypes.encodeBaseAmount(fmtSizeBase).valueOf(),
      UbiTokTypes.encodeTerms(fmtTerms).valueOf(),
      maxMatches,
      { from: this._getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback, gasAmount)).handleTxn
    );
  }

  // Submit a request to continue an order.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitContinueOrder = (fmtOrderId, maxMatches, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // probably too pessimistic, can reduce once analysed worst-case properly
    let gasAmount = 150000 + 100000 * maxMatches;
    this.bookContract.continueOrder.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeOrderId(fmtOrderId).valueOf(),
      maxMatches,
      { from: this._getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }

  // Submit a request to cancel an order.
  // Callback fn should take (error, event) - see TransactionWatcher.
  // Returns nothing useful.
  submitCancelOrder = (fmtOrderId, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // specify fixed amount since:
    // a) can't rely on estimate 'cos it can change based on other orders being placed
    // b) it is useful for detecting failed transactions (those that used all the gas)
    let gasAmount = 150000;
    this.bookContract.cancelOrder.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeOrderId(fmtOrderId).valueOf(),
      { from: this._getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback, gasAmount)).handleTxn
    );
  }

  // Request a callback with the state of the given order.
  // Callback fn should take (error, result) where result is as UbiTokTypes.decodeOrderState.
  // Returns nothing useful.
  getOrderState = (fmtOrderId, callback) => {
    let rawOrderId = UbiTokTypes.encodeOrderId(fmtOrderId).valueOf();
    this.bookContract.getOrderState.call(rawOrderId, (error, result) => {
      if (error) {
        callback(error, undefined);
      } else {
        callback(undefined, UbiTokTypes.decodeOrderState(fmtOrderId, result));
      }
    });
  }

  // Subscribe to receive a callback whenever a market event occurs.
  // Callback fn should take (error, result) where result is as UbiTokTypes.decodeMarketOrderEvent.
  // Returns nothing useful.
  subscribeFutureMarketEvents = (callback) => {
    if (!this.checkCanMakePublicCalls(callback)) {
      return;
    }
    var filter = this.bookContract.MarketOrderEvent();
    filter.watch((error, result) => {
      if (error) {
        return callback(error, undefined);
      }
      callback(undefined, UbiTokTypes.decodeMarketOrderEvent(result));
    });
  }

  // Request a callback with market events that occurred before the bridge connected.
  // Callback fn should take (error, result) where result is an array of
  // elements as returned by UbiTokTypes.decodeMarketOrderEvent.
  // Returns nothing useful.
  getHistoricMarketEvents = (callback) => {
    if (!this.checkCanMakePublicCalls(callback)) {
      return;
    }
    var approxBlocksPerHour = 180;
    var filter = this.bookContract.MarketOrderEvent({}, {
      fromBlock: this.initialBlockNumber - (12 * approxBlocksPerHour)
    });
    filter.get((error, result) => {
      if (error) {
        return callback(error, undefined);
      }
      callback(undefined, result.map(
        (rawEntry) => UbiTokTypes.decodeMarketOrderEvent(rawEntry)));
    });
  }

}

// After submitting a txn (e.g. create/cancel order, make payment),
// we need some way of knowing if/when it made it into the blockchain.
// Use by creating a TransactionWatcher and passing its handleTxn method
// as the callback to a web3 contractMethod.sendTransaction call.
// It will in invoke your callback with:
//  1. {event: "GotTxnHash", txnHash: "the hash"}
// Followed by either:
//  2a. {event: "Mined"}
// or:
//  2b. {event: "FailedTxn"}
// But it can only return FailedTxn if you give it a "optionalGasFail"
// value - if the txn uses that much gas (or more) it assumes it has failed.
// TODO - is there really no better way to detect a bad transaction?
//
class TransactionWatcher {

  constructor(web3, callback, optionalGasFail) {
    this.web3 = web3;
    this.callback = callback;
    this.optionalGasFail = optionalGasFail;
    this.txnHash = undefined;
  }
  
  handleTxn = (error, result) => {
    if (error) {
      this.callback(error, undefined);
      return;
    }
    this.txnHash = result;
    this.callback(undefined, {event: "GotTxnHash", txnHash: this.txnHash});
    this._pollTxn();
  }

  _pollTxn = () => {
    this.web3.eth.getTransactionReceipt(this.txnHash, this._handleTxnReceipt);
  }

  _handleTxnReceipt = (error, result) => {
    if (!result) {
      window.setTimeout(this._pollTxn, 3000);
      return;
    } else {
      if (this.optionalGasFail) {
        if (result.gasUsed >= this.optionalGasFail) {
          this.callback(undefined, {event: "FailedTxn"});
          return;
        }
      }
      this.callback(undefined, {event: "Mined"});
    }
  }

}

export { Bridge as default };