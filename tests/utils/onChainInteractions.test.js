const { confirmDepositOnChain } = require('../../utils/onChainInteractions');
const { inspect } = require('util');

describe("Testing onChainInteractions", () => {
    test('test confirmDepositOnChain', async () => {
        const marketMaker = process.env.ANVIL_PUBLIC_KEY;
        let confirmDepositReceipt = await confirmDepositOnChain(marketMaker);
        let depositEvent = confirmDepositReceipt.events.DepositVerifiedFor;
        let depositEventData = depositEvent.returnValues['0'];
        console.log(inspect(depositEventData));

        expect(depositEventData).toBe(marketMaker);
    }, 50000);
});