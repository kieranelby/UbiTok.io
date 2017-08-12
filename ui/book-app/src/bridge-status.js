import React from "react";
import { Well, Panel, Row, Col, Glyphicon } from "react-bootstrap";

import metamaskLogo from "./metamask.png";
import mistLogo from "./mist.png";

class BridgeStatus extends React.Component {

  render = () => {
    return (<div>{
      (!this.props.bridgeStatus.canMakePublicCalls && this.props.bridgeStatus.withinGracePeriod) ? (
        <Panel header="Connecting to Ethereum network ..." bsStyle="info">
          <p>Waiting for Metamask, Mist or other web3 provider to initialise ...</p>
        </Panel>
      ) : !this.props.bridgeStatus.web3Present ? (
        <Panel header="No Ethereum Connection" bsStyle="danger">
          <p>UbiTok.io needs to connect to the Ethereum network via a local client, but could not find one.</p>
          <p>We suggest using one of the following clients to connect to Ethereum:</p>
          <Row>
            <Col sm={6}>
              <a href="https://metamask.io/" target="_blank" rel="noopener noreferrer">
                <h4>Metamask Chrome Extension</h4>
                <img src={metamaskLogo} className="Metamask-logo" alt="Metamask" />
              </a>
            </Col>
            <Col sm={6}>
              <a href="https://github.com/ethereum/mist/releases" target="_blank" rel="noopener noreferrer">
                <h4>Mist Browser</h4>
                <img src={mistLogo} className="Mist-logo" alt="Mist" />
              </a>
            </Col>
          </Row>
        </Panel>
      ) : this.props.bridgeStatus.unsupportedNetwork ? (
        <Panel header="Unsupported Ethereum Network" bsStyle="danger">
          <p>This UbiTok.io book is only available on the {this.props.bridgeStatus.targetNetworkName}.</p>
          <p>Try changing Ethereum Network in your Ethereum Client (e.g. Metamask, Mist).</p>
        </Panel>
      ) : this.props.bridgeStatus.networkChanged ? (
        <Panel header="Ethereum Network Changed" bsStyle="danger">
          <p>You seem to have changed Ethereum Network.</p>
          <p>Try changing Ethereum Network in your Ethereum Client (e.g. Metamask, Mist)
            back to {this.props.bridgeStatus.chosenSupportedNetworkName}, or reload this page to pick up the new network.</p>
        </Panel>
      ) : this.props.bridgeStatus.accountLocked ? (
        <Panel header="Ethereum Account Locked" bsStyle="danger">
          <p>UbiTok.io needs to know which Ethereum account to use.</p>
          <p>Try unlocking your Ethereum Client (e.g. Metamask, Mist).</p>
        </Panel>
      ) : this.props.bridgeStatus.accountChanged ? (
        <Panel header="Ethereum Account Changed" bsStyle="danger">
          <p>You seem to have changed Ethereum Account.</p>
          <p>Try changing Ethereum Account in your Ethereum Client (e.g. Metamask, Mist)
            back to {this.props.bridgeStatus.chosenAccount}, or reload this page to pick up the new account.</p>
        </Panel>
      ) : (!this.props.bridgeStatus.canMakePublicCalls || !this.props.bridgeStatus.canMakeAccountCalls) ? (
        <Panel header="Unknown Ethereum Connection Problem" bsStyle="danger">
          <p>Some unusual problem has occurred preventing UbiTok.io connecting to the Ethereum Network.</p>
          <p>Try reloading this page, or contact help@ubitok.io with details of the problem.</p>
        </Panel>
      ) : (
        <Well bsSize="small">
          <Glyphicon glyph="info-sign" title="Ethereum Connection Info" />
        &nbsp;Using Ethereum Account {this.props.bridgeStatus.chosenAccount} on {this.props.bridgeStatus.chosenSupportedNetworkName} via a local client.
        </Well>
      )}</div>
    );
  }
}

export default BridgeStatus;
