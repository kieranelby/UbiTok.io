
import Web3 from 'web3';
import UbiTokTypes from 'ubi-lib/ubi-tok-types.js';

export default class {

  constructor() {
    this.web3 = undefined;
    this.chosenSupportedNetworkId = undefined;
    this.chosenSupportedNetworkName = undefined;
    this.chosenAccount = undefined;
    this.supportedNetworks = {
        "3": {
          name: "Ropsten Test Network",
          bookContractAddress: "0x23b264782b7f34f59523ed0c79959666c15ad398"
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
      let bookContractAddress = networkSettings.bookContractAddress;
      const abiArray = 
        [{"constant":true,"inputs":[{"name":"fromPricePacked","type":"uint16"}],"name":"walkBook","outputs":[{"name":"pricePacked","type":"uint16"},{"name":"depthBase","type":"uint256"},{"name":"blockNumber","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"baseTradableType","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"pricePacked","type":"uint16"}],"name":"unpackPrice","outputs":[{"name":"direction","type":"uint8"},{"name":"mantissa","type":"uint16"},{"name":"exponent","type":"int8"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"orderId","type":"uint128"}],"name":"getOrder","outputs":[{"name":"client","type":"address"},{"name":"pricePacked","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"client","type":"address"},{"name":"amountQuoted","type":"uint256"}],"name":"depositQuotedForTesting","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"baseMinInitialSize","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"quotedTradableDisplayDecimals","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"orderId","type":"uint128"}],"name":"getOrderState","outputs":[{"name":"status","type":"uint8"},{"name":"cancelOrRejectReason","type":"uint8"},{"name":"executedBase","type":"uint256"},{"name":"executedQuoted","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"baseMinRemainingSize","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"pricePacked","type":"uint16"}],"name":"oppositePackedPrice","outputs":[{"name":"","type":"uint16"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"minimumPriceExponent","outputs":[{"name":"","type":"int8"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"client","type":"address"}],"name":"getClientBalances","outputs":[{"name":"balanceBase","type":"uint256"},{"name":"balanceQuoted","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"quotedMinRemainingSize","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"baseAmount","type":"uint256"},{"name":"mantissa","type":"uint16"},{"name":"exponent","type":"int8"}],"name":"computeQuotedAmount","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"baseAmount","type":"uint256"},{"name":"pricePacked","type":"uint16"}],"name":"computeQuotedAmountUsingPacked","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"direction","type":"uint8"},{"name":"mantissa","type":"uint16"},{"name":"exponent","type":"int8"}],"name":"packPrice","outputs":[{"name":"","type":"uint16"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"client","type":"address"},{"name":"amountBase","type":"uint256"}],"name":"depositBaseForTesting","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"orderId","type":"uint128"},{"name":"pricePacked","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"}],"name":"createOrder","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"quotedMinInitialSize","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"client","type":"address"},{"name":"maybeLastOrderIdReturned","type":"uint128"},{"name":"minClosedOrderIdCutoff","type":"uint128"}],"name":"walkOrders","outputs":[{"name":"orderId","type":"uint128"},{"name":"pricePacked","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"},{"name":"status","type":"uint8"},{"name":"cancelOrRejectReason","type":"uint8"},{"name":"executedBase","type":"uint256"},{"name":"executedQuoted","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"baseTradableSymbol","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"quotedTradableType","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"validPricePacked","type":"uint16"}],"name":"isBuyPrice","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"baseTradableDisplayDecimals","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"quotedTradableSymbol","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"inputs":[],"payable":false,"type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"name":"message","type":"string"},{"indexed":false,"name":"client","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"Debug","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"address"},{"indexed":false,"name":"orderId","type":"uint128"}],"name":"ClientOrderCreated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"marketOrderEventType","type":"uint8"},{"indexed":false,"name":"orderId","type":"uint128"},{"indexed":false,"name":"pricePacked","type":"uint16"},{"indexed":false,"name":"amountBase","type":"uint256"}],"name":"MarketOrderEvent","type":"event"}]
      ;
      let BookContract = this.web3.eth.contract(abiArray);
      this.bookContract = BookContract.at(bookContractAddress);
    }
    let networkChanged = web3Present && this.chosenSupportedNetworkId !== undefined && networkId !== this.chosenSupportedNetworkId;
    var firstAccount = web3Present ? this.web3.eth.accounts[0] : undefined;
    let accountLocked = web3Present && firstAccount === undefined; // TODO - perhaps check not all zeroes?
    if (web3Present && this.chosenAccount === undefined && !accountLocked) {
      console.log('choosing account', firstAccount);
      this.chosenAccount = firstAccount;
    }
    let accountChanged = web3Present && this.chosenAccount !== undefined && firstAccount !== this.chosenAccount;
    return {
      web3Present: web3Present,
      unsupportedNetwork: unsupportedNetwork,
      chosenSupportedNetworkName: this.chosenSupportedNetworkName,
      networkChanged: networkChanged,
      chosenAccount: this.chosenAccount,
      accountLocked: accountLocked,
      accountChanged: accountChanged,
      canMakePublicCalls: web3Present && !unsupportedNetwork && !networkChanged,
      canMakeAccountCalls: web3Present && !unsupportedNetwork && !networkChanged && !accountLocked && !accountChanged
    };
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

  getExchangeBalances = (callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    let wrapperCallback = (error, result) => {
      if (error) {
        return callback(error, undefined);
      } else {
        let translatedResult = [
          UbiTokTypes.decodeAmount(result[0], this.baseDecimals),
          UbiTokTypes.decodeAmount(result[1], this.cntrDecimals)
        ];
        return callback(error, translatedResult);
      }
    };
    this.bookContract.getClientBalances.call(this.getOurAddress(), wrapperCallback);
  }

  getErc20Balance = (erc20addr, callback) => {

  }

  getErc20Approved = (erc20addr, callback) => {

  }

  getEtherBalance = (callback) => {

  }

  submitCounterEtherDeposit = (fmtAmount, callback) => {

  }

  submitErc20Approve = (erc20addr, fmtAmount, callback) => {

  }

  submitErc20Unapprove = (erc20addr, fmtAmount, callback) => {

  }

  submitBaseErc20Deposit = (fmtAmount, callback) => {

  }

  submitCounterEtherWithdraw = (fmtAmount, callback) => {

  }

  submitBaseErc20Withdraw = (fmtAmount, callback) => {

  }

  walkBook = (fromPricePacked, callback) => {
    this.bookContract.walkBook.call(fromPricePacked, callback);
  }

  
  walkMyOrders = (maybeLastOrderId, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // if no maybeLastOrderId, call mostRecentOrderIdForClient(our address)
    // else call clientPreviousOrderIdBeforeOrderId(maybeLastOrderId)
    // but we kinda want to call getOrder + getOrderState ?
    // would we want a way to ignore completed/rejected ones?
    // TODO
  }
  
  submitCreateOrder = (fmtOrderId, fmtPrice, fmtSizeBase, fmtTerms, callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    this.bookContract.createOrder.sendTransaction(
      // TODO - valueOf is just to work around an annoying recent web3 bug ...
      UbiTokTypes.encodeOrderId(fmtOrderId).valueOf(),
      UbiTokTypes.encodePrice(fmtPrice).valueOf(),
      UbiTokTypes.encodeAmount(fmtSizeBase, this.baseDecimals).valueOf(),
      UbiTokTypes.encodeTerms(fmtTerms).valueOf(),
      { from: this.getOurAddress(), gas: 500000 },
      (error, result) => {
        this.handleOrderTxnHash(fmtOrderId, callback, error, result);
      }
    );
  }

  handleOrderTxnHash = (fmtOrderId, orderCallback, error, txnHash) => {
    if (error) {
      orderCallback(error, undefined);
    } else {
      this.handleOrderTxnReceipt(fmtOrderId, orderCallback, undefined, txnHash, undefined);
    }
  }

  handleOrderTxnReceipt = (fmtOrderId, orderCallback, error, txnHash, maybeTxnReceipt) => {
    if (error) {
      orderCallback(error, undefined);
    } else {
      if (!maybeTxnReceipt) {
        console.log('polling for txn', fmtOrderId, txnHash);
        setTimeout(() => {
          this.web3.eth.getTransactionReceipt(txnHash,
            (error2, result2) => {
              this.handleOrderTxnReceipt(fmtOrderId, orderCallback, error2, txnHash, result2)
            });
          }, 5000
        );
      } else {
        console.log('hooray - mined', fmtOrderId, maybeTxnReceipt);
        this.getOrderState(fmtOrderId, orderCallback);
      }
    }
  }
  
  submitContinueOrder = (fmtOrderId, callback) => {

  }

  submitCancelOrder = (fmtOrderId, callback) => {

  }

  // do we ever want this without state too?
  getOrder = (fmtOrderId, callback) => {

  }

  getOrderState = (fmtOrderId, callback) => {
    let rawOrderId = UbiTokTypes.encodeOrderId(fmtOrderId).valueOf();
    this.bookContract.getOrderState.call(rawOrderId, (error, result) => {
      if (error) {
        callback(error, undefined);
      } else {
        callback(undefined, UbiTokTypes.decodeState(result));
      }
    });
  }

  // TODO - replace with walk function
  getAllOrderIds = (callback) => {
    if (!this.checkCanMakeAccountCalls(callback)) {
      return;
    }
    // TODO - optimise by starting from block where contract deployed
    // perhaps still a bit expensive for metamask?
    // or should we maintain a linked list in the contract of our orders?
    var moreFilterOptions = {
      fromBlock: 1000000
    };
    var filter = this.bookContract.ClientOrderCreated({client: this.getOurAddress()}, moreFilterOptions);
    filter.get(callback);
  }

  subscribeFutureMarketEvents = (callback) => {
    if (!this.checkCanMakePublicCalls(callback)) {
      return;
    }
    var filter = this.bookContract.MarketOrderEvent();
    // TODO - should translate events ...
    filter.watch(callback);
  }

  getHistoricMarketTrades = (callback) => {
    // TODO - last 50,000 blocks or something
  }

}
