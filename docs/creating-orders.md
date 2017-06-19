## Limit Orders

To ensure you get a fair price, UbiTok.io uses Limit Orders.

A Limit Order lets you set your own price when buying or selling. UbiTok.io guarantees "best execution" - for example, if you enter an order to buy at a price of 1.30, and there's an existing order in the book to sell at 1.25, you'll get the better (for you) price of 1.25.

The size of the order is always specified in the base currency (whether buying or selling).

Most limit orders can be partially filled - this can happen if, say, you enter an order to buy 10,000 UBI but only 4,000 UBI are available at the price you want.

## Order Terms

UbiTok.io supports the following Order Terms for your orders, which let you control what happens when your order can or cannot be filled:

- Good 'Til Cancelled - Your order will be matched against existing orders. If it cannot be completely filled, the remaining unmatched portion of your order will be added to the book and remain valid until you cancel it. These are the default terms.
- Immediate or Cancel - Your order will be matched against existing orders. If it cannot be completely filled, the remaining unmatched portion will be cancelled. The order will never be added to the book. Popular for quick, small trades.
- Maker Only - Your order will be rejected immediately (without matching) if any part of it would be filled. Otherwise, it will be added to the book and remain valid until you cancel it. Popular with market makers. Also known as Post Only.

## Gas Costs

UbiTok.io performs all matching using a smart contract running on the Ethereum blockchain. This is good - it means you don't need to worry about our servers failing, being shutdown or being hacked.

However, one downside is that running code on the Ethereum blockchain is slow and expensive - every operation costs "gas", which is paid for by the user via their Ethereum wallet. This helps keep the network running - thousands of nodes all need to agree on the results.

We've done our best to keep gas usage of our smart contract as low as possible. It can still use a lot of gas if you place an order that matches a large number of resting orders on the book. For example, if the book contains a hundred different open orders to sell 1 UBI token each @ 2.0, and you place an order to buy 100 UBI @ 2.0, your order will match those other 100 orders - that's 101 clients who need to be paid.

To let you stay in control of gas costs (and avoid running out of gas), we limit the number of matches allowed when placing a new order (there's no limit for orders already in the book).

For Immediate or Cancel orders, the remaining part of the order is unmatched if the limit is reached.

For Maker Only orders, the limit doesn't apply - they're always rejected if they would match an order.

For Good 'Til Cancelled orders, you can choose what to do if the maximum number of matches is reached.

## Gas Top Up

If Allow Gas Top-Up is disabled (the default), and there are so many matching orders in the book that matching your Good 'Til Cancelled order against them all is too expensive to do in one go, the unmatched portion of the order will be cancelled after matching as many as possible. The order will not be added to the book if this happens.

If Allow Gas Top-Up is enabled, and there are so many matching orders in the book that matching your Good 'Til Cancelled order against them all is too expensive to do in one go, your order will be moved to a special 'Needs Gas' status after matching as many as possible. You can then either cancel the unmatched portion of the order, or 'Continue Placing' the order, adding more gas.

This mostly affects very large orders at a generous price - the exchange UI will warn you if your order looks like it may be expensive to match, and suggest enabling gas-top up.

