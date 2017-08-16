// Lists all the books offered by UbiTok.io.
//

var BookERC20EthV1AbiArray =
[{"constant":true,"inputs":[{"name":"fromPrice","type":"uint16"}],"name":"walkBook","outputs":[{"name":"price","type":"uint16"},{"name":"depthBase","type":"uint256"},{"name":"orderCount","type":"uint256"},{"name":"blockNumber","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"orderId","type":"uint128"}],"name":"getOrder","outputs":[{"name":"client","type":"address"},{"name":"price","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"},{"name":"status","type":"uint8"},{"name":"reasonCode","type":"uint8"},{"name":"executedBase","type":"uint256"},{"name":"executedCntr","type":"uint256"},{"name":"feesBaseOrCntr","type":"uint256"},{"name":"feesRwrd","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"amountCntr","type":"uint256"}],"name":"withdrawCntr","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"getBookInfo","outputs":[{"name":"_bookType","type":"uint8"},{"name":"_baseToken","type":"address"},{"name":"_rwrdToken","type":"address"},{"name":"_baseMinInitialSize","type":"uint256"},{"name":"_cntrMinInitialSize","type":"uint256"},{"name":"_feePer10K","type":"uint256"},{"name":"_feeCollector","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"orderId","type":"uint128"}],"name":"getOrderState","outputs":[{"name":"status","type":"uint8"},{"name":"reasonCode","type":"uint8"},{"name":"executedBase","type":"uint256"},{"name":"executedCntr","type":"uint256"},{"name":"feesBaseOrCntr","type":"uint256"},{"name":"feesRwrd","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"amountBase","type":"uint256"}],"name":"transferBase","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"amountRwrd","type":"uint256"}],"name":"transferRwrd","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"depositCntr","outputs":[],"payable":true,"type":"function"},{"constant":false,"inputs":[],"name":"transferFromBase","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"client","type":"address"}],"name":"getClientBalances","outputs":[{"name":"bookBalanceBase","type":"uint256"},{"name":"bookBalanceCntr","type":"uint256"},{"name":"bookBalanceRwrd","type":"uint256"},{"name":"approvedBalanceBase","type":"uint256"},{"name":"approvedBalanceRwrd","type":"uint256"},{"name":"ownBalanceBase","type":"uint256"},{"name":"ownBalanceRwrd","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"newFeeCollector","type":"address"}],"name":"changeFeeCollector","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"transferFromRwrd","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"client","type":"address"},{"name":"maybeLastOrderIdReturned","type":"uint128"},{"name":"minClosedOrderIdCutoff","type":"uint128"}],"name":"walkClientOrders","outputs":[{"name":"orderId","type":"uint128"},{"name":"price","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"},{"name":"status","type":"uint8"},{"name":"reasonCode","type":"uint8"},{"name":"executedBase","type":"uint256"},{"name":"executedCntr","type":"uint256"},{"name":"feesBaseOrCntr","type":"uint256"},{"name":"feesRwrd","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"orderId","type":"uint128"},{"name":"price","type":"uint16"},{"name":"sizeBase","type":"uint256"},{"name":"terms","type":"uint8"},{"name":"maxMatches","type":"uint256"}],"name":"createOrder","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"orderId","type":"uint128"},{"name":"maxMatches","type":"uint256"}],"name":"continueOrder","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"orderId","type":"uint128"}],"name":"cancelOrder","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_baseToken","type":"address"},{"name":"_rwrdToken","type":"address"}],"name":"init","outputs":[],"payable":false,"type":"function"},{"inputs":[],"payable":false,"type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"address"},{"indexed":false,"name":"clientPaymentEventType","type":"uint8"},{"indexed":false,"name":"balanceType","type":"uint8"},{"indexed":false,"name":"clientBalanceDelta","type":"int256"}],"name":"ClientPaymentEvent","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"address"},{"indexed":false,"name":"clientOrderEventType","type":"uint8"},{"indexed":false,"name":"orderId","type":"uint128"}],"name":"ClientOrderEvent","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"eventTimestamp","type":"uint256"},{"indexed":true,"name":"orderId","type":"uint128"},{"indexed":false,"name":"marketOrderEventType","type":"uint8"},{"indexed":false,"name":"price","type":"uint16"},{"indexed":false,"name":"depthBase","type":"uint256"},{"indexed":false,"name":"tradeBase","type":"uint256"}],"name":"MarketOrderEvent","type":"event"}]
      ;

var niceERC20TokenAbiArray =
[{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"totalSupply","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"}],"name":"allowance","outputs":[{"name":"remaining","type":"uint256"}],"payable":false,"type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_from","type":"address"},{"indexed":true,"name":"_to","type":"address"},{"indexed":false,"name":"_value","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_owner","type":"address"},{"indexed":true,"name":"_spender","type":"address"},{"indexed":false,"name":"_value","type":"uint256"}],"name":"Approval","type":"event"}]
      ;

exports.networkInfo = {
  "demo": {
    networkId: "demo",
    name: "Simulated Demo Network",
    liveness: "DEMO"
  },
  "3": {
    networkId: "3",
    name: "Ropsten Test Network",
    liveness: "TEST"
  },
  "42": {
    networkId: "42",
    name: "Kovan Test Network",
    liveness: "TEST"
  },
  "1": {
    networkId: "1",
    name: "Main Network",
    liveness: "LIVE"
  }
};

// TODO - danger - the decimals setting isn't actually used yet

exports.bookInfo = {
  "DEMO/ETH" : {
    networkId: "demo",
    bookAddress: "n/a",
    bookAbiArray: [],
    symbol: "DEMO/ETH",
    base: {
      tradableType: "ERC20",
      symbol: "DEMO",
      decimals: 18,
      name: "Demo Token",
      address: "n/a",
      abiArray: [],
      minInitialSize: "0.01"
    },
    cntr: {
      tradableType: "Ether",
      symbol: "ETH",
      decimals: 18,
      name: "Demo Ether",
      minInitialSize: "0.001"
    },
    rwrd: {
      tradableType: "ERC20",
      symbol: "UBI",
      decimals: 18,
      name: "UbiTok Reward Token",
      address: "n/a",
      abiArray: [],
    }
  },
  "TESTR/ETH" : {
    networkId: "3",
    bookAddress: "0x297ad00cf67aa1dcfc2c952b15502fa9e1910cee",
    bookAbiArray: BookERC20EthV1AbiArray,
    symbol: "TESTR/ETH",
    base: {
      tradableType: "ERC20",
      symbol: "TESTR",
      decimals: 18,
      name: "Test Token (Ropsten)",
      address: "0x678c4cf3f4a26d607d0a0032d72fdc3b1e3f71f4",
      abiArray: niceERC20TokenAbiArray,
      minInitialSize: "0.01"
    },
    cntr: {
      tradableType: "Ether",
      symbol: "ETH",
      decimals: 18,
      name: "Test Ether (Ropsten)",
      minInitialSize: "0.001"
    },
    rwrd: {
      tradableType: "ERC20",
      symbol: "UBI",
      decimals: 18,
      name: "Test UbiTok.io Reward Token",
      address: "0x5cfad634865157a5a988d743e6fcb4514e655460",
      abiArray: niceERC20TokenAbiArray,
    }
  }
};
