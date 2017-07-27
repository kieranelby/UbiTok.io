import React, { Component } from 'react';
import { Button, Glyphicon } from 'react-bootstrap';

import ethLogo from './ethereum_icon.svg';

class EthTxnLink extends React.Component {

  constructor(props) {
    super(props);
  }

  computeBaseUrl = () => {
    if (this.props.networkName === "Ropsten Test Network") {
      return "https://ropsten.etherscan.io/tx/";
    }
    return undefined;
  }

  render() {
    if (!this.computeBaseUrl() || !this.props.txnHash) {
      return null;
    }
    return (
      <a href={this.computeBaseUrl() + this.props.txnHash} target="_blank" rel="noopener noreferrer">
        <img src={ethLogo} alt="Ethereum Transaction" width="20" height="20" />
        { (this.props.large) ? (
          <span className="tinyHex">{this.props.txnHash}</span>
        ) : null }
      </a>
    );
  }
}

export { EthTxnLink as default }
