import * as aptos from "aptos";
import Web3 from "web3";
import * as fs from "fs";
import * as path from "path";
import { preferedNetwork } from "./config.js";

const __dirname = path.resolve();

// rpc
const web3ProviderSelect = {
  Ethereum: new Web3(
    "wss://eth-mainnet.g.alchemy.com/v2/MAiLCz0L2XqKTGCK6ubIfxYqLFZZsmQF"
  ),
  Arbitrum: new Web3(
    "wss://arb-mainnet.g.alchemy.com/v2/a3gddyg-QZsrorLULTsvQACmRtXb-exh"
  ),
};

const aptosBridgeContractSelect = {
  Ethereum: "0x50002cdfe7ccb0c41f519c6eb0653158d11cd907",
  Arbitrum: "0x1BAcC2205312534375c8d1801C27D28370656cFf",
};

const explorerSelect = {
  Ethereum: "https://etherscan.io",
  Arbitrum: "https://arbiscan.io",
};

export const aptosBridgeContract = aptosBridgeContractSelect[preferedNetwork];

const contractAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, "./layerZeroAptosAbi.json"), "utf-8")
);
export const web3 = web3ProviderSelect[preferedNetwork];

export const contract = new web3.eth.Contract(contractAbi, aptosBridgeContract);
export const aptosClient = new aptos.AptosClient(
  "https://fullnode.mainnet.aptoslabs.com"
);
export const explorer = explorerSelect[preferedNetwork];
