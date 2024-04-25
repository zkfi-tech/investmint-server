const { Web3 } = require('web3');
const NavTrackerABI = require('../abi/NavTracker.json');
const debug = require('debug')('investmint-offchain-server:contractInteractions');

// Account
const web3 = new Web3(process.env.ANVIL_RPC_URL);
const anvilWallet = web3.eth.accounts.wallet.add(process.env.ANVIL_PRIVATE_KEY);
debug(`Wallet created: ${JSON.stringify(anvilWallet)}`);

// Contract
const navTrackerContractAddress = process.env.NAV_TRACKER_CONTRACT_ADDRESS;
const navTrackerContract = new web3.eth.Contract(
    NavTrackerABI, navTrackerContractAddress);

async function updateAUM() {
    // TODO: integrate custodian AUM API to get AUM
    const AUM = 45000n; // $45,000
    const tx = {
        from: anvilWallet[0].address,
        to: navTrackerContractAddress
    }

    await navTrackerContract.methods.aumListener(AUM).call(tx);
    const aumReturned = await navTrackerContract.methods.getAUM().call();
    return aumReturned;
}

async function getPrecision() {
    const precision = await navTrackerContract.methods.getPrecision().call();
    return precision;
}

module.exports = { getPrecision, updateAUM };