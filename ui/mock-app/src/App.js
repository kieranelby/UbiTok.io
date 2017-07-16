import React, { Component } from 'react';
import { Navbar, Nav, NavItem, Tab, Tabs, Well, Panel,
         Grid, Row, Col, Table,
         ButtonToolbar, Button, Glyphicon, 
         FormGroup, FormControl, ControlLabel, HelpBlock } from 'react-bootstrap';
import update from 'immutability-helper';

import logo from './ubitok-logo.svg';
import metamaskLogo from './metamask.png';
import mistLogo from './mist.png';
//import mockPriceChart from './mock-price-chart.svg';
import './App.css';

import Bridge from './bridge.js'
import UbiTokTypes from 'ubi-lib/ubi-tok-types.js';
import BigNumber from 'bignumber.js';

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

      // are we connected to Ethereum network? which network? what account?

      "bridgeStatus": this.bridge.getInitialStatus(),

      // what are we trading?

      "pairInfo": {
        "symbol": "UBI/ETH",
        "base": {
          "tradableType": "ERC20",
          "symbol": "UBI",
          "name": "UbiTok.io",
          "address": "",
          "displayDecimals": 18,
          "minInitialSize": "10000",
          "minRemainingSize": "1000",
        },
        "cntr": {
          "tradableType": "Ether",
          "symbol": "ETH",
          "name": "Ether",
          "displayDecimals": 18,
          // TODO - raw or friendly?
          "minInitialSize": "1000000",
          "minRemainingSize": "100000",
        },
        "minPrice" : "0.000001",
        "maxPrice" : "999000"
      },

      // how much money do we have where?
      // all are pairs of [ base, counter ] where "" = unknown

      "balances": {
        "wallet": ["", ""],
        // e.g. if we have approved some of our ERC20 funds for the contract
        // but not told the contract to transfer them to itself yet (fiddly!)
        "approvedButNotTransferred": ["", ""],
        "exchange": ["", ""]
      },

      // TODO - some sort of deposit/withdraw/approve form
      // payments we've made

      "myPayments": {
        // is this a complete record, or should we offer a 'Loading ...' indicator or
        // a 'Show More ...' button? (TODO - how to know which - two different things?)
        "isComplete": false,
        // used when finding payment history with EVM events
        "startBlock": null,
        "payments": [
            // TODO - varies a bit
            // ERC20 has two steps (approve, ask contract to transferFrom)
            // Not sure
        ]
      },

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
          "costCntr": ""
        },
        "sell": {
          "amountBase": "",
          "price": "",
          "returnCntr": ""
        }
      },

      // orders the client has created
      // (keyed by orderId, which sorting as a string corresponds to sorting by client-claimed-creation-time)
      // Example:
      //   "Rbc23fg9" : {
      //     "orderId": "Rbc23fg9",
      //     // TODO - need some sort of guess as to when placed here?
      //     "price": price,
      //     "sizeBase": sizeBase,
      //     "terms": terms,
      //     "status": "New",
      //     "reasonCode": "None",
      //     "rawExecutedBase": new BigNumber(0),
      //     "rawExecutedQuoted": new BigNumber(0),
      //     "rawFeeAmount": new BigNumber(0)
      //   }
      //

      "myOrders": {
      },
      "myOrdersLoaded": false,

      // Trades that have happened in the market (keyed by something unique).
      // Example:
      //
      //  "123-99": {
      //    "marketTradeId": "123-99",
      //    "blockNumber": 123,
      //    "logIndex": 99
      //    "makerOrderId":"Rb101x",
      //    "makerPrice":"Buy @ 0.00000123",
      //    "executedBase":"50.0",
      //  }
      //
      
      "marketTrades": {
      }

    };
    this.bridge.subscribeStatus(this.handleStatusUpdate);
    window.setInterval(this.pollExchangeBalances, 2000);
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

  formatBase = (amount) => {
    return UbiTokTypes.decodeBaseAmount(amount);
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
    this.bridge.getExchangeBalances(function (error, newClientBalances) {
      if (error) {
        console.log(error);
        return;
      }
      this.setState((prevState, props) => {
        return {
          balances: update(prevState.balances, {
            exchange: {$set: newClientBalances},
          })
        }
      });
    }.bind(this));
  }

  handleNavSelect = (e) => {
    // TODO - load different page?
  }

  // TODO - totally wrong
  getValidationState() {
    const length = this.state.createOrder.buy.amountBase.length;
    if (length > 10) return 'success';
    else if (length > 5) return 'warning';
    else if (length > 0) return 'error';
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

  handlePlaceBuyOrder = (e) => {
    var orderId = UbiTokTypes.generateDecodedOrderId();
    var price = "Buy @ " + this.state.createOrder.buy.price;
    var sizeBase = this.state.createOrder.buy.amountBase;
    var terms = 'GTCNoGasTopup'; // TODO - take from form!
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
    var terms = 'GTCNoGasTopup'; // TODO - take from form!
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
      rawExecutedQuoted: new BigNumber(0),
      rawFees: new BigNumber(0)
    };
  }

  handlePlaceOrderCallback = (orderId, error, result) => {
    console.log('might have placed order', orderId, error, result);
    if (error) {
      // TODO - but could have been placed despite error?
      this.updateMyOrder(orderId, { status: "FailedSend" });
    } else {
      this.updateMyOrder(orderId, result);
    }
  }

  handleModifyOrderCallback = (orderId, error, result) => {
    console.log('might have done something to order', orderId, error, result);
    var existingOrder = this.state.myOrders[orderId];
    if (error) {
      // todo - wot
    } else {
      this.updateMyOrder(orderId, result);
    }
  }
  
  handleClickMoreInfo = (orderId) => {
    // TODO - some sort of dialog or expandy thing
  }

  handleClickCancelOrder = (orderId) => {
    // TODO - think we should have a better mechanism for this
    let callback = (error, result) => {
      this.handleModifyOrderCallback(orderId, error, result);
    };
    this.bridge.submitCancelOrder(orderId, callback);
  }

  handleClickContinueOrder = (orderId) => {
    let callback = (error, result) => {
      this.handleModifyOrderCallback(orderId, error, result);
    };
    this.bridge.submitContinueOrder(orderId, callback);
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
                      <FormControl componentClass="select" placeholder="Choose product">
                        <option value="UBI/ETH">Product: UBI/ETH</option>
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
                  &nbsp;Using Ethereum Account {this.state.bridgeStatus.chosenAccount} on {this.state.bridgeStatus.chosenSupportedNetworkName}.
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
                      <td>Minimum Size</td>
                      <td>{this.state.pairInfo.base.minInitialSize}</td>
                      <td>{this.state.pairInfo.cntr.minInitialSize}</td>
                    </tr>
                  </tbody>
                </Table>
                <h3>My Balances</h3>
                <Table striped bordered condensed hover>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Exchange Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{this.state.pairInfo.base.symbol}</td>
                      <td>{this.state.balances.exchange[0]}</td>
                    </tr>
                    <tr>
                      <td>{this.state.pairInfo.cntr.symbol}</td>
                      <td>{this.state.balances.exchange[1]}</td>
                    </tr>
                  </tbody>
                </Table>
                <ButtonToolbar>
                  <Button bsStyle="primary">Deposit</Button>
                  <Button bsStyle="warning">Withdraw</Button>
                </ButtonToolbar>
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
                        <td className="sell">{entry[0]}</td>
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
                        <td className="buy">{entry[0]}</td>
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
                        <td>2 hours ago</td>
                        <td className="buy">{entry.makerPrice}</td>
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
                  <Tab eventKey={"buy"} title={"BUY " + this.state.pairInfo.base.symbol}>
                    <FormGroup controlId="createOrderBuy" validationState={this.getValidationState()}>
                      <ControlLabel>Amount ({this.state.pairInfo.base.symbol})</ControlLabel>
                      <FormControl
                        type="text"
                        value={this.state.createOrder.buy.amountBase}
                        placeholder={"How many " + this.state.pairInfo.base.symbol + " to buy"}
                        onChange={this.handleCreateOrderBuyAmountBaseChange}
                      />
                      <FormControl.Feedback />
                      <ControlLabel>Price</ControlLabel>
                      <FormControl
                        type="text"
                        value={this.state.createOrder.buy.price}
                        placeholder={"How many " + this.state.pairInfo.cntr.symbol + " per " + this.state.pairInfo.base.symbol}
                        onChange={this.handleCreateOrderBuyPriceChange}
                      />
                      <FormControl.Feedback />
                      <ControlLabel>Cost</ControlLabel>
                      <HelpBlock>
                        {this.state.createOrder.buy.costCntr !== "" ? (
                          <span>{this.state.createOrder.buy.costCntr} {this.state.pairInfo.cntr.symbol}</span>
                        ) : (
                          <span>Need amount and price.</span>
                        )}
                      </HelpBlock>
                      <ControlLabel>Terms</ControlLabel>
                      <FormControl componentClass="select" placeholder="select">
                        <option value="GTCNoGasTopup">Good Till Cancel</option>
                        <option value="GTCWithGasTopup">Good Till Cancel with Gas Top Up</option>
                        <option value="Immediate Or Cancel">Immediate Or Cancel</option>
                        <option value="MakerOnly">Maker Only</option>
                      </FormControl>
                    </FormGroup>
                    <FormGroup>
                      <ButtonToolbar>
                        <Button bsStyle="primary" onClick={this.handlePlaceBuyOrder}>
                          Place Buy Order
                        </Button>
                      </ButtonToolbar>
                      <HelpBlock>
                        Please read our <a target="_blank" href="https://github.com/kieranelby/UbiTok.io/blob/master/docs/trading-rules.md">Trading Rules</a>.
                      </HelpBlock>
                    </FormGroup>
                  </Tab>
                  <Tab eventKey={"sell"} title={"SELL " + this.state.pairInfo.base.symbol}>
                    <FormGroup controlId="createOrderSell" validationState={this.getValidationState()}>
                      <ControlLabel>Amount ({this.state.pairInfo.base.symbol})</ControlLabel>
                      <FormControl
                        type="text"
                        value={this.state.createOrder.sell.amountBase}
                        placeholder={"How many " + this.state.pairInfo.base.symbol + " to sell"}
                        onChange={this.handleCreateOrderSellAmountBaseChange}
                      />
                      <FormControl.Feedback />
                      <ControlLabel>Price</ControlLabel>
                      <FormControl
                        type="text"
                        value={this.state.createOrder.sell.price}
                        placeholder={"How many " + this.state.pairInfo.cntr.symbol + " per " + this.state.pairInfo.base.symbol}
                        onChange={this.handleCreateOrderSellPriceChange}
                      />
                      <FormControl.Feedback />
                      <ControlLabel>Return</ControlLabel>
                      <HelpBlock>
                        {this.state.createOrder.sell.returnCntr !== "" ? (
                          <span>{this.state.createOrder.sell.returnCntr} {this.state.pairInfo.cntr.symbol}</span>
                        ) : (
                          <span>Need amount and price.</span>
                        )}
                      </HelpBlock>
                      <ControlLabel>Terms</ControlLabel>
                      <FormControl componentClass="select" placeholder="select">
                        <option value="GTCNoGasTopup">Good Till Cancel</option>
                        <option value="GTCWithGasTopup">Good Till Cancel with Gas Top Up</option>
                        <option value="Immediate Or Cancel">Immediate Or Cancel</option>
                        <option value="MakerOnly">Maker Only</option>
                      </FormControl>
                    </FormGroup>
                    <FormGroup>
                      <ButtonToolbar>
                        <Button bsStyle="primary" onClick={this.handlePlaceSellOrder}>
                          Place Sell Order
                        </Button>
                      </ButtonToolbar>
                      <HelpBlock>
                        Please read our <a target="_blank" href="https://github.com/kieranelby/UbiTok.io/blob/master/docs/trading-rules.md">Trading Rules</a>.
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
                        <td>5 mins ago</td>
                        {/* TODO - choose buy/sell */}
                        <td className="buy">{entry.price}</td>
                        <td>{entry.sizeBase}</td>
                        <td>{entry.status}</td>
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
                          </ButtonToolbar>
                        </td>
                      </tr>
                      )}
                    </tbody>
                  </Table>
              </Col>
            </Row>
          </Grid>
      </div>
    );
  }
}

export default App;
