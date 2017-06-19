var expect    = require("chai").expect;
var ReferenceExchange = require("../reference-exchange");

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
    uut.depositBaseForTesting(client, standardInitialBalanceBase);
    uut.depositQuotedForTesting(client, standardInitialBalanceQuoted);
  }
  for (var cmd of commands) {
    uut.createOrder(cmd[2], cmd[3], cmd[4], cmd[5], cmd[6]);
  }
  for (var eo of expectedOrders) {
    var orderId = eo[0];
    var ao = uut.getOrder(orderId);
    expect(ao.status, "order " + orderId).to.equal(eo[1]);
    expect(ao.cancelOrRejectReason, "order " + orderId).to.equal(eo[2]);
    expect(ao.executedBase, "executed base of order " + orderId).to.equal(eo[3]);
    expect(ao.executedQuoted, "executed quoted of order " + orderId).to.equal(eo[4]);
  }
  for (var ebc of expectedBalanceChanges) {
    var client = ebc[0];
    var ab = uut.getBalanceBaseForClient(client);
    var aq = uut.getBalanceQuotedForClient(client);
    var abc = ab - standardInitialBalanceBase;
    var aqc = aq - standardInitialBalanceQuoted;
    expect(abc, "base balance change for " + client).to.equal(ebc[1]);
    expect(aqc, "quoted balance change for " + client).to.equal(ebc[2]);
  }
};

describe("ReferenceExchange", function() {
  describe("Price Calculations", function() {
    it("computes quoted amounts", function() {
      var uut = new ReferenceExchange();
      expect(uut.computeAmountQuoted(1000, "Buy@1.23")).to.equal(1230);
      expect(uut.computeAmountQuoted(1000, "Buy@9.99")).to.equal(9990);
      expect(uut.computeAmountQuoted(2001, "Buy@1.23")).to.equal(2461);
      expect(uut.computeAmountQuoted(10, "Buy@1.23")).to.equal(12);
      expect(uut.computeAmountQuoted(10, "Sell@1.23")).to.equal(12);
      expect(uut.computeAmountQuoted(10, "Buy@1.29")).to.equal(12);
      expect(uut.computeAmountQuoted(10, "Sell@1.29")).to.equal(12);
      expect(uut.computeAmountQuoted(100000000, "Buy@0.00000123")).to.equal(123);
      expect(uut.computeAmountQuoted(100000000, "Buy@0.0000123")).to.equal(1230);
      expect(uut.computeAmountQuoted(100000000, "Buy@0.000123")).to.equal(12300);
      expect(uut.computeAmountQuoted(100000000, "Buy@0.00123")).to.equal(123000);
      expect(uut.computeAmountQuoted(100000000, "Buy@0.0123")).to.equal(1230000);
      expect(uut.computeAmountQuoted(100000000, "Buy@0.123")).to.equal(12300000);
      expect(uut.computeAmountQuoted(100000000, "Buy@1.23")).to.equal(123000000);
      expect(uut.computeAmountQuoted(10, "Buy@12.3")).to.equal(123);
      expect(uut.computeAmountQuoted(10, "Buy@123")).to.equal(1230);
      expect(uut.computeAmountQuoted(10, "Buy@1230")).to.equal(12300);
      expect(uut.computeAmountQuoted(10, "Buy@12300")).to.equal(123000);
      expect(uut.computeAmountQuoted(10, "Buy@123000")).to.equal(1230000);
    });
    it("enumerates ranges of prices", function() {
      var uut = new ReferenceExchange();
      expect(uut._priceRange("Buy@1.03","Buy@0.998")).to.deep.equal(
        ["Buy@1.03", "Buy@1.02", "Buy@1.01", "Buy@1.00", "Buy@0.999", "Buy@0.998"]
      );
    });
  });
  describe("Funds Management", function() {
    it("accepts test deposits", function() {
      var uut = new ReferenceExchange();
      uut.depositBaseForTesting("client1", 100);
      uut.depositBaseForTesting("client1", 200);
      uut.depositQuotedForTesting("client1", 5000);
      expect(uut.getBalanceBaseForClient("client1")).to.equal(300);
      expect(uut.getBalanceQuotedForClient("client1")).to.equal(5000);
      expect(uut.getBalanceBaseForClient("unknownClient")).to.equal(0);
    });
  });
  describe("Order Creation", function() {
    it("returns simple created order", function() {
      var uut = new ReferenceExchange();
      uut.depositQuotedForTesting("client1", 30000);
      // client, orderId, sidedPrice, sizeBase, terms
      uut.createOrder("client1", "101", "Buy@2.50", 10000, 'GoodTillCancel');
      var order = uut.getOrder("101");
      expect(order.client).to.equal("client1");
      expect(order.price).to.equal("Buy@2.50");
      expect(order.terms).to.equal('GoodTillCancel');
      expect(order.sizeBase).to.equal(10000);
      expect(order.status).to.equal('Open');
      expect(order.cancelOrRejectReason).to.equal('None');
      expect(order.executedBase).to.equal(0);
      expect(order.executedQuoted).to.equal(0);
    });
  });
  describe("Order Matching", function() {
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
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
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
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
    it("two orders partial match of 1st", function() {
      var commands = [
        ['Create', 'OK', "client1", "101",  "Buy@0.500", 300000, 'GoodTillCancel'],
        ['Create', 'OK', "client2", "201", "Sell@0.500", 100000, 'GoodTillCancel']
      ];
      var expectedOrders = [
        ["101", 'Open', 'None', 100000,  50000],
        ["201", 'Done', 'None', 100000,  50000],
      ];
      var expectedBalanceChanges = [
        ["client1", +100000, -150000],
        ["client2", -100000,  +50000]
      ];
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
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
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
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
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
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
      runScenario(commands, expectedOrders, expectedBalanceChanges);
    });
  });
});
