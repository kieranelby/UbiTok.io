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
    // should be per-network, perhaps we do need a depth query
    this.lastBookSnapshot = {
      blockId: 100000,
      depthByPrice: {}
    };
    this.bridge = new Bridge();
    this.lastBridgeStatus = this.bridge.getUpdatedStatus();
    this.state = {
      // who and where are we?
      "app": {
        "siteName": "UbiTok.io"
      },
      "bridgeStatus": {
        web3Present: false,
        chosenSupportedNetworkName: undefined,
        unsupportedNetwork: false,
        networkChanged: false,
        chosenAccount: undefined,
        accountLocked: false,
        accountChanged: false,
        canMakePublicCalls: false,
        canMakeAccountCalls: false
      },
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
        "counter": {
          "tradableType": "Ether",
          "symbol": "ETH",
          "name": "Ether",
          "displayDecimals": 18,
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
      "book": {
        // is this a complete record, or should we offer a 'Loading ...' indicator or
        // a 'Show More ...' button? (TODO - how to know which - two different things?)
        "isComplete": false,
        // price, depth 
        // TODO - we might need blockId here so we know how stale our data is?
        "asks": [
            ["Sell @ 0.00000131", "2000000"],
            ["Sell @ 0.00000130", "1000000"],
            ["Sell @ 0.00000129", "1000000"],
            ["Sell @ 0.00000128", "2000000"],
        ],
        "bids": [
            ["Buy @ 0.00000124", "4100000"],
            ["Buy @ 0.00000123", "5000000"],
            ["Buy @ 0.00000122", "4100000"],
            ["Buy @ 0.00000121", "5000000"]
        ]
      },
      // an order the user is preparing
      "createOrder": {
        // have they selected buy or sell base?
        "side": "buy",
        "buy": {
          "amountBase": "",
          "price": "",
          "costCounter": ""
        },
        "sell": {
          "amountBase": "",
          "price": "",
          "costCounter": ""
        }
      },
      // orders we've created
      "myOrders": {
        // is this a complete record, or should we offer a 'Loading ...' indicator or
        // a 'Show More ...' button? (TODO - how to know which - two different things?)
        "isComplete": false,
        // TODO - how can we efficiently enumerate our orders? EVM event filters?
        // but how far to go back? how well do topic filters work?
        // perhaps contract can maintain lastOrderIdForClient + clientPrevOrderId? adds gas costs tho.
        // used when finding history with EVM events
        "startBlock": null,
        "orders": [
          // TODO - time? blockId?
          {
            "orderId": "101",
            "price": "Buy @ 0.00000123",
            "sizeBase": "2000000",
            "terms": "GoodTillCancel",
            "status": "Open",
            "cancelOrRejectReason": "None",
            "executedBase": "500000",
            "executedQuoted": "50000"
          }
        ]
      },
      // trades that have happened in the market
      "marketTrades": {
        // is this a complete record, or should we offer a 'Loading ...' indicator or
        // a 'Show More ...' button? (TODO - how to know which - two different things?)
        "isComplete": false,
        // used when finding history with EVM events
        "startBlock": null,
        // TODO - time? blockId?
        "trades": [
          {
            "makerOrderId":"101",
            "takerOrderId":"102",
            "makerPrice":"Buy @ 0.00000123",
            "executedBase":"500000"
          }
        ]
      }
    };
    this.bridge.subscribeStatus(this.handleStatusUpdate);
    window.setInterval(this.pollExchangeBalances, 2000);
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
    this.bridge.walkBook(1, this.handleWalkBook);
  }
  readAccountData = () => {
    this.bridge.getAllOrderIds(this.handleHistoricClientOrderCreated);
  }
  handleWalkBook = (error, result) => {
    console.log('handleWalkBook', error, result);
    if (error) {
      this.panic(error);
      return;
    }
    var pricePacked = result[0].valueOf();
    var depth = result[1];
    var blockNumber = result[2].valueOf();
    var nextPricePacked;
    var done = false;
    if (!depth.isZero()) {
      console.log('found depth', depth.valueOf(), pricePacked.valueOf());
      if (pricePacked === 32400) {
        done = true;
      } else {
        nextPricePacked = pricePacked + 1;
      }
    } else {
      if (pricePacked <= 16200) {
        nextPricePacked = 16201;
      } else {
        done = true;
      }
    }
    if (!done) {
      this.bridge.walkBook(nextPricePacked, this.handleWalkBook);
    }
  }
  handleHistoricClientOrderCreated = (error, result) => {
    console.log('handleHistoricClientOrderCreated', error, result);
  }
  handleHistoricMarketEvents = (error, result) => {
    console.log('handleHistoricMarketEvents', error, result);
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
  }
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
  handlePlaceBuyOrder = (e) => {
    var orderId = "" + new Date().valueOf();
    //submitCreateOrder (orderId, price, sizeBase, terms, callback)
    this.bridge.submitCreateOrder(orderId, 8000, this.state.createOrder.buy.amountBase, 0, this.handlePlaceBuyOrderCallback);
    var newOrder = {
            "orderId": orderId,
            "price": "Buy @ 2.0",
            "sizeBase": this.state.createOrder.buy.amountBase,
            "terms": "GoodTillCancel",
            "status": "New",
            "cancelOrRejectReason": "None",
            "executedBase": "0",
            "executedQuoted": "0"
          }
    this.setState((prevState, props) => {
      return {
        myOrders: update(prevState.myOrders, {
          orders: { $push: [newOrder] }
        })
      };
    });
  }
  handlePlaceBuyOrderCallback = (error, result) => {
    console.log('might have placed an order', error, result);
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
                      <td>{this.state.pairInfo.counter.symbol}</td>
                    </tr>
                    <tr>
                      <td>Name</td>
                      <td>{this.state.pairInfo.base.name}</td>
                      <td>{this.state.pairInfo.counter.name}</td>
                    </tr>
                    <tr>
                      <td>Type</td>
                      <td>{this.state.pairInfo.base.tradableType}</td>
                      <td>{this.state.pairInfo.counter.tradableType}</td>
                    </tr>
                    <tr>
                      <td>Minimum Size</td>
                      <td>{this.state.pairInfo.base.minInitialSize}</td>
                      <td>{this.state.pairInfo.counter.minInitialSize}</td>
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
                      <td>{this.state.balances.exchange[0].toString()}</td>
                    </tr>
                    <tr>
                      <td>{this.state.pairInfo.counter.symbol}</td>
                      <td>{this.state.balances.exchange[1].toString()}</td>
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
                  <Table striped bordered condensed hover>
                    <thead>
                      <tr>
                        <th>Ask Price</th>
                        <th>Depth ({this.state.pairInfo.base.symbol})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {this.state.book.asks.map((entry) =>
                      <tr key={entry[0]}>
                        <td className="sell">{entry[0]}</td>
                        <td>{entry[1]}</td>
                      </tr>
                      )}
                    </tbody>
                  </Table>
                  <Well bsSize="sm" id="mid-price-box">
                    Mid @ 0.00000126
                    &nbsp;&nbsp;
                  </Well>
                  {/*
                  <Table bordered condensed hover>
                    <tbody>
                      <tr>
                        <td>Mid</td>
                        <td>1.245</td>
                        <td>Spread</td>
                        <td>0.01</td>
                      </tr>
                    </tbody>
                  </Table>
                  */}
                  <Table striped bordered condensed hover>
                    <thead>
                      <tr>
                        <th>Bid Price</th>
                        <th>Depth ({this.state.pairInfo.base.symbol})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {this.state.book.bids.map((entry) =>
                      <tr key={entry[0]}>
                        <td className="buy">{entry[0]}</td>
                        <td>{entry[1]}</td>
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
                      {this.state.marketTrades.trades.map((entry) =>
                      <tr key={entry.makerOrderId + entry.takerOrderId}>
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
                        placeholder={"How many " + this.state.pairInfo.counter.symbol + " per " + this.state.pairInfo.base.symbol}
                        onChange={this.handleCreateOrderBuyPriceChange}
                      />
                      <FormControl.Feedback />
                      <ControlLabel>Cost</ControlLabel>
                      <HelpBlock>
                        {this.state.createOrder.buy.costCounter !== "" ? (
                          <span>{this.state.createOrder.buy.costCounter} {this.state.pairInfo.counter.symbol}</span>
                        ) : (
                          <span>Need amount and price.</span>
                        )}
                      </HelpBlock>
                      <ControlLabel>Terms</ControlLabel>
                      <FormControl componentClass="select" placeholder="select">
                        <option value="GoodTillCancel">Good Till Cancel</option>
                        <option value="GoodTillCancel">Good Till Cancel with Gas Top Up</option>
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
                        Order terms are explained at <a target="_blank" href="https://github.com/kieranelby/UbiTok.io/blob/master/docs/creating-orders.md">Creating Orders</a>.
                      </HelpBlock>
                    </FormGroup>
                  </Tab>
                  <Tab eventKey={"sell"} title={"SELL " + this.state.pairInfo.base.symbol}>
                    Tab 2 content
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
                      {this.state.myOrders.orders.map((entry) =>
                      <tr key={entry.orderId}>
                        <td>5 mins ago</td>
                        <td className="buy">{entry.price}</td>
                        <td>{entry.sizeBase}</td>
                        <td>{entry.status}</td>
                        <td>{entry.executedBase}</td>
                        <td>
                          <ButtonToolbar>
                            <Button bsSize="xsmall" bsStyle="info"><Glyphicon glyph="info-sign" title="more info" /></Button>
                            <Button bsSize="xsmall" bsStyle="danger"><Glyphicon glyph="remove" title="cancel order" /></Button>
                            {/*<Button bsSize="xsmall" bsStyle="primary">Continue</Button>*/}
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
