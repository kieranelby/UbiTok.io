
import Web3 from 'web3';
import UbiTokTypes from 'ubi-lib/ubi-tok-types.js';

class TransactionWatcher {

  constructor(web3, callback) {
    this.web3 = web3;
    this.callback = callback;
    this.txnHash = undefined;
  }
  
  handleTxn = (error, result) => {
    if (error) {
      this.callback(error, undefined);
      return;
    }
    this.txnHash = result;
    this.callback(undefined, {event: 'GotTxnHash', txnHash: this.txnHash});
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
      this.callback(undefined, {event: 'Mined'});
    }
  }

}

class Bridge {

  constructor() {
    this.web3 = undefined;
    this.chosenSupportedNetworkId = undefined;
    this.chosenSupportedNetworkName = undefined;
    this.chosenAccount = undefined;
    this.initialBlockNumber = undefined;
    this.supportedNetworks = {
        "3": {
          name: "Ropsten Test Network",
          bookContractAddress: "0xb822215e3f6b6eb690fdcb3183d7a466e5b048c8",
          baseTokenAddress: "0x678c4cf3f4a26d607d0a0032d72fdc3b1e3f71f4"
        }
    };
    this.statusSubscribers = [];
    this.baseDecimals = 18;
    this.cntrDecimals = 18;
    window.setTimeout(this.pollStatus, 1000);
  }

  getInitialStatus = () => {
    return {
      web3Present: false,
      chosenSupportedNetworkName: undefined,
      unsupportedNetwork: false,
      networkChanged: false,
      chosenAccount: undefined,
      accountLocked: false,
      accountChanged: false,
      canMakePublicCalls: false,
      canMakeAccountCalls: false
    };
  }

  pollStatus = () => {
    let status = this.getUpdatedStatus();
    for (let subscriber of this.statusSubscribers) {
      subscriber(undefined, status);
    }
    window.setTimeout(this.pollStatus, 1000);
  }

  getUpdatedStatus = () => {
    if (this.web3 === undefined && window.web3) {
      console.log('found web3 provider');
      this.web3 = new Web3(window.web3.currentProvider);
    }
    let web3Present = this.web3 !== undefined && this.web3.hasOwnProperty("version");
    let networkId = web3Present ? this.web3.version.network : undefined;
    let unsupportedNetwork = web3Present && !this.supportedNetworks.hasOwnProperty(networkId);
    if (web3Present && this.chosenSupportedNetworkId === undefined && !unsupportedNetwork) {
      console.log('choosing network', networkId);
      this.chosenSupportedNetworkId = networkId;
      let networkSettings = this.supportedNetworks[networkId];
      this.chosenSupportedNetworkName = networkSettings.name;
      const bookContractAbiArray = 
[{"constant":true,"inputs":[{"name":"fromPrice","type":"uint16"}],"name":"walkBook","outputs":[{"name":"price","type":"uint16"},{"name":"depthBase","type":"uint256"},{"name":"orderCount","type":"uint256"},{"name":"blockNumber","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"newAllowanceBase","type":"uint256"}],"name":"approveBase","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"orderId","type":"uint128"}],"name":"getOrder","outputs":[{"name":"client","type":"address"},{"name":"price","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"},{"name":"status","type":"uint8"},{"name":"reasonCode","type":"uint8"},{"name":"executedBase","type":"uint256"},{"name":"executedCntr","type":"uint256"},{"name":"fees","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"amountCntr","type":"uint256"}],"name":"withdrawCntr","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_baseToken","type":"address"}],"name":"init","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"getBookInfo","outputs":[{"name":"_bookType","type":"uint8"},{"name":"_baseToken","type":"address"},{"name":"_baseMinInitialSize","type":"uint256"},{"name":"_cntrToken","type":"address"},{"name":"_cntrMinInitialSize","type":"uint256"},{"name":"_feePpm","type":"uint256"},{"name":"_investorProxy","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"newInvestorProxy","type":"address"}],"name":"changeInvestorProxy","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"orderId","type":"uint128"}],"name":"getOrderState","outputs":[{"name":"status","type":"uint8"},{"name":"reasonCode","type":"uint8"},{"name":"executedBase","type":"uint256"},{"name":"executedCntr","type":"uint256"},{"name":"fees","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"amountBase","type":"uint256"}],"name":"transferBase","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"depositCntr","outputs":[],"payable":true,"type":"function"},{"constant":false,"inputs":[],"name":"transferFromBase","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"client","type":"address"}],"name":"getClientBalances","outputs":[{"name":"balanceBase","type":"uint256"},{"name":"balanceCntr","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"client","type":"address"},{"name":"maybeLastOrderIdReturned","type":"uint128"},{"name":"minClosedOrderIdCutoff","type":"uint128"}],"name":"walkClientOrders","outputs":[{"name":"orderId","type":"uint128"},{"name":"price","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"},{"name":"status","type":"uint8"},{"name":"reasonCode","type":"uint8"},{"name":"executedBase","type":"uint256"},{"name":"executedCntr","type":"uint256"},{"name":"fees","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"orderId","type":"uint128"},{"name":"price","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"},{"name":"maxMatches","type":"uint256"}],"name":"createOrder","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"orderId","type":"uint128"},{"name":"maxMatches","type":"uint256"}],"name":"continueOrder","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"client","type":"address"}],"name":"getMoreClientBalances","outputs":[{"name":"bookBalanceBase","type":"uint256"},{"name":"bookBalanceCntr","type":"uint256"},{"name":"approvedBalanceBase","type":"uint256"},{"name":"approvedBalanceCntr","type":"uint256"},{"name":"chainBalanceBase","type":"uint256"},{"name":"chainBalanceCntr","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"orderId","type":"uint128"}],"name":"cancelOrder","outputs":[],"payable":false,"type":"function"},{"inputs":[],"payable":false,"type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"address"},{"indexed":false,"name":"clientPaymentEventType","type":"uint8"},{"indexed":false,"name":"baseOrCntr","type":"uint8"},{"indexed":false,"name":"clientBalanceDelta","type":"int256"}],"name":"ClientPaymentEvent","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"address"},{"indexed":false,"name":"clientOrderEventType","type":"uint8"},{"indexed":false,"name":"orderId","type":"uint128"}],"name":"ClientOrderEvent","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"eventTimestamp","type":"uint256"},{"indexed":true,"name":"orderId","type":"uint128"},{"indexed":false,"name":"marketOrderEventType","type":"uint8"},{"indexed":false,"name":"price","type":"uint16"},{"indexed":false,"name":"amountBase","type":"uint256"}],"name":"MarketOrderEvent","type":"event"}]
      ;
      let BookContract = this.web3.eth.contract(bookContractAbiArray);
      this.bookContract = BookContract.at(networkSettings.bookContractAddress);
      const baseTokenAbiArray = 
[{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"totalSupply","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"}],"name":"allowance","outputs":[{"name":"remaining","type":"uint256"}],"payable":false,"type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_from","type":"address"},{"indexed":true,"name":"_to","type":"address"},{"indexed":false,"name":"_value","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_owner","type":"address"},{"indexed":true,"name":"_spender","type":"address"},{"indexed":false,"name":"_value","type":"uint256"}],"name":"Approval","type":"event"}]
      ;
      let BaseTokenContract = this.web3.eth.contract(baseTokenAbiArray);
      this.baseToken = BaseTokenContract.at(networkSettings.baseTokenAddress);
      this.web3.eth.getBlockNumber(this.handleBlockNumber);
    }
    let networkChanged = web3Present && this.chosenSupportedNetworkId !== undefined && networkId !== this.chosenSupportedNetworkId;
    var firstAccount = web3Present ? this.web3.eth.accounts[0] : undefined;
    let accountLocked = web3Present && firstAccount === undefined; // TODO - perhaps check not all zeroes?
    if (web3Present && this.chosenAccount === undefined && !accountLocked) {
      console.log('choosing account', firstAccount);
      this.chosenAccount = firstAccount;
    }
    let accountChanged = web3Present && this.chosenAccount !== undefined && firstAccount !== this.chosenAccount;
    let canMakePublicCalls = web3Present && !unsupportedNetwork && !networkChanged && this.initialBlockNumber;
    return {
      web3Present: web3Present,
      unsupportedNetwork: unsupportedNetwork,
      chosenSupportedNetworkName: this.chosenSupportedNetworkName,
      networkChanged: networkChanged,
      chosenAccount: this.chosenAccount,
      accountLocked: accountLocked,
      accountChanged: accountChanged,
      canMakePublicCalls: canMakePublicCalls,
      canMakeAccountCalls: canMakePublicCalls && !accountLocked && !accountChanged
    };
  }

  handleBlockNumber = (error, result) => {
    if (error) {
      // TODO
      return;
    }
    this.initialBlockNumber = result;
  }

  subscribeStatus = (callback) => {
    this.statusSubscribers.push(callback);
  }

  checkCanMakePublicCalls = (callbackIfNot) => {
    let status = this.getUpdatedStatus();
    if (!status.canMakePublicCalls && callbackIfNot) {
      window.setTimeout(function () { callbackIfNot(new Error('cannot make public calls: ' + status))}, 0);
    }
    return status.canMakePublicCalls;
  }

  checkCanMakeAccountCalls = (callbackIfNot) => {
    let status = this.getUpdatedStatus();
    if (!status.canMakeAccountCalls && callbackIfNot) {
      window.setTimeout(function () { callbackIfNot(new Error('cannot make account calls: ' + status))}, 0);
    }
    return status.canMakeAccountCalls;
  }

  getOurAddress = () => {
    return this.web3.eth.accounts[0];
  }

  getBalances = (callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    let wrapperCallback = (error, result) => {
      if (error) {
        return callback(error, undefined);
      } else {
        let translatedResult = [
          UbiTokTypes.decodeAmount(result[0], this.baseDecimals),
          UbiTokTypes.decodeAmount(result[1], this.cntrDecimals),
          UbiTokTypes.decodeAmount(result[2], this.baseDecimals),
          UbiTokTypes.decodeAmount(result[3], this.cntrDecimals),
          UbiTokTypes.decodeAmount(result[4], this.baseDecimals),
          UbiTokTypes.decodeAmount(result[5], this.cntrDecimals)
        ];
        return callback(error, translatedResult);
      }
    };
    this.bookContract.getMoreClientBalances.call(this.getOurAddress(), wrapperCallback);
  }

  submitDepositBaseApprove = (fmtAmount, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    this.baseToken.approve.sendTransaction(
      this.bookContract.address,
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeBaseAmount(fmtAmount).valueOf(),
      { from: this.getOurAddress() },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }

  submitDepositBaseCollect = (callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    this.bookContract.transferFromBase.sendTransaction(
      { from: this.getOurAddress() },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }

  submitWithdrawBaseTransfer = (fmtAmount, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    this.bookContract.transferBase.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeBaseAmount(fmtAmount).valueOf(),
      { from: this.getOurAddress() },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }

  submitDepositCntr = (fmtAmount, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    this.bookContract.depositCntr.sendTransaction(
      {
        from: this.getOurAddress(),
        value: UbiTokTypes.encodeCntrAmount(fmtAmount)
      },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }

  submitWithdrawCntr = (fmtAmount, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    this.bookContract.withdrawCntr.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeCntrAmount(fmtAmount).valueOf(),
      { from: this.getOurAddress() },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }
  
  walkBook = (fromPricePacked, callback) => {
    this.bookContract.walkBook.call(fromPricePacked, callback);
  }
  
  walkMyOrders = (maybeLastOrderId, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    let now = new Date();
    let recentCutoffDate = new Date(now.getTime() - 24 * 3600 * 1000);
    let recentCutoffEncodedOrderId = UbiTokTypes.computeEncodedOrderId(recentCutoffDate, '0');
    var encodedLastOrderId;
    if (!maybeLastOrderId) {
      encodedLastOrderId = UbiTokTypes.deliberatelyInvalidEncodedOrderId();
    } else {
      encodedLastOrderId = UbiTokTypes.encodeOrderId(maybeLastOrderId);
    }
    this.bookContract.walkClientOrders.call(this.getOurAddress(), encodedLastOrderId.valueOf(), recentCutoffEncodedOrderId.valueOf(),
      callback
    );
  }
  
  submitCreateOrder = (fmtOrderId, fmtPrice, fmtSizeBase, fmtTerms, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // TODO - come up with "clever" way of choosing maxMatches + gas
    var maxMatches;
    var gasAmount;
    if (fmtTerms === 'MakerOnly') {
      maxMatches = 0;
      gasAmount = 300000;
    } else {
      maxMatches = 3;
      gasAmount = 550000;
    }
    this.bookContract.createOrder.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeOrderId(fmtOrderId).valueOf(),
      UbiTokTypes.encodePrice(fmtPrice).valueOf(),
      UbiTokTypes.encodeAmount(fmtSizeBase, this.baseDecimals).valueOf(),
      UbiTokTypes.encodeTerms(fmtTerms).valueOf(),
      maxMatches,
      { from: this.getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }

  submitContinueOrder = (fmtOrderId, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // TODO - come up with "clever" way of choosing maxMatches + gas
    let maxMatches = 3;
    let gasAmount = 550000;
    this.bookContract.continueOrder.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeOrderId(fmtOrderId).valueOf(),
      maxMatches,
      { from: this.getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }

  submitCancelOrder = (fmtOrderId, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // can't rely on estimate 'cos it can change based on other orders being placed ...
    var gasAmount = 150000;
    this.bookContract.cancelOrder.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeOrderId(fmtOrderId).valueOf(),
      { from: this.getOurAddress(), gas: gasAmount },
      (new TransactionWatcher(this.web3, callback)).handleTxn
    );
  }

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

export { Bridge as default }