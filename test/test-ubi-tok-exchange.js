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
  var packedOnePointZero = 8100;
  var badOrders = [
    [ 1001, 0, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), "obviously invalid price", "InvalidPrice" ],
    [ 1002, packedOnePointZero, web3.toWei(100, 'finney'), UbiTokTypes.encodeTerms('GoodTillCancel'), "not enough funds", "InsufficientFunds" ],
    [ 1003, packedOnePointZero, new web3.BigNumber("1e39"), UbiTokTypes.encodeTerms('GoodTillCancel'), "proposterously large size", "InvalidSize" ],
  ];
  badOrders.forEach(function(badOrder) {
    it("immediately reject create order with " + badOrder[4] + " (at no cost)", function() {
      var uut;
      var balanceQuotedAfterDeposit;
      return UbiTokExchange.deployed().then(function(instance) {
        uut = instance;
        return uut.depositQuotedForTesting(accounts[0], web3.toWei(2, 'finney'), {from: accounts[0]});
      }).then(function(result) {
        return uut.balanceQuotedForClient.call(accounts[0]);
      }).then(function(balanceQuoted) {
        balanceQuotedAfterDeposit = balanceQuoted;
        return uut.createOrder(badOrder[0], badOrder[1], badOrder[2], badOrder[3], {from: accounts[0]});
      }).then(function(result) {
        return uut.getOrderState.call(badOrder[0]);
      }).then(function(result) {
        var state = UbiTokTypes.decodeState(result);
        assert.equal(state.status, 'Rejected');
        assert.equal(state.rejectReason, badOrder[5]);
        return uut.balanceQuotedForClient.call(accounts[0]);
      }).then(function(balanceQuotedAfterOrderRejected) {
        assert.equal(balanceQuotedAfterOrderRejected.toString(), balanceQuotedAfterDeposit.toString());
      });
    });
  });
});
