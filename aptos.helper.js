import { aptosClient } from "./contract.js";

const GAS_LIMIT_SAFETY_BPS = 2000; // aptos

export const claimCoinPayload = () => {
  return {
    function: `0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::coin_bridge::claim_coin`,
    type_arguments: [
      `0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WETH`,
    ],
    arguments: [],
  };
};

export const getAptosBalance = async (address) => {
  try {
    const resource = await aptosClient.getAccountResource(
      address,
      `0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>`
    );
    const c = resource.data.coin.value;
    return BigInt(c);
  } catch (error) {
    return BigInt(0);
  }
};

const applyGasLimitSafety = (gasUsed) =>
  (BigInt(gasUsed) * BigInt(10000 + GAS_LIMIT_SAFETY_BPS)) / BigInt(10000);

const estimateGas = async (account, payload) => {
  const txnRequest = await aptosClient.generateTransaction(
    account.address(),
    payload
  );
  const sim = await aptosClient.simulateTransaction(account, txnRequest, {
    estimateGasUnitPrice: true,
    estimateMaxGasAmount: true,
  });
  const tx = sim[0];
  const max_gas_amount = applyGasLimitSafety(tx.gas_used).toString();
  return {
    max_gas_amount,
    gas_unit_price: tx.gas_unit_price,
  };
};

export const sendAndConfirmTransaction = async (account, payload) => {
  const options = await estimateGas(account, payload);
  const txnRequest = await aptosClient.generateTransaction(
    account.address(),
    payload,
    options
  );
  const signedTxn = await aptosClient.signTransaction(account, txnRequest);
  const res = await aptosClient.submitTransaction(signedTxn);
  return res.hash;
};
