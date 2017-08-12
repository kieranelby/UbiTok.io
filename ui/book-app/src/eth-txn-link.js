import React from "react";
import { } from "react-bootstrap";

import ethLogo from "./ethereum_icon.svg";

class EthTxnLink extends React.Component {

  computeBaseUrl = () => {
    if (this.props.networkName === "Ropsten Test Network") {
      return "https://ropsten.etherscan.io/tx/";
    }
    // TODO - main net! something vaguely sensible for demo!
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

export { EthTxnLink as default };
