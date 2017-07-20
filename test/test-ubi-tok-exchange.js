var BookERC20EthV1 = artifacts.require('BookERC20EthV1.sol');
var TestToken = artifacts.require('TestToken.sol');

var UbiTokTypes = require('../ubi-lib/ubi-tok-types.js');
var BigNumber = UbiTokTypes.BigNumber;

contract('BookERC20EthV1 - create order errors', function(accounts) {
  var packedBuyOnePointZero = UbiTokTypes.encodePrice('Buy @ 1.00');
  it("instantly throws on invalid order id", function() {
    var uut;
    return BookERC20EthV1.deployed().then(function(instance) {
      uut = instance;
      return uut.createOrder(0, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, {from: accounts[0]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw, not ' + error);
    });
  });
  it("instantly throws on duplicate order id", function() {
    var uut;
    return BookERC20EthV1.deployed().then(function(instance) {
      uut = instance;
      return uut.depositCntr({from: accounts[0], value: web3.toWei(10, 'finney')});
    }).then(function(result) {
      return uut.createOrder(1001, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, {from: accounts[0]});
    }).then(function(result) {
      return uut.createOrder(1001, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, {from: accounts[0]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw, not ' + error);
    });
  });
});

contract('BookERC20EthV1 - create order rejects', function(accounts) {
  var packedBuyOnePointZero = UbiTokTypes.encodePrice('Buy @ 1.00');
  var packedMaxBuyPrice = 1;
  var badOrders = [
    [ 1001, 0, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "obviously invalid price", "InvalidPrice" ],
    [ 1002, packedBuyOnePointZero, web3.toWei(100, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "not enough funds", "InsufficientFunds" ],
    [ 1003, packedBuyOnePointZero, new web3.BigNumber("1e39"), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "preposterously large base size", "InvalidSize" ],
    [ 1004, packedMaxBuyPrice, new web3.BigNumber("1e36"), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "preposterously large quoted size (but base just ok)", "InvalidSize" ],
    [ 1005, packedBuyOnePointZero, 90, UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "small base size", "InvalidSize" ],
    [ 1006, packedBuyOnePointZero, 900, UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "small quoted size (but base ok)", "InvalidSize" ],
    // TODO - invalid terms (e.g. maxMatches > 0 with MakerOnly)
  ];
  var balanceQuotedAfterDeposit;
  it("first accepts a deposit to be used to place bad orders", function() {
    var uut;
    return BookERC20EthV1.deployed().then(function(instance) {
      uut = instance;
      return uut.depositCntr({from: accounts[0], value: web3.toWei(2, 'finney')});
    }).then(function(result) {
      return uut.getClientBalances.call(accounts[0]);
    }).then(function(balances) {
      balanceQuotedAfterDeposit = balances[1];
    });
  });
  badOrders.forEach(function(badOrder) {
    it("gracefully reject create order with " + badOrder[5] + " (at no cost)", function() {
      var uut;
      return BookERC20EthV1.deployed().then(function(instance) {
        uut = instance;
        return uut.createOrder(badOrder[0], badOrder[1], badOrder[2], badOrder[3], badOrder[4], {from: accounts[0]});
      }).then(function(result) {
        return uut.getOrderState.call(badOrder[0]);
      }).then(function(result) {
        var state = UbiTokTypes.decodeOrderState(badOrder[0], result);
        assert.equal(state.status, 'Rejected');
        assert.equal(state.reasonCode, badOrder[6]);
        return uut.getClientBalances.call(accounts[0]);
      }).then(function(balancesAfterOrderRejected) {
        assert.equal(balancesAfterOrderRejected[1].toString(), balanceQuotedAfterDeposit.toString());
      });
    });
  });
});

contract('TestToken - basics', function(accounts) {
  it("transfer gives funds", function() {
    var testToken;
    var transferAmount = new BigNumber("1000000");
    return TestToken.deployed().then(function(instance) {
      testToken = instance;
    }).then(function(junk) {
      return testToken.transfer(accounts[1], transferAmount);
    }).then(function(junk) {
      return testToken.balanceOf.call(accounts[1]);
    }).then(function(balance) {
      assert.equal(transferAmount.toString(), balance.toString());
    });
  });
});

contract('BookERC20EthV1 - ERC20 payments', function(accounts) {
  it("deposit with approve + transferFrom", function() {
    var uut;
    var testToken;
    var depositAmount = new BigNumber("1000000");
    return TestToken.deployed().then(function(instance) {
      testToken = instance;
      return BookERC20EthV1.deployed();
    }).then(function(instance) {
      uut = instance;
      return uut.init(testToken.address);
    }).then(function(junk) {
      return testToken.transfer(accounts[1], depositAmount, {from: accounts[0]});
    }).then(function(junk) {
      return testToken.balanceOf.call(accounts[1]);
    }).then(function(balance) {
      assert.equal(depositAmount.toString(), balance.toString());
      return testToken.approve(uut.address, depositAmount, {from: accounts[1]});
    }).then(function(junk) {
      // TODO assert something
      return uut.transferFromBase({from: accounts[1]});
    }).then(function(junk) {
      return uut.getClientBalances.call(accounts[1]);
    }).then(function(balances) {
      assert.equal(balances[0].toString(), depositAmount.toString());
    });
  });
});

var standardInitialBalanceBase = 1000000000;
var standardInitialBalanceCntr =  100000000;

// Yeah, this is pretty gnarly - but at least the scenarios themsleves are
// easy to read since all the ugliness is hidden here.
// We build a promise chain that sets up initial balances, runs through the commands,
// then checks the orders, book and balances are as expected at the end.
function buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges) {
  var context = {};
  context.accounts = accounts;
  var chain = BookERC20EthV1.deployed().then(function(instance) {
    context.uut = instance;
    return TestToken.deployed();
  }).then(function(instance) {
    context.testToken = instance;
    return context.uut.init(context.testToken.address);
  });
  var clients = new Set();
  for (var cmd of commands) {
    clients.add(cmd[2]);
  }
  for (var expectedBalanceChange of expectedBalanceChanges) {
    clients.add(expectedBalanceChange[0]);
  }
  var accountIdForClient = {};
  var nextAccountId = 1;
  for (var client of clients) {
    accountIdForClient[client] = nextAccountId;
    nextAccountId++;
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        return ctx.testToken.transfer(ctx.accounts[a], ab, {from: ctx.accounts[0]});
      };
    }(context, accountIdForClient[client], standardInitialBalanceBase)));
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        return ctx.testToken.approve(ctx.uut.address, ab, {from: ctx.accounts[a]});
      };
    }(context, accountIdForClient[client], standardInitialBalanceBase)));
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        return ctx.uut.transferFromBase({from: ctx.accounts[a]});
      };
    }(context, accountIdForClient[client], standardInitialBalanceBase)));
    chain = chain.then((function (ctx, a, ac) {
      return function (lastResult) {
        return ctx.uut.depositCntr({from: ctx.accounts[a], value: ac});
      };
    }(context, accountIdForClient[client], standardInitialBalanceCntr)));
  }
  for (var cmd of commands) {
    chain = chain.then((function (ctx, a, c) {
      return function (lastResult) {
        return ctx.uut.createOrder(
          c[3],
          UbiTokTypes.encodePrice(c[4]),
          c[5],
          UbiTokTypes.encodeTerms(c[6]),
          c[7],
          {from: ctx.accounts[a]}
        );
      };
    }(context, accountIdForClient[cmd[2]], cmd)));
  }
  for (var expectedOrder of expectedOrders) {
    chain = chain.then((function (ctx, eo) {
      return function (lastResult) {
        return ctx.uut.getOrderState.call(eo[0]);
      };
    }(context, expectedOrder)));
    chain = chain.then((function (ctx, eo) {
      return function (lastResult) {
        var state = UbiTokTypes.decodeOrderState(eo[0], lastResult);
        assert.equal(state.status, eo[1], "status of order " + eo[0]);
        assert.equal(state.reasonCode, eo[2], "reasonCode of order " + eo[0]);
        assert.equal(state.rawExecutedBase, eo[3], "rawExecutedBase of order " + eo[0]);
        assert.equal(state.rawExecutedCntr, eo[4], "rawExecutedCntr of order " + eo[0]);
      };
    }(context, expectedOrder)));
  }
  for (var expectedBalanceChange of expectedBalanceChanges) {
    var client = expectedBalanceChange[0];
    chain = chain.then((function (ctx, a, ebc) {
      return function (lastResult) {
        return ctx.uut.getClientBalances.call(ctx.accounts[a]);
      };
    }(context, accountIdForClient[client], expectedBalanceChange)));
    chain = chain.then((function (ctx, a, ebc) {
      return function (lastResult) {
        assert.equal(lastResult[0].toNumber() - standardInitialBalanceBase, ebc[1], "base balance change for " + ebc[0]);
        assert.equal(lastResult[1].toNumber() - standardInitialBalanceCntr, ebc[2], "counter balance change for " + ebc[0]);
      };
    }(context, accountIdForClient[client], expectedBalanceChange)));
  }
  return chain;
}

contract('BookERC20EthV1 - scenarios', function(accounts) {
  it("two orders that don't match", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', 'OK', "client2", "201", "Sell @ 0.600", 100000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Open', 'None', 0,  0],
    ];
    var expectedBalanceChanges = [
      ["client1",      +0, -50000],
      ["client2", -100000,      0]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders exactly match", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', 'OK', "client2", "201", "Sell @ 0.500", 100000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Done', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000, -50000],
      ["client2", -100000, +50000 * 0.9995]  // taker pays fee
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders partial match of 2nd", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', 'OK', "client2", "201", "Sell @ 0.500", 300000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Open', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000,  -50000],
      ["client2", -300000,  +50000 * 0.9995]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders best execution", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', 'OK', "client2", "201", "Sell @ 0.400", 100000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Done', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000,  -50000],
      ["client2", -100000,  +50000 * 0.9995]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

/*

contract('BookERC20EthV1', function(accounts) {
  it("three orders mixed prices", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client1", "102",  "Buy @ 0.600", 100000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client2", "201", "Sell @ 0.400", 200000, 'GTCNoGasTopup']
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["102", 'Done', 'None', 100000,  60000],
      ["201", 'Done', 'None', 200000, 110000],
    ];
    var expectedBalanceChanges = [
      ["client1", +200000, -110000],
      ["client2", -200000, +110000]
    ];
    var context = {
      accounts: accounts
    };
    var chain = BookERC20EthV1.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("order takes and makes", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client2", "201", "Sell @ 0.400", 200000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client3", "301",  "Buy @ 0.500",  50000, 'GTCNoGasTopup'],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Open', 'None', 150000,  70000],
      ["301", 'Done', 'None',  50000,  20000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000,  -50000],
      ["client2", -200000,  +70000],
      ["client3",  +50000,  -20000]
    ];
    var context = {
      accounts: accounts
    };
    var chain = BookERC20EthV1.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("maker-only rejected if any would take", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client2", "201", "Sell @ 0.400", 200000, 'MakerOnly']
    ];
    var expectedOrders = [
      ["101", 'Open',     'None',      0,  0],
      ["201", 'Rejected', 'WouldTake', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,  -50000],
      ["client2", 0,       0]
    ];
    var context = {
      accounts: accounts
    };
    var chain = BookERC20EthV1.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("maker-only accepted if none would take", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client2", "201", "Sell @ 0.600", 200000, 'MakerOnly']
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Open', 'None', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,  -50000],
      ["client2", -200000, 0]
    ];
    var context = {
      accounts: accounts
    };
    var chain = BookERC20EthV1.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC cancelled if none would match", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client2", "201", "Sell @ 0.600", 200000, 'ImmediateOrCancel']
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Done', 'Unmatched', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,  -50000],
      ["client2", 0,       0]
    ];
    var context = {
      accounts: accounts
    };
    var chain = BookERC20EthV1.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC completed if all matches", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client2", "201", "Sell @ 0.400",  50000, 'ImmediateOrCancel']
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 50000,  25000],
      ["201", 'Done', 'None', 50000,  25000]
    ];
    var expectedBalanceChanges = [
      ["client1",  50000, -50000],
      ["client2", -50000,  25000]
    ];
    var context = {
      accounts: accounts
    };
    var chain = BookERC20EthV1.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC remaining cancelled if some matches", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup'],
      ['Create', 'OK', "client2", "201", "Sell @ 0.400", 200000, 'ImmediateOrCancel']
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000, 50000],
      ["201", 'Done', 'Unmatched', 100000, 50000]
    ];
    var expectedBalanceChanges = [
      ["client1",  100000, -50000],
      ["client2", -100000,  50000]
    ];
    var context = {
      accounts: accounts
    };
    var chain = BookERC20EthV1.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

*/
