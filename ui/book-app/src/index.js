import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import registerServiceWorker from "./registerServiceWorker";

import "ubi-bootstrap/dist/css/bootstrap.css";
import "ubi-bootstrap/dist/css/theme.css";
import "./index.css";

ReactDOM.render(<App bookId="DEMO/ETH" />, document.getElementById("root"));
registerServiceWorker();
