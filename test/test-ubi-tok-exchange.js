var UbiTokExchange = artifacts.require("UbiTokExchange");

var UbiTokTypes = require('../test-helpers/ubi-tok-types.js');

contract('UbiTokExchange', function(accounts) {

  it("should return invalid packed price when packing out-of-range prices", function() {
    var examples = [
      [UbiTokTypes.encodeDirection("Invalid"),  500,   2, "invalid direction"],
      [UbiTokTypes.encodeDirection("Buy"),       99,   2, "buy mantissa too small"],
      [UbiTokTypes.encodeDirection("Buy"),     1000,   2, "buy mantissa too large"],
      [UbiTokTypes.encodeDirection("Buy"),      500,  -9, "buy exponent too small"],
      [UbiTokTypes.encodeDirection("Buy"),      500,  10, "buy exponent too large"],
      [UbiTokTypes.encodeDirection("Sell"),      99,   2, "sell mantissa too small"],
      [UbiTokTypes.encodeDirection("Sell"),    1000,   2, "sell mantissa too large"],
      [UbiTokTypes.encodeDirection("Sell"),     500,  -9, "sell exponent too small"],
      [UbiTokTypes.encodeDirection("Sell"),     500,  10, "sell exponent too large"]
    ];
    return UbiTokExchange.deployed().then(function(instance) {
      return Promise.all(examples.map(function(example) {
        return instance.packPrice.call(example[0],example[1],example[2]);
      }));
    }).then(function(results) {
      examples.forEach(function (example, index) {
        var result = results[index];
        assert.equal(result.valueOf(), UbiTokTypes.encodeDirection('Invalid'), example[3]);
      });
    });
  });

  it("should detect invalid packed prices when unpacking prices", function() {
    var examples = [
	  [    0, "marker value for invalid price"],
	  [32401, "just beyond max sell"],
	  [32767, "max 15-bit"],
	  [32768, "special in binary"],
	  [65535, "could be treated as -1"]
    ];
    return UbiTokExchange.deployed().then(function(instance) {
      return Promise.all(examples.map(function(example) {
        return instance.unpackPrice.call(example[0]);
      }));
    }).then(function(results) {
      examples.forEach(function (example, index) {
        var result = results[index];
        assert.equal(result[0].valueOf(), UbiTokTypes.encodeDirection('Invalid'), example[1]);
      });
    });
  });

  it("should pack and unpack valid prices", function() {
    var examples = [
      [UbiTokTypes.encodeDirection('Buy'),      999,   9,     1, "buy price max"],
      [UbiTokTypes.encodeDirection('Buy'),      999,   9,     1, "buy price max"],
      [UbiTokTypes.encodeDirection('Buy'),      100,  -8, 16200, "buy price min"],
      [UbiTokTypes.encodeDirection('Buy'),      500,   2,  6800, "buy price 50.0"],
      [UbiTokTypes.encodeDirection('Buy'),      100,   1,  8100, "buy price 1.0"],
      [UbiTokTypes.encodeDirection('Buy'),      123,  -1,  9877, "buy price 0.0123"],
      [UbiTokTypes.encodeDirection('Sell'),     100,  -8, 16201, "sell price min"],
      [UbiTokTypes.encodeDirection('Sell'),     999,   9, 32400, "sell price max"],
      [UbiTokTypes.encodeDirection('Sell'),     500,   2, 25601, "sell price 50.0"],
      [UbiTokTypes.encodeDirection('Sell'),     123,  -1, 22524, "sell price 0.0123"],
      [UbiTokTypes.encodeDirection('Sell'),     100,  -2, 21601, "sell price 0.001"],
      [UbiTokTypes.encodeDirection('Sell'),     999,  -3, 21600, "sell price 0.000999"]
    ];
    var uut;
    return UbiTokExchange.deployed().then(function(instance) {
      uut = instance;
      return Promise.all(examples.map(function(example) {
        return uut.packPrice.call(example[0],example[1],example[2]);
      }));
    }).then(function(results) {
      examples.forEach(function (example, index) {
        var result = results[index];
        assert.equal(result.valueOf(), example[3], 'pack ' + example[4]);
      });
      return Promise.all(examples.map(function(example) {
        return uut.unpackPrice.call(example[3]);
      }));
    }).then(function(results) {
      examples.forEach(function (example, index) {
        var result = results[index];
        assert.equal(result[0].valueOf(), example[0], 'unpack ' + example[4]);
        assert.equal(result[1].valueOf(), example[1], 'unpack ' + example[4]);
        assert.equal(result[2].valueOf(), example[2], 'unpack ' + example[4]);
      });
    });
  });

  it("should compute quoted prices", function() {
    var examples = [
      [1000, 123, 1, 1230, "1000 x 0.123 x 10**1 = 1000 * 1.23 = 1230"],
    ];
    return UbiTokExchange.deployed().then(function(instance) {
      return Promise.all(examples.map(function(example) {
        return instance.computeQuotedAmount.call(example[0],example[1],example[2]);
      }));
    }).then(function(results) {
      examples.forEach(function (example, index) {
        var result = results[index];
        assert.equal(result.valueOf(), example[3], example[4]);
      });
    });
  });

  it("should calculate opposite packed price", function() {
    var examples = [
      [UbiTokTypes.encodeDirection('Buy'),      999,   9,     1, "buy price max"],
      [UbiTokTypes.encodeDirection('Buy'),      999,   9,     1, "buy price max"],
      [UbiTokTypes.encodeDirection('Buy'),      100,  -8, 16200, "buy price min"],
      [UbiTokTypes.encodeDirection('Buy'),      500,   2,  6800, "buy price 50.0"],
      [UbiTokTypes.encodeDirection('Buy'),      100,   1,  8100, "buy price 1.0"],
      [UbiTokTypes.encodeDirection('Buy'),      123,  -1,  9877, "buy price 0.0123"],
      [UbiTokTypes.encodeDirection('Sell'),     100,  -8, 16201, "sell price min"],
      [UbiTokTypes.encodeDirection('Sell'),     999,   9, 32400, "sell price max"],
      [UbiTokTypes.encodeDirection('Sell'),     500,   2, 25601, "sell price 50.0"],
      [UbiTokTypes.encodeDirection('Sell'),     123,  -1, 22524, "sell price 0.0123"],
      [UbiTokTypes.encodeDirection('Sell'),     100,  -2, 21601, "sell price 0.001"],
      [UbiTokTypes.encodeDirection('Sell'),     999,  -3, 21600, "sell price 0.000999"]
    ];
    var uut;
    return UbiTokExchange.deployed().then(function(instance) {
      uut = instance;
      return Promise.all(examples.map(function(example) {
        return uut.oppositePackedPrice.call(example[3]);
      }));
    }).then(function(results) {
      return Promise.all(results.map(function(result) {
        return uut.unpackPrice.call(result);
      }));
    }).then(function(results) {
      examples.forEach(function (example, index) {
        var result = results[index];
        assert.equal(result[0].valueOf(), UbiTokTypes.oppositeEncodedDirection(example[0]), 'opposite+unpack ' + example[4]);
        assert.equal(result[1].valueOf(), example[1], 'opposite+unpack ' + example[4]);
        assert.equal(result[2].valueOf(), example[2], 'opposite+unpack ' + example[4]);
      });
    });
  });
  
});

contract('UbiTokExchange', function(accounts) {
  var packedBuyOnePointZero = 8100;
  it("instantly throws on invalid order id", function() {
    var uut;
    return UbiTokExchange.deployed().then(function(instance) {
      uut = instance;
      return uut.createOrder(0, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), {from: accounts[0]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw');
    });
  });
  it("instantly throws on duplicate order id", function() {
    var uut;
    return UbiTokExchange.deployed().then(function(instance) {
      uut = instance;
      return uut.depositQuotedForTesting(accounts[0], web3.toWei(2, 'finney'), {from: accounts[0]});
    }).then(function(result) {
      return uut.createOrder(1001, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), {from: accounts[0]});
    }).then(function(result) {
      return uut.createOrder(1001, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), {from: accounts[0]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw');
    });
  });
});

contract('UbiTokExchange', function(accounts) {
  var packedBuyOnePointZero = 8100;
  var packedMaxBuyPrice = 1;
  var badOrders = [
    [ 1001, 0, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), "obviously invalid price", "InvalidPrice" ],
    [ 1002, packedBuyOnePointZero, web3.toWei(100, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), "not enough funds", "InsufficientFunds" ],
    [ 1003, packedBuyOnePointZero, new web3.BigNumber("1e39"), UbiTokTypes.encodeTerms('GoodTillCancel'), "proposterously large base size", "InvalidSize" ],
    [ 1004, packedMaxBuyPrice, new web3.BigNumber("1e32"), UbiTokTypes.encodeTerms('GoodTillCancel'), "proposterously large quoted size (but base ok)", "InvalidSize" ],
    [ 1005, packedBuyOnePointZero, 90, UbiTokTypes.encodeTerms('GoodTillCancel'), "small base size", "InvalidSize" ],
    [ 1006, packedBuyOnePointZero, 900, UbiTokTypes.encodeTerms('GoodTillCancel'), "small quoted size (but base ok)", "InvalidSize" ],
  ];
  var balanceQuotedAfterDeposit;
  it("first accepts a deposit to be used to place bad orders", function() {
    var uut;
    return UbiTokExchange.deployed().then(function(instance) {
      uut = instance;
      return uut.depositQuotedForTesting(accounts[0], web3.toWei(2, 'finney'), {from: accounts[0]});
    }).then(function(result) {
      return uut.getClientBalances.call(accounts[0]);
    }).then(function(balances) {
      balanceQuotedAfterDeposit = balances[1];
    });
  });
  badOrders.forEach(function(badOrder) {
    it("gracefully reject create order with " + badOrder[4] + " (at no cost)", function() {
      var uut;
      return UbiTokExchange.deployed().then(function(instance) {
        uut = instance;
        return uut.createOrder(badOrder[0], badOrder[1], badOrder[2], badOrder[3], {from: accounts[0]});
      }).then(function(result) {
        return uut.getOrderState.call(badOrder[0]);
      }).then(function(result) {
        var state = UbiTokTypes.decodeState(result);
        assert.equal(state.status, 'Rejected');
        assert.equal(state.rejectReason, badOrder[5]);
        return uut.getClientBalances.call(accounts[0]);
      }).then(function(balancesAfterOrderRejected) {
        assert.equal(balancesAfterOrderRejected[1].toString(), balanceQuotedAfterDeposit.toString());
      });
    });
  });
});


function buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges) {
  var clients = new Set();
  for (var cmd of commands) {
    clients.add(cmd[2]);
  }
  for (var expectedBalanceChange of expectedBalanceChanges) {
    clients.add(expectedBalanceChange[0]);
  }
  var standardInitialBalanceBase   = 1000000000;
  var standardInitialBalanceQuoted =  100000000;
  var accountIdForClient = {};
  var nextAccountId = 0;
  for (var client of clients) {
    accountIdForClient[client] = nextAccountId;
    nextAccountId++;
    console.log("client " + client + " has account #" + accountIdForClient[client]);
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        console.log("depositing into " + ctx.accounts[a]);
        return ctx.uut.depositBaseForTesting(ctx.accounts[a], ab, {from: ctx.accounts[a]});
      };
    }(context, accountIdForClient[client], standardInitialBalanceBase)));
    chain = chain.then((function (ctx, a, aq) {
      return function (lastResult) {
        return ctx.uut.depositQuotedForTesting(ctx.accounts[a], aq, {from: ctx.accounts[a]});
      };
    }(context, accountIdForClient[client], standardInitialBalanceQuoted)));
  }
  for (var cmd of commands) {
    chain = chain.then((function (ctx, a, c) {
      return function (lastResult) {
        return ctx.uut.createOrder(
          c[3],
          UbiTokTypes.encodePrice(c[4]),
          c[5],
          UbiTokTypes.encodeTerms(c[6]),
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
        var state = UbiTokTypes.decodeState(lastResult);
        assert.equal(state.status, eo[1], "order " + eo[0]);
        assert.equal(state.rejectReason, eo[2], "order " + eo[0]);
        assert.equal(state.executedBase, eo[3], "order " + eo[0]);
        assert.equal(state.executedQuoted, eo[4], "order " + eo[0]);
      };
    }(context, expectedOrder)));
  }
  for (var expectedBalanceChange of expectedBalanceChanges) {
    var client = expectedBalanceChange[0];
    chain = chain.then((function (ctx, a, ebc) {
      return function (lastResult) {
        console.log("getting balance of " + ctx.accounts[a]);
        return ctx.uut.getClientBalances.call(ctx.accounts[a]);
      };
    }(context, accountIdForClient[client], expectedBalanceChange)));
    chain = chain.then((function (ctx, a, ebc) {
      return function (lastResult) {
        assert.equal(lastResult[0].toNumber() - standardInitialBalanceBase, ebc[1], "base balance change for " + ebc[0]);
        assert.equal(lastResult[1].toNumber() - standardInitialBalanceQuoted, ebc[2], "quoted balance change for " + ebc[0]);
      };
    }(context, accountIdForClient[client], expectedBalanceChange)));
  }
  return chain;
}

contract('UbiTokExchange', function(accounts) {
  it("two orders that don't match", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.600", 100000, 'GoodTillCancel']
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Open', 'None', 0,  0],
    ];
    var expectedBalanceChanges = [
      ["client1",      +0, -50000],
      ["client2", -100000,      0]
    ];
    var context = {
      accounts: accounts
    };
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("two orders exactly match", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.500", 100000, 'GoodTillCancel']
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Done', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000, -50000],
      ["client2", -100000, +50000]
    ];
    var context = {
      accounts: accounts
    };
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("two orders partial match of 2nd", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.500", 300000, 'GoodTillCancel']
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Open', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000,  -50000],
      ["client2", -300000,  +50000]
    ];

    var context = {
      accounts: accounts
    };
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("two orders best execution", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.400", 100000, 'GoodTillCancel']
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Done', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000,  -50000],
      ["client2", -100000,  +50000]
    ];

    var context = {
      accounts: accounts
    };
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("three orders mixed prices", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client1", "102",  "Buy@0.600", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.400", 200000, 'GoodTillCancel']
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
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("order takes and makes", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.400", 200000, 'GoodTillCancel'],
      ['Create', 'OK', "client3", "301",  "Buy@0.500",  50000, 'GoodTillCancel'],
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
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("maker-only rejected if any would take", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.400", 200000, 'MakerOnly']
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
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("maker-only accepted if none would take", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.600", 200000, 'MakerOnly']
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
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("IoC cancelled if none would match", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.600", 200000, 'ImmediateOrCancel']
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
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("IoC completed if all matches", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.400",  50000, 'ImmediateOrCancel']
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
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("IoC remaining cancelled if some matches", function() {
    var commands = [
      ['Create', 'OK', "client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel'],
      ['Create', 'OK', "client2", "201", "Sell@0.400", 200000, 'ImmediateOrCancel']
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
    var chain = UbiTokExchange.deployed().then(function(instance) {
      context.uut = instance;
    });
    return buildScenario(chain, context, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  var packedBuyOnePointZero = 8100;
  var packedMaxBuyPrice = 1;
  var minSellPricePacked = 16201;
  var buyFiftyPricePacked = 6800;
  var buyPoint0123PricePacked = 9877;
  var sellFiftyPricePacked = 25601;
  it("allows finding first open order from a price", function() {
    var uut;
    return UbiTokExchange.deployed().then(function(instance) {
      uut = instance;
      console.log('0');
      return uut.depositQuotedForTesting(accounts[0], web3.toWei(200, 'finney'), {from: accounts[0]});
    }).then(function(result) {
      console.log('1');
      return uut.depositBaseForTesting(accounts[0], web3.toWei(100, 'finney'), {from: accounts[0]});
    }).then(function(result) {
      console.log('2');
      return uut.findFirstOpenOrderFrom.call(packedMaxBuyPrice);
    }).then(function(result) {
      console.log('3');
      assert.equal(result.valueOf(), 0, "no orders in book");
    }).then(function(result) {
      console.log('4');
      return uut.findFirstOpenOrderFrom.call(minSellPricePacked);
    }).then(function(result) {
      console.log('5');
      assert.equal(result.valueOf(), 0, "no orders in book");
      return uut.createOrder(1001, buyFiftyPricePacked, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), {from: accounts[0]});
    }).then(function(result) {
      console.log('6');
      return uut.getOrderState.call(1001);
    }).then(function(result) {
      console.log('7');
      var state = UbiTokTypes.decodeState(result);
      assert.equal(state.status, "Open", "expected order 1001 to be open");
      return uut.findFirstOpenOrderFrom.call(packedMaxBuyPrice);
    }).then(function(result) {
      console.log('8');
      assert.equal(result.valueOf(), 1001, "our one buy order should be found since less aggressive than max price");
      return uut.findFirstOpenOrderFrom.call(minSellPricePacked);
    }).then(function(result) {
      console.log('9');
      assert.equal(result.valueOf(), 0, "still no sell orders in book");
      return uut.findFirstOpenOrderFrom.call(buyPoint0123PricePacked);
    }).then(function(result) {
      console.log('10');
      assert.equal(result.valueOf(), 0, "our one buy order should not be found since more aggressive than given from price");
      return uut.createOrder(1002, buyPoint0123PricePacked, web3.toWei(1000, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), {from: accounts[0]});
    }).then(function(result) {
      console.log('11');
      return uut.getOrderState.call(1002);
    }).then(function(result) {
      console.log('12');
      var state = UbiTokTypes.decodeState(result);
      assert.equal(state.status, "Open", "expected order 1002 to be open");
      return uut.findFirstOpenOrderFrom.call(buyPoint0123PricePacked);
    }).then(function(result) {
      console.log('13');
      assert.equal(result.valueOf(), 1002, "our 2nd buy order should now be found since equal to given from price");
      return uut.createOrder(1003, sellFiftyPricePacked, web3.toWei(3, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), {from: accounts[0]});
    }).then(function(result) {
      console.log('14');
      return uut.getOrderState.call(1003);
    }).then(function(result) {
      console.log('15');
      var state = UbiTokTypes.decodeState(result);
      assert.equal(state.status, "Open", "expected order 1003 to be open");
      assert.equal(state.executedBase.toString(), web3.toWei(1, 'finney'), "expected order 1003 to have executed against order 1001");
      return uut.findFirstOpenOrderFrom.call(packedMaxBuyPrice);
    }).then(function(result) {
      console.log('16');
      assert.equal(result.valueOf(), 1002, "order 1002 is now the top buy in the book");
    });
  });
});
