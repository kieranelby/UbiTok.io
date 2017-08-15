# Maintaining an Order Book on the Blockchain

Kieran Elby, 2017-08-15

In our first UbiTok.io blog post, I'm going to write about the technique we've developed to efficiently maintain an order book entirely on chain, including performing best execution matching. Warning: this post is a rather long and rather technical.

A limit order book is simply a set of open buy orders and a set of open sell orders. But to be useful, it needs to let us easily:
 - see if a new order will match any existing orders on the opposite side, and remove the existing orders if it does;
 - add a new order that didn't fully match;
 - remove a cancelled order.

When matching orders, we want best execution - for example, if there is one open sell order at a price of 1.23 and another @ 1.24, if I put in a buy order at @1.25, my order should match the sell order @ 1.23 first.

Now, if you were implementing a centralised exchange in a normal programming language, you'd probably store each side of the book as an ordered map from price to the orders at that price. 

Behind the scenes, the ordered map would probably use a [Tree](https://en.wikipedia.org/wiki/Tree_%28data_structure%29) (e.g. a red-black tree as used by [Java's TreeMap](https://docs.oracle.com/javase/8/docs/api/java/util/TreeMap.html), or a B-tree if stored in a database).

On paper, trees are great - they let us cheaply add and remove entries, as well as walk through the entries in order of price starting from a given price.

However, the Ethereum Virtual Machine is not a normal programming environment. In particular, reading from and writing to storage costs gas, which has to be paid by the user. This is fair enough - we have to compensate the Ethereum network for hosting our order book on thousands of computers.

Sadly, in this environment a tree is a bad choice because they're only cheap on average. The worst case behaviour can be quite bad - for example, some poor user who just wants to cancel her order could end up paying a huge gas fee because removing her order ends up rebalancing the whole tree (which involves many writes).

So what can we do instead? How about a linked list - they are predictable, cheap to update and easy to walk through?

Problem is that we want to walk through the open orders starting at a given price - but with a linked list we're limited to starting at one end of the list - there's no way to jump to the middle. It would be dangerous to have a contract where adding more orders makes everyone else have to spend more gas.

Now, we could keep our linked list sorted so that the most generous prices are at the start - that would work well for matching orders. However, a client wanting to add an order further down the book would have to spend more gas to skip to where their new order belongs. So that won't work well on-chain either.

What we can do to solve the problem is first simplify it by restricting how many different prices can be offered.

Let's start by limiting our prices to the 12 orders of magnitude from 0.000001 to 1000000. After all, if we encounter a token with a very low value we could always trade it in a different unit (MegaTokens, anyone?).

Next, let's restrict ourselves to three significant figures - so prices look like 4.56, not 4.5629470. Admittedly that does lead to bigger spreads - but this isn't uncommon on traditional stock exchanges.

If we were to write down all the prices possible under these rules, we'd find there are 10800 different prices, starting with 0.00000100, 0.00000101, 0.0000102, ... and ending ..., 997000, 998000, 999000.

One nice thing about the Ethereum Virtual Machine is that it uses 256-bit words. That means that just 43 storage locations can hold enough bits to allow one bit for each of the 10,800 possible prices.

We use a 1 bit to indicate that we have one or more orders at the price associated with that bit, and a 0 bit if there's no orders at that price.

For example, suppose we have an open sell order at a price of 1.23. It turns out that 1.23 is the 5423rd most generous sell price possible, so we need to set the 5423rd bit to 1. Since each storage location holds 256 bits, more precisely we need to set the 47th bit of the 21st storage location, since 21 x 256 + 47 is 5423.

By using this bitmap technique we can cheaply record and check which prices have orders and quickly skip to a particular price. We can also walk through adjacent prices without having to read from storage - we just look at different bits in the word we already read.
