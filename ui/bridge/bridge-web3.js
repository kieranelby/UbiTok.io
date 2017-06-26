
export default class BridgeMock {

    getExchangeBalances(callback) {
        
    }

    getErc20Balance(erc20addr, callback) {

    }

    getErc20Approved(erc20addr, callback) {

    }

    getEtherBalance(callback) {

    }

    submitCounterEtherDeposit (amount, callback) {

    }

    submitErc20Approve (erc20addr, amount, callback) {

    }

    submitErc20Unapprove (erc20addr, amount, callback) {

    }

    submitBaseErc20Deposit ( amount, callback ) {

    }

    submitCounterEtherWithdraw ( amount, callback ) {

    }

    submitBaseErc20Withdraw ( amount, callback ) {

    }

    getBookDepthStart (side, callback) {

    }

    getBookDepthNext (continueFrom, callback) {

    }

    submitCreateOrder (orderId, price, sizeBase, terms, callback) {

    }
    
    submitContinueOrder (orderId, callback) {

    }

    submitCancelOrder (orderId, callback) {

    }

    getOrder(orderId, callback) {

    }

    getOrderStatus(orderId, callback) {

    }

    getAllOrderIdsFor(client, fromBlock, callback) {

    }

    getAllMarketEvents(fromBlock, toBlock, callback) {

    }

    subscribeAllMarketEvents(fromBlock, callback) {

    }

}
