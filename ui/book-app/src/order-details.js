import React from "react";
import { Table, Button, Modal } from "react-bootstrap";

import EthTxnLink from "./eth-txn-link.js";

import moment from "moment";

import UbiTokTypes from "ubi-lib/ubi-tok-types.js";

class OrderDetails extends React.Component {

  // TODO - move these formatting things to some sort of shared helper class

  formatBase = (rawAmount) => {
    return UbiTokTypes.decodeBaseAmount(rawAmount);
  }

  formatCntr = (rawAmount) => {
    return UbiTokTypes.decodeCntrAmount(rawAmount);
  }
  
  chooseClassNameForPrice = (price) => {
    if (price.startsWith("Buy")) {
      return "buyPrice";
    } else if (price.startsWith("Sell")) {
      return "sellPrice";
    } else {
      return "invalidPrice";
    }
  }

  formatEventDate = (eventDate) => {
    if (!eventDate) return "";
    let then = moment(eventDate);
    let now = moment(this.props.clock);
    if (then.isAfter(now)) {
      return "just now";
    }
    return moment(eventDate).from(moment(this.props.clock));
  }

  formatCreationDateOf = (orderId) => {
    let creationDate = UbiTokTypes.extractClientDateFromDecodedOrderId(orderId);
    return this.formatEventDate(creationDate);
  }
  
  render() {
    return (
      <Modal show={this.props.show} onHide={this.props.onClose}>
        <Modal.Header closeButton>
          <Modal.Title>Order Details</Modal.Title>
        </Modal.Header>
        { (!this.props.myOrder) ? (<Modal.Body>No order selected.</Modal.Body>) : (
          <Modal.Body>
            <Table striped bordered condensed hover>
              <tbody>
                <tr>
                  <td>Order Id</td>
                  <td>{this.props.myOrder.orderId}</td>
                </tr>
                <tr>
                  <td>Created At</td>
                  <td>{this.formatCreationDateOf(this.props.myOrder.orderId)}</td>
                </tr>
                <tr>
                  <td>Transaction</td>
                  <td>
                    <EthTxnLink txnHash={this.props.myOrder.txnHash} 
                      networkName={this.props.chosenSupportedNetworkName} large={true} />
                  </td>
                </tr>
                <tr>
                  <td>Price</td>
                  <td className={this.chooseClassNameForPrice(this.props.myOrder.price)}>
                    {this.props.myOrder.price}
                  </td>
                </tr>
                <tr>
                  <td>Original Size ({this.props.pairInfo.base.symbol})</td>
                  <td>{this.props.myOrder.sizeBase}</td>
                </tr>
                <tr>
                  <td>Terms</td>
                  <td>{this.props.myOrder.terms}</td>
                </tr>
                <tr>
                  <td>Filled ({this.props.pairInfo.base.symbol})</td>
                  <td>{this.formatBase(this.props.myOrder.rawExecutedBase)}</td>
                </tr>
                <tr>
                  <td>Filled ({this.props.pairInfo.cntr.symbol})</td>
                  <td>{this.formatCntr(this.props.myOrder.rawExecutedCntr)}</td>
                </tr>
                { (this.props.myOrder.price.startsWith("Buy")) ? (
                  <tr>
                    <td>Fees ({this.props.pairInfo.base.symbol})</td>
                    <td>{this.formatCntr(this.props.myOrder.rawFees)}</td>
                  </tr>
                ) : (
                  <tr>
                    <td>Fees ({this.props.pairInfo.cntr.symbol})</td>
                    <td>{this.formatCntr(this.props.myOrder.rawFees)}</td>
                  </tr>
                ) }
                <tr>
                  <td>Status</td>
                  <td>{this.props.myOrder.status}</td>
                </tr>
                <tr>
                  <td>Reason Code</td>
                  <td>{this.props.myOrder.reasonCode}</td>
                </tr>
              </tbody>
            </Table>
          </Modal.Body>
        )}
        <Modal.Footer>
          <Button onClick={this.props.onClose}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

export default OrderDetails;
