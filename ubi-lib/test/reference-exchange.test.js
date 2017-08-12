// Tests for the reference exchange in isolation.
// We mostly test it in conjuction with the contract, but it's
// useful to prototype some tests here (and test semi-internal bits).

var expect    = require("chai").expect;
var ReferenceExchange = require("../reference-exchange");
var BigNumber = require("bignumber.js");

var runScenario = function (commands, expectedOrders, expectedBalanceChanges) {
  var uut = new ReferenceExchange();
  var clients = new Set();
  for (var cmd of commands) {
    clients.add(cmd[2]);
  }
  for (var ebc of expectedBalanceChanges) {
    clients.add(expectedBalanceChanges[0]);
  }
  var standardInitialBalanceBase   = 1000000000;
  var standardInitialBalanceQuoted =  100000000;
  for (var client of clients) {
    uut.depositBaseForTesting(client, new BigNumber(standardInitialBalanceBase));
    uut.depositCntrForTesting(client, new BigNumber(standardInitialBalanceQuoted));
  }
  for (var cmd of commands) {
    uut.createOrder(cmd[2], cmd[3], cmd[4], new BigNumber(cmd[5]), cmd[6], cmd[7]);
  }
  for (var eo of expectedOrders) {
    var orderId = eo[0];
    var ao = uut.getOrder(orderId);
    expect(ao.status, "order " + orderId).to.equal(eo[1]);
    expect(ao.reasonCode, "order " + orderId).to.equal(eo[2]);
    expect(ao.executedBase.toNumber(), "executed base of order " + orderId).to.equal(eo[3]);
    expect(ao.executedCntr.toNumber(), "executed quoted of order " + orderId).to.equal(eo[4]);
  }
  for (var ebc of expectedBalanceChanges) {
    var client = ebc[0];
    var ab = uut.getClientBalances(client)[0].toNumber();
    var aq = uut.getClientBalances(client)[1].toNumber();
    var abc = ab - standardInitialBalanceBase;
    var aqc = aq - standardInitialBalanceQuoted;
    expect(abc, "base balance change for " + client).to.equal(ebc[1]);
    expect(aqc, "quoted balance change for " + client).to.equal(ebc[2]);
  }
};

describe("ReferenceExchange", function() {
  describe("Price Calculations", function() {
    it("does not do something really weird with prices", function() {
      var uut = new ReferenceExchange();
      var result = uut._parseFriendlyPricePart("Buy", "100.00");
      expect(result[1]).to.deep.equal(['Buy', 100, 3]);
    });
    it("enumerates ranges of prices", function() {
      var uut = new ReferenceExchange();
      expect(uut._priceRange("Buy @ 1.03","Buy @ 0.998")).to.deep.equal(
        ["Buy @ 1.03", "Buy @ 1.02", "Buy @ 1.01", "Buy @ 1.00", "Buy @ 0.999", "Buy @ 0.998"]
      );
    });
  });
  describe("Funds Management", function() {
    it("accepts test deposits", function() {
      var uut = new ReferenceExchange();
      uut.depositBaseForTesting("client1", new BigNumber(100));
      uut.depositBaseForTesting("client1", new BigNumber(200));
      uut.depositCntrForTesting("client1", new BigNumber(5000));
      expect(uut.getClientBalances("client1")[0].toNumber()).to.equal(300);
      expect(uut.getClientBalances("client1")[1].toNumber()).to.equal(5000);
      expect(uut.getClientBalances("unknownClient")[0].toNumber()).to.equal(0);
    });
  });
  describe("Order Creation", function() {
    it("returns simple created order", function() {
      var uut = new ReferenceExchange();
      uut.depositCntrForTesting("client1", new BigNumber(30000));
      // client, orderId, sidedPrice, sizeBase, terms
      uut.createOrder("client1", "101", "Buy @ 2.50",  new BigNumber(10000), 'GTCNoGasTopup', 3);
      var order = uut.getOrder("101");
      expect(order.client).to.equal("client1");
      expect(order.price).to.equal("Buy @ 2.50");
      expect(order.terms).to.equal('GTCNoGasTopup');
      expect(order.sizeBase.toNumber()).to.equal(10000);
      expect(order.status).to.equal('Open');
      expect(order.reasonCode).to.equal('None');
      expect(order.executedBase.toNumber()).to.equal(0);
      expect(order.executedCntr.toNumber()).to.equal(0);
    });
  });
  describe("Order Matching", function() {
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
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
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
        ["client2", -100000, +50000 * 0.9995]
      ];
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
    it("two orders partial match of 1st", function() {
      var commands = [
        ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 300000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client2", "201", "Sell @ 0.500", 100000, 'GTCNoGasTopup', 3]
      ];
      var expectedOrders = [
        ["101", 'Open', 'None', 100000,  50000],
        ["201", 'Done', 'None', 100000,  50000],
      ];
      var expectedBalanceChanges = [
        ["client1", +100000, -150000],
        ["client2", -100000,  +50000 * 0.9995]
      ];
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
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
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
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
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
    it("three orders mixed prices", function() {
      var commands = [
        ['Create', 'OK', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "102",  "Buy @ 0.600", 100000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client2", "201", "Sell @ 0.400", 200000, 'GTCNoGasTopup', 3]
      ];
      var expectedOrders = [
        ["101", 'Done', 'None', 100000,  50000],
        ["102", 'Done', 'None', 100000,  60000],
        ["201", 'Done', 'None', 200000, 110000],
      ];
      var expectedBalanceChanges = [
        ["client1", +200000, -110000],
        ["client2", -200000, +110000 * 0.9995]
      ];
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
    it("high gas usage", function() {
      var commands = [
        ['Create', 'OK', "client1", "110",  "Buy @ 100.00",     100, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "101",  "Buy @ 0.00500", 2000000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "102",  "Buy @ 0.0100",  1000000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "103",  "Buy @ 0.0500",   200000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "104",  "Buy @ 0.100",    100000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "105",  "Buy @ 0.500",     20000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "106",  "Buy @ 1.00",     10000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "107",  "Buy @ 5.00",      2000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "108",  "Buy @ 10.0",     1000, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client1", "109",  "Buy @ 50.0",      200, 'GTCNoGasTopup', 3],
        ['Create', 'OK', "client2", "201", "Sell @ 0.005",  4000000, 'GTCWithGasTopup', 12],
      ];
      var expectedOrders = [
        ["201", 'Open', 'None', 3333300, 100000],
      ];
      var expectedBalanceChanges = [
      ];
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
  });
});
