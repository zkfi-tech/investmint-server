const { Web3 } = require('web3');
const NavTrackerABI = require('../abi/NavTracker.json');
const IssuanceABI = require('../abi/Issuance.json');
const debug = require('debug')('investmint-offchain-server:contractInteractions');

// Account
const web3 = new Web3(process.env.ANVIL_RPC_URL);
const anvilWallet = web3.eth.accounts.wallet.add(process.env.ANVIL_PRIVATE_KEY);
debug(`Wallet created: ${JSON.stringify(anvilWallet)}`);

// Contracts
const navTrackerContract = new web3.eth.Contract(
    NavTrackerABI, process.env.NAV_TRACKER_CONTRACT_ADDRESS);

const issuanceContract = new web3.eth.Contract(
    IssuanceABI, process.env.ISSUANCE_CONTRACT_ADDRESS
)

async function updateAUM() {
    // TODO: integrate custodian AUM API to get AUM
    const AUM = 45000n; // $45,000
    const tx = {
        from: anvilWallet[0].address,
        to: process.env.NAV_TRACKER_CONTRACT_ADDRESS
    }

    await navTrackerContract.methods.aumListener(AUM).send(tx);
    const aumReturned = await navTrackerContract.methods.getAUM().call();
    return aumReturned;
}

async function getPrecision() {
    const precision = await navTrackerContract.methods.getPrecision().call();
    return precision;
}

async function confirmDepositOnChain(marketMaker) {
    /**
    const depositEventSub = await issuanceContract.events.DepositVerifiedFor({
        fromBlock: 'latest'
    });
    depositEventSub.on("connected", (connected) => debug(`Connected event: ${connected}`));

    depositEventSub.on('data', (event) => {
        debug(`Received event: ${event}`);
    });
    */

    const tx = {
        from: anvilWallet[0].address,
        to: process.env.ISSUANCE_CONTRACT_ADDRESS
    }

    await issuanceContract.methods.confirmDeposit(marketMaker).send(tx);

    // TODO: Only for testing. Remove later.
    // using pooling to listen to events as Anvil doesnt offer WSS
    setTimeout(pollEvents, 5000);
}

async function pollEvents() {
    const pastDepositVerifierEvents = await issuanceContract.getPastEvents('DepositVerifiedFor', {
        fromBlock: 0,
        toBlock: 'latest'
    });
    debug(pastDepositVerifierEvents);
}

module.exports = { getPrecision, updateAUM, confirmDepositOnChain };