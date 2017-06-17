var expect    = require("chai").expect;
var ReferenceExchange = require("../reference-exchange");

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
    it("matches two very simple orders", function() {
      var uut = new ReferenceExchange();
      uut.depositQuotedForTesting("client1", 5100000);
      uut.depositBaseForTesting(  "client2", 5200000);
      // client, orderId, sidedPrice, sizeBase, terms
      uut.createOrder("client1", "101",  "Buy@0.500", 100000, 'GoodTillCancel');
      uut.createOrder("client2", "201", "Sell@0.500", 100000, 'GoodTillCancel');
      var order = uut.getOrder("101");
      expect(order.client).to.equal("client1");
      expect(order.price).to.equal("Buy@0.500");
      expect(order.terms).to.equal('GoodTillCancel');
      expect(order.sizeBase).to.equal(100000);
      expect(order.status).to.equal('Done');
      expect(order.cancelOrRejectReason).to.equal('None');
      expect(order.executedBase).to.equal(100000);
      expect(order.executedQuoted).to.equal(50000);
      var order = uut.getOrder("201");
      expect(order.client).to.equal("client2");
      expect(order.price).to.equal("Sell@0.500");
      expect(order.terms).to.equal('GoodTillCancel');
      expect(order.sizeBase).to.equal(100000);
      expect(order.status).to.equal('Done');
      expect(order.cancelOrRejectReason).to.equal('None');
      expect(order.executedBase).to.equal(100000);
      expect(order.executedQuoted).to.equal(50000);
    });
  });
});
