import React from "react";
import { Button, Glyphicon } from "react-bootstrap";

class SendingButton extends React.Component {

  constructor(props) {
    super(props);
    this.state = {inProgress: false};
  }

  handleClick = () => {
    this.props.onClick();
    this.setState((prevState, props) => ({
      inProgress: true
    }));
    window.setTimeout(this.handleTimeout, 3000);
  }

  handleTimeout = () => {
    this.setState((prevState, props) => ({
      inProgress: false
    }));
  }

  render() {
    return (
      <Button bsStyle={this.props.bsStyle} onClick={this.handleClick} disabled={this.state.inProgress}>
        {(this.state.inProgress) ? (
          <span><Glyphicon glyph="send" /> Sending ...</span>
        ) : (
          <span>{this.props.text}</span>
        )}
      </Button>
    );
  }
}

export { SendingButton as default };
