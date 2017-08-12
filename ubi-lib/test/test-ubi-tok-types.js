// Tests for the UbiTokTypes module which deals mostly with decoding/encoding exchange contract input/output.
//

var expect = require("chai").expect;
var UbiTokTypes = require("../ubi-tok-types");

describe("UbiTokTypes", function() {
  describe("Order Ids", function() {
    it("encodes creation date into order id and extracts it again", function() {
      let uut = UbiTokTypes;
      // not guaranteed to preserve sub-second precision mind you
      let exampleDate = new Date(2018, 0, 15, 10, 15, 23);
      let notVeryRandomHex = '01020304';
      let encodedOrderId = uut.computeEncodedOrderId(exampleDate, notVeryRandomHex);
      let friendlyOrderId = uut.decodeOrderId(encodedOrderId);
      let recoveredDate = uut.extractClientDateFromDecodedOrderId(friendlyOrderId);
      expect(recoveredDate.getTime(), 'date extracted from order id').to.equal(exampleDate.getTime());
    });
  });
  describe("Price Parsing", function() {
    it("parses prices", function() {
      let uut = UbiTokTypes;
      let testGood = function (pricePart, expectedMantissa, expectedExponent) {
        for (let direction of ['Buy', 'Sell']) {
          let result = uut.parseFriendlyPricePart(direction, pricePart);
          expect(result[0], 'price ' + pricePart + ' should not have an error').to.be.undefined;
          expect(result[1], 'price ' + pricePart + ' should have an array result of size 3').to.be.instanceof(Array).with.length(3);
          expect(result[1][0], 'price ' + pricePart + ' should have same direction as passed in').to.equal(direction);
          expect(result[1][1], 'price ' + pricePart + ' should have expected mantissa').to.equal(expectedMantissa);
          expect(result[1][2], 'price ' + pricePart + ' should have expected exponent').to.equal(expectedExponent);
        }
      };
      let testBad = function (direction, pricePart, expectedMsg, expectedSuggestion) {
        let result = uut.parseFriendlyPricePart(direction, pricePart);
        expect(result[1], 'price ' + pricePart + ' should not have a result').to.be.undefined;
        expect(result[0].msg, 'price ' + pricePart + ' should have expected error message').to.equal(expectedMsg);
        expect(result[0].suggestion, 'price ' + pricePart + ' should have expected error suggestion').to.equal(expectedSuggestion);
      };
      testGood('1', 100, 1);
      testGood('12.3', 123, 2);
      testGood('0012.3', 123, 2);
      testGood('1.23', 123, 1);
      testGood('  1.23', 123, 1);
      testGood('1.23  ', 123, 1);
      testGood('  1.23  ', 123, 1);
      testGood('0.123', 123, 0);
      testGood('.123', 123, 0);
      testGood('.1230', 123, 0);
      testGood('9990', 999, 4);
      testGood('9990.00', 999, 4);
      testGood('999000', 999, 6);
      testGood('0.000001', 100, -5);
      testGood('0.00000100', 100, -5);
      testGood('0.0000010000', 100, -5);
      testBad('Buy', '', 'is blank');
      testBad('Buy', 'wibble', 'does not look like a regular number');
      testBad('Buy', '-2', 'does not look like a regular number');
      testBad('Buy', '0.0', 'is too small', '0.000001');
      testBad('Buy', '0.000000999', 'is too small', '0.000001');
      testBad('Buy', '0.00000001', 'is too small', '0.000001');
      testBad('Buy', '999001', 'is too large', '999000');
      testBad('Buy', '100000000', 'is too large', '999000');
      testBad('Buy', '1.234', 'has too many significant figures', '1.23');
      testBad('Sell', '1.234', 'has too many significant figures', '1.24');
      testBad('Buy', '98760.00', 'has too many significant figures', '98700');
      testBad('Sell', '98760.00', 'has too many significant figures', '98800');
      testBad('Sell', '98700.01', 'has too many significant figures', '98800');
      testBad('Buy', '0.000001234', 'has too many significant figures', '0.00000123');
    });
  });
});
