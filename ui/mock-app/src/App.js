import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

class App extends Component {
  constructor() {
    super();
    this.state = {
      // what is this place?
      "app": {
        "siteName": "UbiTok.io"
      },
      // what are we trading?
      "pairInfo": {
        "symbol": "UBI/ETH",
        "base": {
          "tradableType": "ERC20",
          "symbol": "UBI",
          "address": "",
          "displayDecimals": 18,
          "minInitialSize": "10000",
          "minRemainingSize": "1000",
        },
        "counter": {
          "tradableType": "Ether",
          "symbol": "ETH",
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
            ["Sell@1.26", "2000000"],
            ["Sell@1.25", "1000000"]
        ],
        "bids": [
            ["Buy@1.24", "4000000"],
            ["Buy@1.23", "5000000"]
        ]
      },
      "myOrders": {
        // is this a complete record, or should we offer a 'Loading ...' indicator or
        // a 'Show More ...' button? (TODO - how to know which - two different things?)
        "isComplete": false,
        // TODO - how can we efficiently enumerate our orders? EVM event filters?
        // but how far to go back? how well do topic filters work?
        // perhaps contract can maintain lastOrderIdForClient + clientPrevOrderId? adds gas costs tho.
        // used when finding history with EVM events
        "startBlock": null,
        "orderIds": ["101"],
        "byId": {
          // TODO - time? blockId?
          "101": {
            "price": "Buy@0.123",
            "sizeBase": "2000000",
            "terms": "GoodTillCancel",
            "status": "Open",
            "cancelOrRejectReason": "None",
            "executedBase": "500000",
            "executedQuoted": "50000"
          }
        }
      },
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
            "makerPrice":"Buy@0.123",
            "executedBase":"500000"
          }
        ]
      }
    };
  }
  render() {
    return (
      <div className="App">
        <div className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h2>{this.state.app.siteName} - {this.state.pairInfo.symbol}</h2>
        </div>
        <p className="App-intro">
          This is a mock-up using hard-coded data in <code>src/App.js</code>.
        </p>
        <h3>Book Info (what you are trading)</h3>
        <p>
          <dl>
            <dt>Base Symbol</dt>
            <dd>{this.state.pairInfo.base.symbol}</dd>
            <dt>Base Tradable Type</dt>
            <dd>{this.state.pairInfo.base.tradableType}</dd>
            <dt>Base Minimum Size</dt>
            <dd>{this.state.pairInfo.base.minInitialSize}</dd>
            <dt>Counter Symbol</dt>
            <dd>{this.state.pairInfo.counter.symbol}</dd>
            <dt>Counter Tradable Type</dt>
            <dd>{this.state.pairInfo.counter.tradableType}</dd>
            <dt>Counter Minimum Size</dt>
            <dd>{this.state.pairInfo.counter.minInitialSize}</dd>
            <dt>Minimum Price</dt>
            <dd>{this.state.pairInfo.minPrice}</dd>
            <dt>Maximum Price</dt>
            <dd>{this.state.pairInfo.maxPrice}</dd>
          </dl>
        </p>
        <h3>My Balances</h3>
        <h3>My Payments</h3>
        <h3>Order Book</h3>
        <h4>Asks (offers to sell UBI)</h4>
        <h4>Bids (offers to buy UBI)</h4>
        <h3>Create Order</h3>
        <h3>My Orders</h3>
        <h3>Market Trade History</h3>
        <h3>Market Price History</h3>
      </div>
    );
  }
}

export default App;
