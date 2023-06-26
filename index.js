import * as aptos from 'aptos';
import ethers from 'ethers';

import { contract, web3, explorer, aptosBridgeContract } from './contract.js';
import * as accs from './accs.js';
import { randomFloatInRange, randomIntInRange, sleep } from './generic.helper.js';
import { claimCoinPayload, getAptosBalance, sendAndConfirmTransaction } from './aptos.helper.js';
import {
  preferedNetwork,
  sleepFrom,
  sleepTo,
  ethMaxGwei,
  sleepOnHighGas,
  ethToBridgeMin,
  ethToBridgeMax,
  zeroAddress,
  aptosGas,
  aptosAirdropAmount,
  maxPriorityFeePerGas,
} from './config.js';

const ethWallets = await accs.importETHWallets();
const aptosWallets = await accs.importAptosWallets();

if (ethWallets.length !== aptosWallets.length) {
  console.log(
    `Wallet count should be equal. Aptos wallets passed: ${aptosWallets.length}, ETH wallets passed: ${ethWallets.length}`
  );
  process.exit(0);
}

const sendEthToAptos = async (ethWalletKey, aptosWalletKey) =>
  new Promise(async (resolve, reject) => {
    const ethWallet = web3.eth.accounts.privateKeyToAccount('0x' + ethWalletKey);

    const aptosAccount = new aptos.AptosAccount(Uint8Array.from(Buffer.from(aptosWalletKey.replace('0x', ''), 'hex')));
    const aptosWalletAddress = aptosAccount.address().hex();

    try {
      const baseFee = await getBaseFee(ethWallet.address);

      const _callParams = [ethWallet.address, zeroAddress];
      const adapterParams = ethers.utils.solidityPack(
        ['uint16', 'uint256', 'uint256', 'bytes'],
        [2, aptosGas, aptosAirdropAmount, aptosWalletAddress]
      );

      const quoteForSend = await contract.methods.quoteForSend(_callParams, adapterParams).call();

      const nativeFee = quoteForSend.nativeFee;

      console.log(
        `${preferedNetwork} => Aptos. ${ethWallet.address}: Native Fee ${web3.utils.fromWei(nativeFee, 'ether')} ETH`
      );

      const amountToBridge = randomFloatInRange(ethToBridgeMin, ethToBridgeMax, 6);
      console.log(
        `${preferedNetwork} => Aptos. ${ethWallet.address}: Sending ${amountToBridge} ETH to ${aptosWalletAddress}`
      );

      const ethBalance = await web3.eth.getBalance(ethWallet.address);

      const amountToBridgeWei = web3.utils.toWei(String(amountToBridge), 'ether');
      const amountWithFee = ethers.BigNumber.from(amountToBridgeWei).add(nativeFee);

      const estimatedGas = await contract.methods
        .sendETHToAptos(aptosWalletAddress, amountToBridgeWei, _callParams, adapterParams)
        .estimateGas({
          from: ethWallet.address,
          value: amountWithFee.toString(),
        });

      const minEthNeeded = ethers.BigNumber.from(estimatedGas)
        .mul(ethers.BigNumber.from(baseFee))
        .add(maxPriorityFeePerGas)
        .add(ethers.BigNumber.from(amountWithFee));

      if (ethers.BigNumber.from(ethBalance).lte(minEthNeeded)) {
        console.log(
          `${preferedNetwork} => Aptos. ${ethWallet.address}: Unsufficient balance. Balance - ${web3.utils.fromWei(
            String(ethBalance)
          )}, Needed - ${web3.utils.fromWei(String(minEthNeeded))}, `
        );
        resolve();
      }

      const tx = {
        from: ethWallet.address,
        to: aptosBridgeContract,
        gas: estimatedGas,
        maxPriorityFeePerGas,
        maxFeePerGas: ethers.BigNumber.from(baseFee).add(maxPriorityFeePerGas).toString(),
        value: amountWithFee.toString(),
        data: await contract.methods
          .sendETHToAptos(aptosWalletAddress, amountToBridgeWei, _callParams, adapterParams)
          .encodeABI(),
      };

      const signedTx = await web3.eth.accounts.signTransaction(tx, ethWalletKey);

      web3.eth
        .sendSignedTransaction(signedTx.rawTransaction)
        .on('transactionHash', async (hash) => {
          console.log(`${preferedNetwork} => Aptos. ${ethWallet.address}: Transaction is sent! ${explorer}/tx/${hash}`);

          const cachedAptosBalance = await getAptosBalance(aptosAccount.address());

          while (true) {
            const freshAptosBalance = await getAptosBalance(aptosAccount.address());

            if (freshAptosBalance > cachedAptosBalance) {
              const airdropClaimHash = await sendAndConfirmTransaction(aptosAccount, claimCoinPayload());

              console.log(
                `${preferedNetwork} => Aptos. ${aptosWalletAddress}: Airdrop claim transaction is sent! https://explorer.aptoslabs.com/txn/${airdropClaimHash}`
              );

              return resolve();
            } else {
              await sleep(60000);
            }
          }
        })
        .on('error', async (error) => {
          {
            if (error?.message.includes('insufficient funds')) {
              console.log(`${preferedNetwork} => Aptos. ${ethWallet.address}: Unsufficient balance.`);
              resolve();
            } else {
              console.log(`${preferedNetwork} => Aptos. ${ethWallet.address}: Error ->`);
              console.dir(error);
              await sleep(60000); // 1 min to prevent spam
              return sendETHToAptos(ethWalletKey, aptosWalletKey);
            }
          }
        });
    } catch (err) {
      if (err?.message.includes('insufficient funds')) {
        console.log(`${preferedNetwork} => Aptos. ${ethWallet.address}: Unsufficient balance for gas.`);
        resolve();
      } else {
        console.log(`${preferedNetwork} => Aptos. ${ethWallet.address}: Error ->`);
        console.dir(err);
        await sleep(60000); // 1 min to prevent spam
        return await sendETHToAptos(ethWalletKey, aptosWalletKey);
      }
    }
  });

const checkGas = async (baseFee, ethAddress) => {
  const currentGas = Number(web3.utils.fromWei(String(baseFee), 'Gwei'));
  const isGasOkay = currentGas <= ethMaxGwei;

  if (!isGasOkay) {
    console.log(
      `${preferedNetwork} => Aptos. ${ethAddress}: gas is too high. ${currentGas} gwei now vs ${ethMaxGwei} gwei limit. Waiting for ${
        sleepOnHighGas / 1000
      } seconds`
    );

    await sleep(sleepOnHighGas);
  }

  return isGasOkay;
};

const getBaseFee = async (ethAddress) => {
  let isGasOkay = false;
  let baseFee;

  while (!isGasOkay) {
    baseFee = (await web3.eth.getBlock('latest')).baseFeePerGas;
    isGasOkay = await checkGas(baseFee, ethAddress);
  }

  return baseFee;
};

// main loop

for (let i = 0; i < ethWallets.length; i++) {
  await sendEthToAptos(ethWallets[i], aptosWallets[i]);

  if (i < ethWallets.length - 1) {
    const timing = randomIntInRange(sleepFrom, sleepTo);
    console.log(`${preferedNetwork} => Aptos. Waiting for ${timing} seconds before next transaction...`);
    await sleep(timing * 1000);
  }
}
process.exit(0);
