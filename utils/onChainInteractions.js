const { Web3 } = require('web3');
const NavTrackerABI = require('../abi/NavTracker.json');
const IssuanceABI = require('../abi/Issuance.json');
const InvestMintDFTABI = require('../abi/InvestMintDFT.json');
const debug = require('debug')('investmint-offchain-server:contractInteractions');
const { inspect } = require('util');

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

const dftContract = new web3.eth.Contract(
    InvestMintDFTABI, process.env.DFT_CONTRACT_ADDRESS
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

async function getTotalDFTSupply() {
    const dftSupply = await dftContract.methods.totalSupply().call();
    return dftSupply;
}

async function confirmDepositOnChain(marketMaker) {
    try {
        const tx = {
            from: anvilWallet[0].address,
            to: process.env.ISSUANCE_CONTRACT_ADDRESS,
            value: '0'
        };

        const confirmDepositTxnReciept = await issuanceContract.methods.confirmDeposit(marketMaker).send(tx);
        return confirmDepositTxnReciept;
    } catch (error) {
        console.error('Error confirming deposit on chain:', error);
        throw error;
    }
}

async function pollEvents() {
    const pastDepositVerifierEvents = await issuanceContract.getPastEvents('DepositVerifiedFor', {
        fromBlock: 0,
        toBlock: 'latest'
    });
    debug(pastDepositVerifierEvents);
}

async function confirmWithdrawOnChain() { }

module.exports = { getPrecision, updateAUM, confirmDepositOnChain, getTotalDFTSupply };