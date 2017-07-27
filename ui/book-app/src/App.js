import React, { Component } from 'react';
import { Navbar, Nav, NavItem, Tab, Tabs, Well, Panel,
         Grid, Row, Col, Table,
         ButtonToolbar, Button, Glyphicon, 
         FormGroup, FormControl, ControlLabel, HelpBlock, InputGroup,
         Modal } from 'react-bootstrap';
import update from 'immutability-helper';

import Spinner from 'react-spinkit';

import logo from './ubitok-logo.svg';
import metamaskLogo from './metamask.png';
import mistLogo from './mist.png';

import SendingButton from './sending-button.js';
import EthTxnLink from './eth-txn-link.js';

import './App.css';

import moment from 'moment';

import Bridge from './bridge.js'
import UbiTokTypes from 'ubi-lib/ubi-tok-types.js';
var BigNumber = UbiTokTypes.BigNumber;

// Work around for:
// a) passing Nav props into a form element
// b) nav dropdown not nicely defaulting to showing chosen item
// c) layout problems if you put a form control straight into a nav
function MyNavForm(props) {
  return <form className="navbar-form" id={props.id}>{props.children}</form>
}

class App extends Component {
  constructor(props) {
    super(props);

    this.bridge = new Bridge();
    this.lastBridgeStatus = this.bridge.getInitialStatus();

    // pricePacked -> [rawDepth, orderCount, blockNumber]
    this.internalBook = new Map();
    this.internalBookWalked = false;

    this.marketEventQueue = [];

    this.state = {

      // current time (helps testability vs. straight new Date())
      "clock": new Date(),

      // are we connected to Ethereum network? which network? what account?

      "bridgeStatus": this.bridge.getInitialStatus(),

      // what are we trading?

      "pairInfo": {
        "symbol": "UBI/ETH",
        "base": {
          "tradableType": "ERC20",
          "symbol": "UBI",
          "name": "UbiTok.io",
          "address": "", // TODO - need to fill in when network selected
          "minInitialSize": "0.01"
        },
        "cntr": {
          "tradableType": "Ether",
          "symbol": "ETH",
          "name": "Ether",
          "minInitialSize": "0.001"
        }
      },

      // how much money do we have where?
      // all are pairs of [ base, counter ] where "" = unknown

      "balances": {
        "wallet": ["", ""],
        // e.g. if we have approved some of our ERC20 funds for the contract
        // but not told the contract to transfer them to itself yet (fiddly!)
        "approved": ["", ""],
        "exchange": ["", ""]
      },

      // which payment tab the user is on

      "paymentTabKey": "none",
      
      // payment forms

      "depositBase": {
        "newApprovedAmount": "0.0"
      },

      "withdrawBase": {
        "amount": "0.0"
      },

      "depositCntr": {
        "amount": "0.0"
      },

      "withdrawCntr": {
        "amount": "0.0"
      },

      // this isn't persistent, we only show payments made in this session
      // (suppose could use brower storage?)
      //
      // example:
      // [{
      //   pmtId: 1534567345673463,
      //   createdAt: new Date(..),
      //   txnHash: undefined | "0x5f757...",
      //   action: "Deposit ETH",
      //   amount: "10.00",
      //   pmtStatus: "Sending" | "FailedSend" | "Complete"
      // }]
      //

      "paymentHistory" : [

      ],
      
      // the order book

      "book": {
        // have we finished walking the book initially?
        "isComplete": false,
        // friendly price + depth pairs, sorted for display
        "asks": [],
        "bids": []
      },

      // orders the user is preparing to place

      "createOrder": {
        // have they selected buy or sell base?
        "side": "buy",
        "buy": {
          "amountBase": "",
          "price": "",
          "costCntr": "",
          "terms": "GTCNoGasTopup"
        },
        "sell": {
          "amountBase": "",
          "price": "",
          "returnCntr": "",
          "terms": "GTCNoGasTopup"
        }
      },

      // Orders the client has created.
      // (keyed by orderId, which sorting as a string corresponds to sorting by client-claimed-creation-time)
      // Example:
      //   "Rbc23fg9" : {
      //     "orderId": "Rbc23fg9",
      //     "price": "Buy @ 2.00",
      //     "sizeBase": "1000.0",
      //     "terms": "GTCNoTopup",
      //     "status": "Open",
      //     "reasonCode": "None",
      //     "rawExecutedBase": new BigNumber(0),
      //     "rawExecutedQuoted": new BigNumber(0),
      //     "rawFeeAmount": new BigNumber(0),
      //     "modifyInProgress": "Cancelling"
      //     "txnHash": undefined,
      //   }

      "myOrders": {
      },
      "myOrdersLoaded": false,

      // Whether to show the more info modal, and which order to describe in it:

      "showOrderInfo": false,
      "orderInfoOrderId": undefined,

      // Trades that have happened in the market (keyed by something unique).
      // Example:
      //
      //  "123-99": {
      //    "marketTradeId": "123-99",
      //    "blockNumber": 123, // only used for sorting, might remove
      //    "logIndex": 99, //  // only used for sorting, might remove
      //    "eventTimestamp": <a js Date>,
      //    "makerOrderId":"Rb101x",
      //    "makerPrice":"Buy @ 0.00000123",
      //    "executedBase":"50.0",
      //  }
      //
      
      "marketTrades": {
      }
    };
    this.bridge.subscribeStatus(this.handleStatusUpdate);
    window.setInterval(this.pollExchangeBalances, 3000);
    window.setInterval(this.updateClock, 1000);
    window.setInterval(this.purgeExcessData, 5000);
  }

  panic = (msg) => {
    this.warn(msg);
  }

  warn = (msg) => {
    console.log(msg);
  }
  
  updateClock = () => {
    this.setState((prevState, props) => {
      return {
        clock: new Date()
      }
    });
  }

  purgeExcessData = () => {
    // TODO - avoid too many closed my orders + too many market trades
  }

  getMySortedOrders = () => {
    // we generate our orderIds in chronological order, want opposite
    // how expensive is this?
    return Object.keys(this.state.myOrders).sort(
      (a,b) => {
        if (a < b) {
          return 1;
        }
        if (a > b) {
          return -1;
        }
        return 0;
      }
    ).map((orderId) => this.state.myOrders[orderId]);
  }

  // is this a bit complicated? could we just format the ids in a sort-friendly way?
  // want newest first
  cmpMarketTradeIds = (aId, bId) => {
    var a = this.state.marketTrades[aId];
    var b = this.state.marketTrades[bId];
    if (a.blockNumber < b.blockNumber) {
      return 1;
    }
    if (a.blockNumber > b.blockNumber) {
      return -1;
    }
    if (a.logIndex < b.logIndex) {
      return 1;
    }
    if (a.logIndex > b.logIndex) {
      return -1;
    }
    return 0;
  }

  formatBase = (rawAmount) => {
    return UbiTokTypes.decodeBaseAmount(rawAmount);
  }

  formatCntr = (rawAmount) => {
    return UbiTokTypes.decodeCntrAmount(rawAmount);
  }

  chooseClassNameForPrice = (price) => {
    if (price.startsWith('Buy')) {
      return 'buyPrice';
    } else if (price.startsWith('Sell')) {
      return 'sellPrice'
    } else {
      return 'invalidPrice';
    }
  }

  formatEventDate = (eventDate) => {
    if (!eventDate) return '';
    let then = moment(eventDate);
    let now = moment(this.state.clock);
    if (then.isAfter(now)) {
      return 'just now';
    }
    return moment(eventDate).from(moment(this.state.clock));
  }

  formatCreationDateOf = (orderId) => {
    let creationDate = UbiTokTypes.extractClientDateFromDecodedOrderId(orderId);
    return this.formatEventDate(creationDate);
  }
  
  handleStatusUpdate = (error, newBridgeStatus) => {
    let oldStatus = this.lastBridgeStatus;
    if (!oldStatus.canMakePublicCalls && newBridgeStatus.canMakePublicCalls) {
      this.readPublicData();
    }
    if (!oldStatus.canMakeAccountCalls && newBridgeStatus.canMakeAccountCalls) {
      this.readAccountData();
    }
    this.lastBridgeStatus = newBridgeStatus;
    this.setState((prevState, props) => {
      return {
        bridgeStatus: newBridgeStatus
      }
    });
  }

  readPublicData = () => {
    this.bridge.subscribeFutureMarketEvents(this.handleMarketEvent);
    this.startWalkBook();
    this.bridge.getHistoricMarketEvents(this.handleHistoricMarketEvents);
  }

  readAccountData = () => {
    this.bridge.walkMyOrders(undefined, this.handleWalkMyOrdersCallback);
  }

  handleHistoricMarketEvents = (error, events) => {
    if (error) {
      this.panic(error);
      return;
    }
    for (let event of events) {
      this.addMarketTradeFromEvent(event);
    }
    // TODO - make loading spinner disappear
  }

  handleMarketEvent = (error, event) => {
    if (error) {
      this.panic(error);
      return;
    }
    console.log('handleMarketEvent', event);
    this.marketEventQueue.push(event);
    this.consumeQueuedMarketEvents();
  }

  consumeQueuedMarketEvents = () => {
    if (!this.internalBookWalked) {
      return;
    }
    for (let event of this.marketEventQueue) {
      if (this.isInMyOrders(event.orderId)) {
        this.bridge.getOrderState(event.orderId, (error, result) => {
          this.updateMyOrder(event.orderId, result);
        });
      }
      this.updateInternalBookFromEvent(event);
      this.addMarketTradeFromEvent(event);
    }
    this.marketEventQueue = [];
    this.updatePublicBook();
  }

  updateInternalBookFromEvent = (event) => {
    // [rawDepth, orderCount, blockNumber]
    let entry = this.internalBook.has(event.pricePacked) ? this.internalBook.get(event.pricePacked) : [new BigNumber(0), 0, 0];
    if (event.blockNumber > entry[2]) {
      if (event.marketOrderEventType === 'Add') {
        entry[0] = entry[0].add(event.rawAmountBase);
        entry[1] = entry[1] + 1;
        entry[2] = event.blockNumber;
      } else if ( event.marketOrderEventType === 'Remove' ||
                  event.marketOrderEventType === 'PartialFill' ||
                  event.marketOrderEventType === 'CompleteFill' ) {
        entry[0] = entry[0].minus(event.rawAmountBase);
        if (event.marketOrderEventType !== 'PartialFill') {
          entry[1] = entry[1] - 1;
        }
        entry[2] = event.blockNumber;
      }
    }
    this.internalBook.set(event.pricePacked, entry);
  }

  addMarketTradeFromEvent = (event) => {
    if (event.marketOrderEventType === 'PartialFill' || event.marketOrderEventType === 'CompleteFill') {
      // could simplify by making this naturally sortable?
      this.addMarketTrade({
        marketTradeId: "" + event.blockNumber + "-" + event.logIndex,
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
        eventTimestamp: event.eventTimestamp,
        makerOrderId: event.orderId,
        makerPrice: UbiTokTypes.decodePrice(event.pricePacked),
        executedBase: this.formatBase(event.rawAmountBase),
      });
    }
  }

  addMarketTrade = (marketTrade) => {
    this.setState((prevState, props) => {
      let entry = {};
      entry[marketTrade.marketTradeId] = marketTrade;
      return {
        marketTrades: update(prevState.marketTrades, { $merge: entry })
      };
    });
  }
  
  startWalkBook = () => {
    console.log('startWalkBook ...');
    this.internalBook.clear();
    this.bridge.walkBook(1, this.handleWalkBook);
  }

  handleWalkBook = (error, result) => {
    console.log('handleWalkBook', error, result);
    if (error) {
      this.panic(error);
      return;
    }
    var pricePacked = result[0].toNumber();
    var depth = result[1];
    var orderCount = result[2].toNumber();
    var blockNumber = result[3].toNumber();
    var nextPricePacked;
    var done = false;
    if (!depth.isZero()) {
      this.internalBook.set(pricePacked, [depth, orderCount, blockNumber]);
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
      this.bridge.walkBook(nextPricePacked, this.handleWalkBook);
    } else {
      this.endWalkBook();
    }
  }

  updatePublicBook = () => {
    let bids = [];
    let asks = [];
    let sortedEntries = Array.from(this.internalBook.entries()).sort((a,b) => a[0]-b[0]);
    for (let entry of sortedEntries) {
      let pricePacked = entry[0];
      let rawDepth = entry[1][0];
      let orderCount = entry[1][1];
      if (rawDepth.comparedTo(0) <= 0) {
        continue;
      }
      let friendlyDepth = this.formatBase(rawDepth);
      let price = UbiTokTypes.decodePrice(pricePacked);
      if (pricePacked <= UbiTokTypes.minBuyPricePacked) {
        bids.push([price, friendlyDepth, orderCount]);
      } else {
        asks.push([price, friendlyDepth, orderCount]);
      }
    }
    asks.reverse();
    this.setState((prevState, props) => {
      return {
        book: update(prevState.book, {
          isComplete: {$set: true},
          bids: {$set: bids},
          asks: {$set: asks},
        })
      };
    });
  }

  endWalkBook = () => {
    console.log('book', this.internalBook);
    this.internalBookWalked = true;
    this.updatePublicBook();
    this.consumeQueuedMarketEvents();
  }

  handleWalkMyOrdersCallback = (error, result) => {
    if (error) {
      return this.panic(error);
    }
    var order = UbiTokTypes.decodeWalkClientOrder(result);
    if (order.status === "Unknown") {
      this.setState((prevState, props) => {
        return {
          myOrdersLoaded: update(prevState.myOrdersLoaded, {$set: true})
        };
      });
    } else {
      this.createMyOrder(order);
      this.bridge.walkMyOrders(order.orderId, this.handleWalkMyOrdersCallback);
    }
  }

  pollExchangeBalances = () => {
    this.bridge.getBalances((error, newClientBalances) => {
      if (error) {
        console.log(error);
        return;
      }
      this.setState((prevState, props) => {
        return {
          balances: update(prevState.balances, {
            exchange: {$set: [newClientBalances[0], newClientBalances[1]]},
            approved: {$set: [newClientBalances[2], newClientBalances[3]]},
            wallet:   {$set: [newClientBalances[4], newClientBalances[5]]},
          })
        }
      });
    });
  }

  handleNavSelect = (e) => {
    // TODO - load different page?
  }

  // TODO - totally wrong
  getValidationState = () => {
    const length = this.state.createOrder.buy.amountBase.length;
    if (length > 10) return 'success';
    else if (length > 5) return 'warning';
    else if (length > 0) return 'error';
  }

  // TODO - move some of this logic to UbiTokTypes?
  getCreateOrderAmountValidationResult = (direction) => {
    let directionKey = direction.toLowerCase();
    let amount = this.state.createOrder[directionKey].amountBase;
    let terms = this.state.createOrder[directionKey].terms;
    if (amount === undefined || amount.trim() === '') {
      return ['error', 'Amount is blank'];
    }
    let number = new BigNumber(NaN);
    try {
      number = new BigNumber(amount);
    } catch (e) {
    }
    if (number.isNaN() || !number.isFinite()) {
      return ['error', 'Amount does not look like a regular number'];
    }
    let rawAmountBase = UbiTokTypes.encodeBaseAmount(amount);
    let minInitialSize = this.state.pairInfo.base.minInitialSize;
    if (rawAmountBase.lt(UbiTokTypes.encodeBaseAmount(minInitialSize))) {
      return ['error', 'Amount is too small, must be at least ' + minInitialSize];
    }
    if (rawAmountBase.gte('1e32')) {
      return ['error', 'Amount is too large'];
    }
    if (direction === 'Sell') {
      let availableBalance = this.state.balances.exchange[0];
      if (availableBalance !== undefined && 
          rawAmountBase.gt(UbiTokTypes.encodeBaseAmount(availableBalance))) {
        return ['error', 'Your Book Contract ' + this.state.pairInfo.base.symbol +
          ' balance is too low, try a smaller amount or deposit more funds'];
      }
    }
    let helpMsg = undefined;
    if (direction === 'Buy' && terms !== 'MakerOnly') {
      let rawFees = rawAmountBase.times('0.0005');
      helpMsg = 'A fee of up to ' + UbiTokTypes.decodeBaseAmount(rawFees) + ' ' + this.state.pairInfo.base.symbol + ' may be deducted';
    }
    return ['success', helpMsg];
  }

  getCreateOrderPriceValidationResult = (direction) => {
    let directionKey = direction.toLowerCase();
    let pricePart = this.state.createOrder[directionKey].price;
    let errorAndResult = UbiTokTypes.parseFriendlyPricePart(direction, pricePart);
    if (errorAndResult[0]) {
      let error = errorAndResult[0];
      let helpMsg = 'Price ' + error.msg;
      if (error.suggestion) {
        helpMsg += '. Perhaps try ' + error.suggestion + '?';
      }
      return ['error', helpMsg];
    }
    return ['success', undefined];
  }

  getCreateOrderCostValidationResult = () => {
    let direction = 'Buy';
    let directionKey = direction.toLowerCase();
    let amount = this.state.createOrder[directionKey].amountBase;
    let pricePart = this.state.createOrder[directionKey].price;
    let cost = new BigNumber(NaN);
    try {
      cost = (new BigNumber(amount)).times(new BigNumber(pricePart));
    } catch (e) {
    }
    if (cost.isNaN()) {
      return [null, undefined, 'N/A'];
    }
    let displayedCost = cost.toFixed();
    let rawCost = UbiTokTypes.encodeCntrAmount(cost);
    let minInitialSize = this.state.pairInfo.cntr.minInitialSize;
    if (rawCost.lt(UbiTokTypes.encodeCntrAmount(minInitialSize))) {
      return ['error', 'Cost is too small (must be at least ' + minInitialSize + '), try a larger amount', displayedCost];
    }
    if (rawCost.gte('1e32')) {
      return ['error', 'Cost is too large, try a smaller amount'];
    }
    let availableBalance = this.state.balances.exchange[1];
    if (availableBalance !== undefined &&
        rawCost.gt(UbiTokTypes.encodeCntrAmount(availableBalance))) {
      return ['error', 'Your Book Contract ' + this.state.pairInfo.cntr.symbol +
        ' balance is too low, try a smaller amount or deposit more funds' +
        ' (remember to leave a little in your account for gas)', displayedCost];
    }
    return ['success', undefined, displayedCost];
  }

  getCreateOrderProceedsValidationResult = () => {
    let direction = 'Sell';
    let directionKey = direction.toLowerCase();
    let amount = this.state.createOrder[directionKey].amountBase;
    let pricePart = this.state.createOrder[directionKey].price;
    let terms = this.state.createOrder[directionKey].terms;
    let proceeds = new BigNumber(NaN);
    try {
      proceeds = (new BigNumber(amount)).times(new BigNumber(pricePart));
    } catch (e) {
    }
    if (proceeds.isNaN()) {
      return [null, undefined, 'N/A'];
    }
    let displayedProceeds = proceeds.toFixed();
    let rawProceeds = UbiTokTypes.encodeCntrAmount(proceeds);
    let minInitialSize = this.state.pairInfo.cntr.minInitialSize;
    if (rawProceeds.lt(UbiTokTypes.encodeCntrAmount(minInitialSize))) {
      return ['error', 'Proceeds are too small (must be at least ' + minInitialSize + '), try a larger amount', displayedProceeds];
    }
    if (rawProceeds.gte('1e32')) {
      return ['error', 'Proceeds are too large, try a smaller amount'];
    }
    let helpMsg = undefined;
    if (terms !== 'MakerOnly') {
      let rawFees = rawProceeds.times('0.0005');
      helpMsg = 'A fee of up to ' + UbiTokTypes.decodeCntrAmount(rawFees) + ' ' + this.state.pairInfo.cntr.symbol + ' may be deducted';
    }
    return ['success', helpMsg, displayedProceeds];
  }
  
  getCreateOrderTermsValidationResult = (direction) => {
    let directionKey = direction.toLowerCase();
    let amount = this.state.createOrder[directionKey].amountBase;
    let pricePart = this.state.createOrder[directionKey].price;
    let terms = this.state.createOrder[directionKey].terms;
    // TODO - check if e.g. maker only will take, or others will have crazee number of matches?
    return ['success', undefined];
  }
  
  handleCreateOrderSideSelect = (e) => {
    var v = e; // no event object for this one?
    this.setState((prevState, props) => {
      return {
        createOrder: update(prevState.createOrder, {
          side: {$set: v},
        })
      }
    });
  }

  handleCreateOrderBuyAmountBaseChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        createOrder: update(prevState.createOrder, {
          buy: { amountBase: { $set: v } }
        })
      };
    });
  }

  handleCreateOrderSellAmountBaseChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        createOrder: update(prevState.createOrder, {
          sell: { amountBase: { $set: v } }
        })
      };
    });
  }

  handleCreateOrderBuyPriceChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        createOrder: update(prevState.createOrder, {
          buy: { price: { $set: v } }
        })
      };
    });
  }

  handleCreateOrderSellPriceChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        createOrder: update(prevState.createOrder, {
          sell: { price: { $set: v } }
        })
      };
    });
  }

  handleCreateOrderBuyTermsChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        createOrder: update(prevState.createOrder, {
          buy: { terms: { $set: v } }
        })
      };
    });
  }
  
  handleCreateOrderSellTermsChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        createOrder: update(prevState.createOrder, {
          sell: { terms: { $set: v } }
        })
      };
    });
  }
  
  handlePlaceBuyOrder = (e) => {
    var orderId = UbiTokTypes.generateDecodedOrderId();
    var price = "Buy @ " + this.state.createOrder.buy.price;
    var sizeBase = this.state.createOrder.buy.amountBase;
    var terms = this.state.createOrder.buy.terms;
    let callback = (error, result) => {
      this.handlePlaceOrderCallback(orderId, error, result);
    };
    this.bridge.submitCreateOrder(orderId, price, sizeBase, terms, callback);
    var newOrder = this.fillInSendingOrder(orderId, price, sizeBase, terms);
    this.createMyOrder(newOrder);
  }

  handlePlaceSellOrder = (e) => {
    var orderId = UbiTokTypes.generateDecodedOrderId();
    var price = "Sell @ " + this.state.createOrder.sell.price;
    var sizeBase = this.state.createOrder.sell.amountBase;
    var terms = this.state.createOrder.sell.terms;
    let callback = (error, result) => {
      this.handlePlaceOrderCallback(orderId, error, result);
    };
    this.bridge.submitCreateOrder(orderId, price, sizeBase, terms, callback);
    var newOrder = this.fillInSendingOrder(orderId, price, sizeBase, terms);
    this.createMyOrder(newOrder);
  }

  isInMyOrders = (orderId) => {
    return this.state.myOrders.hasOwnProperty(orderId);
  }

  createMyOrder = (order) => {
    let sourceObject = {};
    sourceObject[order.orderId] = order;
    this.setState((prevState, props) => {
      return {
        myOrders: update(prevState.myOrders, {$merge: sourceObject})
      };
    });
  }

  updateMyOrder = (orderId, partialOrder) => {
    let query = {};
    query[orderId] = { $merge: partialOrder };
    this.setState((prevState, props) => {
      return {
        myOrders: update(prevState.myOrders, query)
      };
    });
  }
  
  // TODO - move to UbiTokTypes?
  fillInSendingOrder = (orderId, price, sizeBase, terms) => {
    return {
      orderId: orderId,
      price: price,
      sizeBase: sizeBase,
      terms: terms,
      status: "Sending",
      reasonCode: "None",
      rawExecutedBase: new BigNumber(0),
      rawExecutedCntr: new BigNumber(0),
      rawFees: new BigNumber(0),
      modifyInProgress: undefined,
      txnHash: undefined
    };
  }

  refreshOrder = (orderId) => {
    this.bridge.getOrderState(orderId, (error, result) => {
      if (error) {
        this.warn(error);
        // TODO - retry?
        return;
      }
      if (result) {
        this.updateMyOrder(orderId, result);
      }
    });
  }

  handlePlaceOrderCallback = (orderId, error, result) => {
    console.log('might have placed order', orderId, error, result);
    if (error) {
      this.updateMyOrder(orderId, { status: "FailedSend" });
    } else {
      if (result.event === 'GotTxnHash') {
        this.updateMyOrder(orderId, {txnHash: result.txnHash});
      } else if (result.event === 'Mined') {
        this.refreshOrder(orderId);
      }
    }
  }

  handleModifyOrderCallback = (orderId, error, result) => {
    console.log('might have done something to order', orderId, error, result);
    var existingOrder = this.state.myOrders[orderId];
    if (error) {
      this.updateMyOrder(orderId, { modifyInProgress: undefined });
    } else {
      if (result.event === 'GotTxnHash') {
        // TODO - suppose should try to convey the txn hash for cancel/continue somehow
      } else if (result.event === 'Mined') {
        // TODO - but what if someone does multiple cancels/continues ...
        this.updateMyOrder(orderId, { modifyInProgress: undefined });
        this.refreshOrder(orderId);
      }
    }
  }
  
  handleClickMoreInfo = (orderId) => {
    this.setState((prevState, props) => {
      return {
        showOrderInfo: true,
        orderInfoOrderId: orderId
      };
    });
  }

  handleOrderInfoCloseClick = () => {
    this.setState((prevState, props) => {
      return {
        showOrderInfo: false
      };
    });
  }

  handleClickCancelOrder = (orderId) => {
    let callback = (error, result) => {
      this.handleModifyOrderCallback(orderId, error, result);
    };
    this.updateMyOrder(orderId, {modifyInProgress: "Cancelling"});
    this.bridge.submitCancelOrder(orderId, callback);
  }

  handleClickContinueOrder = (orderId) => {
    let callback = (error, result) => {
      this.handleModifyOrderCallback(orderId, error, result);
    };
    this.updateMyOrder(orderId, {modifyInProgress: "Continuing"});
    this.bridge.submitContinueOrder(orderId, callback);
  }

  handleClickHideOrder = (orderId) => {
    this.setState((prevState, props) => {
      return {
        myOrders: update(prevState.myOrders, {$unset: [orderId]})
      };
    });
  }
  
  handleDepositBaseNewApprovedAmountChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        depositBase: update(prevState.depositBase, {
          newApprovedAmount: { $set: v }
        })
      };
    });
  }

  handleDepositBaseSetApprovedAmountClick = () => {
    // TODO - amount validation, check account unlocked
    let pmtId = this.createPaymentEntry('Approve ' + this.state.pairInfo.base.symbol, this.state.depositBase.newApprovedAmount);
    this.bridge.submitDepositBaseApprove(this.state.depositBase.newApprovedAmount,
      (error, result) => { this.handlePaymentCallback(pmtId, error, result) });
  }

  handleDepositBaseCollectClick = () => {
    // TODO - amount validation, check account unlocked
    let pmtId = this.createPaymentEntry('Collect ' + this.state.pairInfo.base.symbol, 'N/A');
    this.bridge.submitDepositBaseCollect(
      (error, result) => { this.handlePaymentCallback(pmtId, error, result) });
  }

  handleWithdrawBaseAmountChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        withdrawBase: update(prevState.withdrawBase, {
          amount: { $set: v }
        })
      };
    });
  }  
  
  handleWithdrawBaseClick = () => {
    // TODO - amount validation, check account unlocked
    let pmtId = this.createPaymentEntry('Withdraw ' + this.state.pairInfo.base.symbol, this.state.withdrawBase.amount);
    this.bridge.submitWithdrawBaseTransfer(this.state.withdrawBase.amount,
      (error, result) => { this.handlePaymentCallback(pmtId, error, result) });
  }  

  handleDepositCntrAmountChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        depositCntr: update(prevState.depositCntr, {
          amount: { $set: v }
        })
      };
    });
  }  
  
  handleDepositCntrClick = () => {
    // TODO - amount validation, check account unlocked
    let pmtId = this.createPaymentEntry('Deposit ' + this.state.pairInfo.cntr.symbol, this.state.depositCntr.amount);
    this.bridge.submitDepositCntr(this.state.depositCntr.amount,
      (error, result) => { this.handlePaymentCallback(pmtId, error, result) });
  }  

  handleWithdrawCntrAmountChange = (e) => {
    var v = e.target.value;
    this.setState((prevState, props) => {
      return {
        withdrawCntr: update(prevState.withdrawCntr, {
          amount: { $set: v }
        })
      };
    });
  }  
  
  handleWithdrawCntrClick = () => {
    // TODO - amount validation, check account unlocked
    let pmtId = this.createPaymentEntry('Withdraw ' + this.state.pairInfo.cntr.symbol, this.state.withdrawCntr.amount);
    this.bridge.submitWithdrawCntr(this.state.withdrawCntr.amount,
      (error, result) => { this.handlePaymentCallback(pmtId, error, result) });
  }

  handlePaymentCallback = (pmtId, error, result) => {
    if (error) {
      this.updatePaymentEntry(pmtId, {pmtStatus: 'FailedSend'});
      return;
    } else {
      if (result.event === 'GotTxnHash') {
        this.updatePaymentEntry(pmtId, {txnHash: result.txnHash});
      } else if (result.event === 'Mined') {
        this.updatePaymentEntry(pmtId, {pmtStatus: 'Mined'});
      }
    }
  }

  handleClickHidePayment = (pmtId) => {
    this.setState((prevState, props) => {
      return {
        paymentHistory: prevState.paymentHistory.filter((entry) => {
          return entry.pmtId !== pmtId;
        })
      };
    });
  }

  createPaymentEntry = (action, amount) => {
    let pmtId = UbiTokTypes.uuidv4();
    let createdAt = new Date();
    var newEntry = {
      pmtId: pmtId,
      createdAt: createdAt,
      txnHash: undefined,
      action: action,
      amount: amount,
      pmtStatus: 'Sending'
    };
    this.setState((prevState, props) => {
      return {
        paymentHistory: update(prevState.paymentHistory, { $unshift: [newEntry] })
      };
    });
    return pmtId;
  }

  updatePaymentEntry = (pmtId, partialPmtEntry) => {
    this.setState((prevState, props) => {
      return {
        paymentHistory: prevState.paymentHistory.map((entry) => {
          if (entry.pmtId !== pmtId) {
            return entry;
          } else {
            return update(entry, {$merge: partialPmtEntry});
          }
        })
      };
    });
  }
  
  render() {
    return (
      <div className="App">
        <div className="App-header">
          <img src={logo} className="App-logo" alt="UbiTok.io" /> the unstoppable Ethereum token exchange
        </div>
          <Grid>
            <Row>
              <Navbar inverse>
                <Nav>
                  <MyNavForm id="productSelectForm">
                    <FormGroup controlId="productSelect">
                      <FormControl componentClass="select" placeholder="Choose book">
                        <option value="UBI/ETH">Book: UBI/ETH</option>
                      </FormControl>
                    </FormGroup>
                  </MyNavForm>
                </Nav>
                <Nav bsStyle="pills" activeKey={2} onSelect={this.handleNavSelect} pullRight>
                  <NavItem eventKey={1} href="#">Home</NavItem>
                  <NavItem eventKey={2} href="#">Exchange</NavItem>
                  <NavItem eventKey={3} href="#">Help</NavItem>
                </Nav>
              </Navbar>
            </Row>
            <Row>
              <Col md={12}>
                {!this.state.bridgeStatus.web3Present ? (
                <Panel header="No Ethereum Connection" bsStyle="danger">
                  <p>UbiTok.io needs to connect to the Ethereum network via a local client, but could not find one.</p>
                  <p>We suggest using one of the following clients to connect to Ethereum:</p>
                  <Row>
                      <Col sm={6}>
                          <a href="https://metamask.io/" target="_blank">
                            <h4>Metamask Chrome Extension</h4>
                            <img src={metamaskLogo} className="Metamask-logo" alt="Metamask" />
                          </a>
                      </Col>
                      <Col sm={6}>
                          <a href="https://github.com/ethereum/mist/releases" target="_blank">
                            <h4>Mist Browser</h4>
                            <img src={mistLogo} className="Mist-logo" alt="Mist" />
                          </a>
                      </Col>
                  </Row>
                </Panel>
                ) : this.state.bridgeStatus.unsupportedNetwork ? (
                <Panel header="Unsupported Ethereum Network" bsStyle="danger">
                  <p>UbiTok.io is currently only available on the Ropsten Test Network.</p>
                  <p>Try changing Ethereum Network in your Ethereum Client (e.g. Metamask, Mist).</p>
                </Panel>
                ) : this.state.bridgeStatus.networkChanged ? (
                <Panel header="Ethereum Network Changed" bsStyle="danger">
                  <p>You seem to have changed Ethereum Network.</p>
                  <p>Try changing Ethereum Network in your Ethereum Client (e.g. Metamask, Mist)
                     back to {this.state.bridgeStatus.chosenSupportedNetworkName}, or reload this page to pick up the new network.</p>
                </Panel>
                ) : this.state.bridgeStatus.accountLocked ? (
                <Panel header="Ethereum Account Locked" bsStyle="danger">
                  <p>UbiTok.io needs to know which Ethereum account to use.</p>
                  <p>Try unlocking your Ethereum Client (e.g. Metamask, Mist).</p>
                </Panel>
                ) : this.state.bridgeStatus.accountChanged ? (
                <Panel header="Ethereum Account Changed" bsStyle="danger">
                  <p>You seem to have changed Ethereum Account.</p>
                  <p>Try changing Ethereum Account in your Ethereum Client (e.g. Metamask, Mist)
                     back to {this.state.bridgeStatus.chosenAccount}, or reload this page to pick up the new account.</p>
                </Panel>
                ) : (!this.state.bridgeStatus.canMakePublicCalls || !this.state.bridgeStatus.canMakeAccountCalls) ? (
                <Panel header="Unknown Ethereum Connection Problem" bsStyle="danger">
                  <p>Some unusual problem has occurred preventing UbiTok.io connecting to the Ethereum Network.</p>
                  <p>Try reloading this page, or contact help@ubitok.io with details of the problem.</p>
                </Panel>
                ) : (
                <Well bsSize="small">
                  <Glyphicon glyph="info-sign" title="Ethereum Connection Info" />
                  &nbsp;Using Ethereum Account {this.state.bridgeStatus.chosenAccount} on {this.state.bridgeStatus.chosenSupportedNetworkName} via a local client.
                </Well>
                )}
              </Col>
            </Row>
            <Row>
              <Col md={4}>
                <h3>{this.state.pairInfo.symbol} Info</h3>
                <Table striped bordered condensed hover>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Base</th>
                      <th>Counter</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Symbol</td>
                      <td>{this.state.pairInfo.base.symbol}</td>
                      <td>{this.state.pairInfo.cntr.symbol}</td>
                    </tr>
                    <tr>
                      <td>Name</td>
                      <td>{this.state.pairInfo.base.name}</td>
                      <td>{this.state.pairInfo.cntr.name}</td>
                    </tr>
                    <tr>
                      <td>Type</td>
                      <td>{this.state.pairInfo.base.tradableType}</td>
                      <td>{this.state.pairInfo.cntr.tradableType}</td>
                    </tr>
                    <tr>
                      <td>Minimum Order</td>
                      <td>{this.state.pairInfo.base.minInitialSize}</td>
                      <td>{this.state.pairInfo.cntr.minInitialSize}</td>
                    </tr>
                  </tbody>
                </Table>
                <h3>Balances and Payments</h3>
                <Table bordered condensed id="funds-table">
                  <tbody>
                    <tr>
                      <th colSpan="2">
                        {this.state.pairInfo.base.symbol}
                        <ButtonToolbar className="pull-right">
                          <Button bsStyle="primary" bsSize="xsmall" onClick={() => this.setState({paymentTabKey: "depositBase"})}>Deposit</Button>
                          <Button bsStyle="warning" bsSize="xsmall" onClick={() => this.setState({paymentTabKey: "withdrawBase"})}>Withdraw</Button>
                        </ButtonToolbar>
                      </th>
                    </tr>
                    <tr>
                      <td style={{width:"50%"}}>Book Contract</td>
                      <th>{this.state.balances.exchange[0]}</th>
                    </tr>
                    <tr>
                      <td>Your Account</td>
                      <td>{this.state.balances.wallet[0]}</td>
                    </tr>
                    <tr>
                      <th colSpan="2">
                        {this.state.pairInfo.cntr.symbol}
                        <ButtonToolbar className="pull-right">
                          <Button bsStyle="primary" bsSize="xsmall" onClick={() => this.setState({paymentTabKey: "depositCntr"})}>Deposit</Button>
                          <Button bsStyle="warning" bsSize="xsmall" onClick={() => this.setState({paymentTabKey: "withdrawCntr"})}>Withdraw</Button>
                        </ButtonToolbar>
                      </th>
                    </tr>
                    <tr>
                      <td>Book Contract</td>
                      <th>{this.state.balances.exchange[1]}</th>
                    </tr>
                    <tr>
                      <td>Your Account</td>
                      <td>{this.state.balances.wallet[1]}</td>
                    </tr>
                    { (this.state.paymentHistory.length > 0) ? (
                      <tr>
                        <th colSpan="2">History</th>
                      </tr>
                    ) : undefined }
                    {this.state.paymentHistory.map((entry) =>
                      <tr key={entry.pmtId}>
                        <td>
                          { (entry.pmtStatus === 'Sending') ? (
                            <Spinner name="line-scale" color="purple"/>
                          ) : null }
                          { (entry.pmtStatus === 'FailedSend') ? (
                            <Glyphicon glyph="warning-sign" text="failed to send payment" />
                          ) : null }
                          <EthTxnLink txnHash={entry.txnHash} networkName={this.state.bridgeStatus.chosenSupportedNetworkName} />
                          {entry.action}
                        </td>
                        <td>
                          {entry.amount}
                          { (entry.pmtStatus !== 'Sending') ? (
                          <Button bsSize="xsmall" className="pull-right" bsStyle="default" onClick={() => this.handleClickHidePayment(entry.pmtId)}>
                            <Glyphicon glyph="eye-close" title="hide payment" />
                          </Button>
                          ) : null }
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
                <Tab.Container activeKey={this.state.paymentTabKey} onSelect={()=>{}} id="payment-tabs">
                  <Tab.Content>
                    <Tab.Pane eventKey="none" className="emptyTabPane">
                    </Tab.Pane>
                    <Tab.Pane eventKey="depositBase">
                      <p>
                        <b>Deposit {this.state.pairInfo.base.symbol}</b>
                        <Button bsSize="xsmall" className="pull-right" bsStyle="default" onClick={() => this.setState({paymentTabKey: "none"})}>
                          <Glyphicon glyph="remove" title="close" />
                        </Button>
                      </p>
                      <form id="depositBaseForm">
                        <FormGroup controlId="step0">
                          <ControlLabel>Step 0</ControlLabel>
                          <HelpBlock>
                          If you have {this.state.pairInfo.base.symbol} tokens in another exchange or account,
                          you'll first need to withdraw/transfer them to your account: {this.state.bridgeStatus.chosenAccount}
                          </HelpBlock>
                        </FormGroup>
                        <FormGroup controlId="approval">
                          <ControlLabel>Step 1</ControlLabel>
                          <HelpBlock>
                          You need to <i>approve</i> the {this.state.pairInfo.symbol} book contract to allow it to receive your tokens.
                          </HelpBlock>
                          <InputGroup>
                            <InputGroup.Addon>Current Approved Amount</InputGroup.Addon>
                            <FormControl type="text" value={this.state.balances.approved[0]} readOnly onChange={()=>{}}/>
                            <InputGroup.Addon>{this.state.pairInfo.base.symbol}</InputGroup.Addon>
                          </InputGroup>
                          <HelpBlock>
                          This is where you choose how much to deposit.
                          </HelpBlock>
                          <InputGroup>
                            <InputGroup.Addon>New Approved Amount</InputGroup.Addon>
                            <FormControl type="text" value={this.state.depositBase.newApprovedAmount} onChange={this.handleDepositBaseNewApprovedAmountChange}/>
                            <InputGroup.Addon>{this.state.pairInfo.base.symbol}</InputGroup.Addon>
                          </InputGroup>
                          <SendingButton bsStyle="primary" onClick={this.handleDepositBaseSetApprovedAmountClick} text="Set Approved Amount" />
                          <FormControl.Feedback />
                        </FormGroup>
                        <FormGroup controlId="collection">
                          <ControlLabel>Step 2</ControlLabel>
                          <HelpBlock>
                          Finally, you need to tell the book contract to receive the {this.state.pairInfo.base.symbol} tokens you approved:
                          </HelpBlock>
                          <SendingButton bsStyle="primary" onClick={this.handleDepositBaseCollectClick} text={'Collect Approved ' + this.state.pairInfo.base.symbol} />
                        </FormGroup>
                      </form>
                    </Tab.Pane>
                    <Tab.Pane eventKey="withdrawBase">
                      <p>
                        <b>Withdraw {this.state.pairInfo.base.symbol}</b>
                        <Button bsSize="xsmall" className="pull-right" bsStyle="default" onClick={() => this.setState({paymentTabKey: "none"})}>
                          <Glyphicon glyph="remove" title="close" />
                        </Button>
                      </p>
                      <form id="withdrawBaseForm">
                        <FormGroup controlId="transferAmount">
                          <HelpBlock>
                          This will transfer {this.state.pairInfo.base.symbol} tokens held for you
                          by the {this.state.pairInfo.symbol} book contract to your account:
                          {' '}{this.state.bridgeStatus.chosenAccount}
                          </HelpBlock>
                          <InputGroup>
                            <InputGroup.Addon>Withdrawal Amount</InputGroup.Addon>
                            <FormControl type="text" value={this.state.withdrawBase.amount} onChange={this.handleWithdrawBaseAmountChange}/>
                            <InputGroup.Addon>{this.state.pairInfo.base.symbol}</InputGroup.Addon>
                          </InputGroup>
                          <SendingButton bsStyle="warning" onClick={this.handleWithdrawBaseClick} text={'Withdraw ' + this.state.pairInfo.base.symbol} />
                          <FormControl.Feedback />
                        </FormGroup>
                      </form>
                    </Tab.Pane>
                    <Tab.Pane eventKey="depositCntr">
                      <p>
                        <b>Deposit {this.state.pairInfo.cntr.symbol}</b>
                        <Button bsSize="xsmall" className="pull-right" bsStyle="default" onClick={() => this.setState({paymentTabKey: "none"})}>
                          <Glyphicon glyph="remove" title="close" />
                        </Button>
                      </p>
                      <form id="depositCntrForm">
                        <FormGroup controlId="step0">
                          <ControlLabel>Step 0</ControlLabel>
                          <HelpBlock>
                          If you have {this.state.pairInfo.cntr.symbol} in another exchange or account,
                          you'll first need to withdraw/transfer them to your account: {this.state.bridgeStatus.chosenAccount}
                          </HelpBlock>
                        </FormGroup>
                        <FormGroup controlId="transferAmount">
                          <ControlLabel>Step 1</ControlLabel>
                          <HelpBlock>
                          This will send {this.state.pairInfo.cntr.symbol} from your account
                          to the {this.state.pairInfo.symbol} book contract:
                          </HelpBlock>
                          <InputGroup>
                            <InputGroup.Addon>Deposit Amount</InputGroup.Addon>
                            <FormControl type="text" value={this.state.depositCntr.amount} onChange={this.handleDepositCntrAmountChange}/>
                            <InputGroup.Addon>{this.state.pairInfo.cntr.symbol}</InputGroup.Addon>
                          </InputGroup>
                          <SendingButton bsStyle="primary" onClick={this.handleDepositCntrClick} text={'Deposit ' + this.state.pairInfo.cntr.symbol} />
                          <FormControl.Feedback />
                          <HelpBlock>
                          Don't forget to leave some {this.state.pairInfo.cntr.symbol} in your account to pay for gas fees.
                          </HelpBlock>
                        </FormGroup>
                      </form>
                    </Tab.Pane>
                    <Tab.Pane eventKey="withdrawCntr">
                      <p>
                        <b>Withdraw {this.state.pairInfo.cntr.symbol}</b>
                        <Button bsSize="xsmall" className="pull-right" bsStyle="default" onClick={() => this.setState({paymentTabKey: "none"})}>
                          <Glyphicon glyph="remove" title="close" />
                        </Button>
                      </p>
                      <form id="withdrawCntrForm">
                        <FormGroup controlId="transferAmount">
                          <HelpBlock>
                          This will send {this.state.pairInfo.cntr.symbol} held for you
                          by the {this.state.pairInfo.symbol} book contract to your account:
                          {' '}{this.state.bridgeStatus.chosenAccount}
                          </HelpBlock>
                          <InputGroup>
                            <InputGroup.Addon>Withdrawal Amount</InputGroup.Addon>
                            <FormControl type="text" value={this.state.withdrawCntr.amount} onChange={this.handleWithdrawCntrAmountChange}/>
                            <InputGroup.Addon>{this.state.pairInfo.cntr.symbol}</InputGroup.Addon>
                          </InputGroup>
                          <SendingButton bsStyle="warning" onClick={this.handleWithdrawCntrClick} text={'Withdraw ' + this.state.pairInfo.cntr.symbol} />
                          <FormControl.Feedback />
                        </FormGroup>
                      </form>
                    </Tab.Pane>
                  </Tab.Content>
                </Tab.Container>
              </Col>
              <Col md={4}>
                <h3>Order Book</h3>
                  {/* TODO - need max-height */}
                  <Table striped bordered condensed hover>
                    <thead>
                      <tr>
                        <th>Ask Price</th>
                        <th>Depth ({this.state.pairInfo.base.symbol})</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {this.state.book.asks.map((entry) =>
                      <tr key={entry[0]}>
                        <td className={this.chooseClassNameForPrice(entry[0])}>{entry[0]}</td>
                        <td>{entry[1]}</td>
                        <td>{entry[2]}</td>
                      </tr>
                      )}
                    </tbody>
                  </Table>
                  <Table striped bordered condensed hover>
                    <thead>
                      <tr>
                        <th>Bid Price</th>
                        <th>Depth ({this.state.pairInfo.base.symbol})</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {this.state.book.bids.map((entry) =>
                      <tr key={entry[0]}>
                        <td className={this.chooseClassNameForPrice(entry[0])}>{entry[0]}</td>
                        <td>{entry[1]}</td>
                        <td>{entry[2]}</td>
                      </tr>
                      )}
                    </tbody>
                  </Table>
              </Col>
              <Col md={4}>
                {/*
                <h3>Price History</h3>
                <img src={mockPriceChart} alt="insufficient data for a meaningful price chart" />
                */}
                <h3>Market Trades</h3>
                  <Table striped bordered condensed hover>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Maker Price</th>
                        <th>Traded Size ({this.state.pairInfo.base.symbol})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(this.state.marketTrades)
                        .sort(this.cmpMarketTradeIds)
                        .map((marketTradeId) => this.state.marketTrades[marketTradeId])
                        .map((entry) =>
                      <tr key={entry.marketTradeId}>
                        <td>{this.formatEventDate(entry.eventTimestamp)}</td>
                        <td className={this.chooseClassNameForPrice(entry.makerPrice)}>{entry.makerPrice}</td>
                        <td>{entry.executedBase}</td>
                      </tr>
                      )}
                    </tbody>
                  </Table>
              </Col>
            </Row>
            <Row>
              <Col md={4}>
                <h3>Create Order</h3>
                <Tabs activeKey={this.state.createOrder.side} onSelect={this.handleCreateOrderSideSelect} id="create-order-side">
                  <Tab eventKey="buy" title={"BUY " + this.state.pairInfo.base.symbol}>
                    <FormGroup controlId="createOrderBuyAmount" validationState={this.getCreateOrderAmountValidationResult('Buy')[0]}>
                      <InputGroup>
                        <InputGroup.Addon>Amount</InputGroup.Addon>
                        <FormControl
                          type="text"
                          value={this.state.createOrder.buy.amountBase}
                          placeholder={"How many " + this.state.pairInfo.base.symbol + " to buy"}
                          onChange={this.handleCreateOrderBuyAmountBaseChange}
                        />
                        <InputGroup.Addon>{this.state.pairInfo.base.symbol}</InputGroup.Addon>
                      </InputGroup>
                      <HelpBlock>{this.getCreateOrderAmountValidationResult('Buy')[1]}</HelpBlock>
                    </FormGroup>
                    <FormGroup controlId="createOrderBuyPrice" validationState={this.getCreateOrderPriceValidationResult('Buy')[0]}>
                      <InputGroup>
                        <InputGroup.Addon>Price</InputGroup.Addon>
                        <InputGroup.Addon>Buy @ </InputGroup.Addon>
                        <FormControl
                          type="text"
                          value={this.state.createOrder.buy.price}
                          placeholder={"How many " + this.state.pairInfo.cntr.symbol + " per " + this.state.pairInfo.base.symbol}
                          onChange={this.handleCreateOrderBuyPriceChange}
                        />
                      </InputGroup>
                      <HelpBlock>{this.getCreateOrderPriceValidationResult('Buy')[1]}</HelpBlock>
                    </FormGroup>
                    <FormGroup controlId="createOrderBuyCost" validationState={this.getCreateOrderCostValidationResult()[0]}>
                      <InputGroup>
                        <InputGroup.Addon>Cost</InputGroup.Addon>
                        <FormControl type="text" value={this.getCreateOrderCostValidationResult()[2]} readOnly onChange={()=>{}}/>
                        <InputGroup.Addon>{this.state.pairInfo.cntr.symbol}</InputGroup.Addon>
                      </InputGroup>
                      <HelpBlock>{this.getCreateOrderCostValidationResult()[1]}</HelpBlock>
                    </FormGroup>
                    <FormGroup controlId="createOrderBuyTerms" validationState={this.getCreateOrderTermsValidationResult('Buy')[0]}>
                      <ControlLabel>Terms</ControlLabel>
                      <FormControl componentClass="select" value={this.state.createOrder.buy.terms} onChange={this.handleCreateOrderBuyTermsChange}>
                        <option value="GTCNoGasTopup">Good Till Cancel (no gas topup)</option>
                        <option value="GTCWithGasTopup">Good Till Cancel (gas topup enabled)</option>
                        <option value="ImmediateOrCancel">Immediate Or Cancel</option>
                        <option value="MakerOnly">Maker Only</option>
                      </FormControl>
                      <HelpBlock>{this.getCreateOrderTermsValidationResult('Buy')[1]}</HelpBlock>
                    </FormGroup>
                    <FormGroup>
                      <ButtonToolbar>
                        <SendingButton bsStyle="primary" onClick={this.handlePlaceBuyOrder} text="Place Buy Order" />
                      </ButtonToolbar>
                      <HelpBlock>
                        Please read our <a target="_blank" href="http://ubitok.io/trading-rules.html">Trading Rules</a> for help and terms.
                      </HelpBlock>
                    </FormGroup>
                  </Tab>
                  <Tab eventKey={"sell"} title={"SELL " + this.state.pairInfo.base.symbol}>
                    <FormGroup controlId="createOrderSellAmount" validationState={this.getCreateOrderAmountValidationResult('Sell')[0]}>
                      <InputGroup>
                        <InputGroup.Addon>Amount</InputGroup.Addon>
                        <FormControl
                          type="text"
                          value={this.state.createOrder.sell.amountBase}
                          placeholder={"How many " + this.state.pairInfo.base.symbol + " to sell"}
                          onChange={this.handleCreateOrderSellAmountBaseChange}
                        />
                        <InputGroup.Addon>{this.state.pairInfo.base.symbol}</InputGroup.Addon>
                      </InputGroup>
                      <HelpBlock>{this.getCreateOrderAmountValidationResult('Sell')[1]}</HelpBlock>
                    </FormGroup>
                    <FormGroup controlId="createOrderSellPrice" validationState={this.getCreateOrderPriceValidationResult('Sell')[0]}>
                      <InputGroup>
                        <InputGroup.Addon>Price</InputGroup.Addon>
                        <InputGroup.Addon>Sell @ </InputGroup.Addon>
                        <FormControl
                          type="text"
                          value={this.state.createOrder.sell.price}
                          placeholder={"How many " + this.state.pairInfo.cntr.symbol + " per " + this.state.pairInfo.base.symbol}
                          onChange={this.handleCreateOrderSellPriceChange}
                        />
                      </InputGroup>
                      <HelpBlock>{this.getCreateOrderPriceValidationResult('Sell')[1]}</HelpBlock>
                    </FormGroup>
                    <FormGroup controlId="createOrderSellProceeds" validationState={this.getCreateOrderProceedsValidationResult()[0]}>
                      <InputGroup>
                        <InputGroup.Addon>Proceeds</InputGroup.Addon>
                        <FormControl type="text" value={this.getCreateOrderProceedsValidationResult()[2]} readOnly onChange={()=>{}}/>
                        <InputGroup.Addon>{this.state.pairInfo.cntr.symbol}</InputGroup.Addon>
                      </InputGroup>
                      <HelpBlock>{this.getCreateOrderProceedsValidationResult()[1]}</HelpBlock>
                    </FormGroup>
                    <FormGroup controlId="createOrderSellTerms" validationState={this.getCreateOrderTermsValidationResult('Sell')[0]}>
                      <ControlLabel>Terms</ControlLabel>
                      <FormControl componentClass="select" value={this.state.createOrder.sell.terms} onChange={this.handleCreateOrderSellTermsChange}>
                        <option value="GTCNoGasTopup">Good Till Cancel (no gas topup)</option>
                        <option value="GTCWithGasTopup">Good Till Cancel (gas topup enabled)</option>
                        <option value="ImmediateOrCancel">Immediate Or Cancel</option>
                        <option value="MakerOnly">Maker Only</option>
                      </FormControl>
                      <HelpBlock>{this.getCreateOrderTermsValidationResult('Sell')[1]}</HelpBlock>
                    </FormGroup>
                    <FormGroup>
                      <ButtonToolbar>
                        <SendingButton bsStyle="warning" onClick={this.handlePlaceSellOrder} text="Place Sell Order" />
                      </ButtonToolbar>
                      <HelpBlock>
                        Please read our <a target="_blank" href="http://ubitok.io/trading-rules.html">Trading Rules</a> for help and terms.
                      </HelpBlock>
                    </FormGroup>
                  </Tab>
                </Tabs>
              </Col>
              <Col md={8}>
                <h3>My Orders</h3>
                  <Table striped bordered condensed hover>
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Price</th>
                        <th>Size ({this.state.pairInfo.base.symbol})</th>
                        <th>Status</th>
                        <th>Filled ({this.state.pairInfo.base.symbol})</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {this.getMySortedOrders().map((entry) =>
                      <tr key={entry.orderId}>
                        <td>{this.formatCreationDateOf(entry.orderId)}</td>
                        <td className={this.chooseClassNameForPrice(entry.price)}>{entry.price}</td>
                        <td>{entry.sizeBase}</td>
                        <td>
                          { (entry.status === 'Sending' || entry.modifyInProgress !== undefined) ? (
                          <Spinner name="line-scale" color="purple"/>
                          ) : undefined }
                          {entry.status + ((entry.modifyInProgress !== undefined) ? ' (' + entry.modifyInProgress + ')' : '')}
                        </td>
                        <td>{this.formatBase(entry.rawExecutedBase)}</td>
                        <td>
                          <ButtonToolbar>
                            <Button bsSize="xsmall" bsStyle="info" onClick={() => this.handleClickMoreInfo(entry.orderId)}>
                              <Glyphicon glyph="info-sign" title="more info" />
                            </Button>
                            { (entry.status === 'Open' || entry.status === 'NeedsGas') ? (
                            <Button bsSize="xsmall" bsStyle="danger" onClick={() => this.handleClickCancelOrder(entry.orderId)}>
                              <Glyphicon glyph="remove" title="cancel order" />
                            </Button>
                            ) : undefined }
                            { (entry.status === 'NeedsGas') ? (
                            <Button bsSize="xsmall" bsStyle="danger" onClick={() => this.handleClickContinueOrder(entry.orderId)}>
                              <Glyphicon glyph="remove" title="cancel order" />
                            </Button>
                            ) : undefined }
                            { (entry.status !== 'Open' && entry.status !== 'NeedsGas' && entry.status !== 'Sending') ? (
                            <Button bsSize="xsmall" bsStyle="default" onClick={() => this.handleClickHideOrder(entry.orderId)}>
                              <Glyphicon glyph="eye-close" title="hide order" />
                            </Button>
                            ) : undefined }
                          </ButtonToolbar>
                        </td>
                      </tr>
                      )}
                    </tbody>
                  </Table>

                  <Modal show={this.state.showOrderInfo} onHide={this.handleOrderInfoCloseClick}>
                    <Modal.Header closeButton>
                      <Modal.Title>Order Details</Modal.Title>
                    </Modal.Header>
                    { (!this.state.orderInfoOrderId) ? (<Modal.Body>No order selected.</Modal.Body>) : (
                    <Modal.Body>

                      <Table striped bordered condensed hover>
                        <tbody>
                          <tr>
                            <td>Order Id</td>
                            <td>{this.state.orderInfoOrderId}</td>
                          </tr>
                          <tr>
                            <td>Created At</td>
                            <td>{this.formatCreationDateOf(this.state.orderInfoOrderId)}</td>
                          </tr>
                          <tr>
                            <td>Transaction</td>
                            <td>
                              <EthTxnLink txnHash={this.state.myOrders[this.state.orderInfoOrderId].txnHash} 
                                 networkName={this.state.bridgeStatus.chosenSupportedNetworkName} large={true} />
                            </td>
                          </tr>
                          <tr>
                            <td>Price</td>
                            <td className={this.chooseClassNameForPrice(this.state.myOrders[this.state.orderInfoOrderId].price)}>
                              {this.state.myOrders[this.state.orderInfoOrderId].price}
                            </td>
                          </tr>
                          <tr>
                            <td>Original Size ({this.state.pairInfo.base.symbol})</td>
                            <td>{this.state.myOrders[this.state.orderInfoOrderId].sizeBase}</td>
                          </tr>
                          <tr>
                            <td>Terms</td>
                            <td>{this.state.myOrders[this.state.orderInfoOrderId].terms}</td>
                          </tr>
                          <tr>
                            <td>Filled ({this.state.pairInfo.base.symbol})</td>
                            <td>{this.formatBase(this.state.myOrders[this.state.orderInfoOrderId].rawExecutedBase)}</td>
                          </tr>
                          <tr>
                            <td>Filled ({this.state.pairInfo.cntr.symbol})</td>
                            <td>{this.formatCntr(this.state.myOrders[this.state.orderInfoOrderId].rawExecutedCntr)}</td>
                          </tr>
                          { (this.state.myOrders[this.state.orderInfoOrderId].price.startsWith('Buy')) ? (
                          <tr>
                            <td>Fees ({this.state.pairInfo.base.symbol})</td>
                            <td>{this.formatCntr(this.state.myOrders[this.state.orderInfoOrderId].rawFees)}</td>
                          </tr>
                          ) : (
                          <tr>
                            <td>Fees ({this.state.pairInfo.cntr.symbol})</td>
                            <td>{this.formatCntr(this.state.myOrders[this.state.orderInfoOrderId].rawFees)}</td>
                          </tr>
                          ) }
                          <tr>
                            <td>Status</td>
                            <td>{this.state.myOrders[this.state.orderInfoOrderId].status}</td>
                          </tr>
                          <tr>
                            <td>Reason Code</td>
                            <td>{this.state.myOrders[this.state.orderInfoOrderId].reasonCode}</td>
                          </tr>
                        </tbody>
                      </Table>
                    </Modal.Body>
                    )}
                    <Modal.Footer>
                      <Button onClick={this.handleOrderInfoCloseClick}>Close</Button>
                    </Modal.Footer>
                  </Modal>
                  
              </Col>
            </Row>
          </Grid>
      </div>
    );
  }
}

export default App;
