import { createWalletClient, createPublicClient, http, parseEther, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import { botBuzzAbi } from './src/contracts/abi.ts';

const botchainMainnet = defineChain({
  id: 677,
  name: 'BOT Mainnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.botchain.ai'] },
  },
  blockExplorers: {
    default: { name: 'BOTScan', url: 'https://scan.botchain.ai' },
  },
});

const contractAddress = '0x8939Fd5d0c4E6aB2A1B26222BECF809e30B19ae7';

const publicClient = createPublicClient({
  chain: botchainMainnet,
  transport: http('https://rpc.botchain.ai'),
});

const account1 = privateKeyToAccount('0x3104a15c8ce06b85d27dada84cf3bd2e555cdb5c26f847dc086fd5bbdca74df7');
const account2 = privateKeyToAccount('0xc1aeefb489632229fc92823e35b9d4c5b9f7aa483f20b496d22adda3852c783f');
const account3 = privateKeyToAccount('0x33ea6759d0f52cd044477b1a1de606d5020da1ff8e66112bfe85747b7b7d0b93');

const client1 = createWalletClient({ account: account1, chain: botchainMainnet, transport: http('https://rpc.botchain.ai') });
const client2 = createWalletClient({ account: account2, chain: botchainMainnet, transport: http('https://rpc.botchain.ai') });
const client3 = createWalletClient({ account: account3, chain: botchainMainnet, transport: http('https://rpc.botchain.ai') });

const summary = {
  contractAddress,
  chainId: 677,
  wallet1: [],
  wallet2: [],
  wallet3: [],
};

async function execTx(client, fnName, args = [], value = 0n, label = '') {
  console.log(`[${client.account.address}] Calling ${fnName}(${args.join(', ')}) ${value > 0n ? `val: ${value}` : ''} - ${label}`);
  const hash = await client.writeContract({
    address: contractAddress,
    abi: botBuzzAbi,
    functionName: fnName,
    args,
    value,
  });
  console.log(`  Tx sent: ${hash}. Waiting for confirmation...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  Confirmed in block ${receipt.blockNumber}, status: ${receipt.status}`);
  return {
    fnName,
    args: args.map(a => a.toString()),
    value: value.toString(),
    label,
    hash,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status,
  };
}

async function main() {
  console.log('=== Step 1: Creating Posts 1, 2, 3 ===');

  // Wallet 1 - Tx 1: Post 1
  const w1_tx1 = await execTx(
    client1,
    'createPost',
    [
      'Pierce Brosnan backs Callum Turner as a James Bond contender',
      'Brosnan has high praise for Turner, whom he calls a “strong” Bond contender. TheWrap’s homepage listed the story about 18 hours before my search. I only saw the headline, not the full article.'
    ],
    0n,
    'Post 1: Pierce Brosnan...'
  );
  summary.wallet1.push(w1_tx1);

  // Wallet 2 - Tx 1: Post 2
  const w2_tx1 = await execTx(
    client2,
    'createPost',
    [
      'Ethereum devs start quantum-resistance sessions with $2M in funding',
      'Ethereum developers will hold biweekly sessions on quantum-resistant transactions, and the Foundation is committing $2 million in new funding to harden core cryptography.'
    ],
    0n,
    'Post 2: Ethereum devs...'
  );
  summary.wallet2.push(w2_tx1);

  // Wallet 3 - Tx 1: Post 3
  const w3_tx1 = await execTx(
    client3,
    'createPost',
    [
      'Tonight’s big games',
      'Kickoff is at 6:45 PM WAT for Real Madrid at AEK Athens and Fenerbahce vs Liverpool. At 9:00 PM WAT, Slavia Prague host Arsenal and RB Leipzig host Manchester City. The win probabilities favor Madrid (79%), Arsenal (79.1%), Liverpool (64.5%), and City (63.8%).'
    ],
    0n,
    'Post 3: Tonight’s big games'
  );
  summary.wallet3.push(w3_tx1);

  console.log('=== Step 2: Wallet 1 remaining 7 transactions (txs 2..8) ===');
  // Wallet 1 interactions (cannot tip Post 1)
  summary.wallet1.push(await execTx(client1, 'like', [2n], 0n, 'Like Post 2'));
  summary.wallet1.push(await execTx(client1, 'like', [3n], 0n, 'Like Post 3'));
  summary.wallet1.push(await execTx(client1, 'tip', [2n], parseEther('0.002'), 'Tip Post 2 (0.002 BOT)'));
  summary.wallet1.push(await execTx(client1, 'tip', [3n], parseEther('0.002'), 'Tip Post 3 (0.002 BOT)'));
  summary.wallet1.push(await execTx(client1, 'dislike', [2n], 0n, 'Switch Post 2 to dislike'));
  summary.wallet1.push(await execTx(client1, 'removeVote', [3n], 0n, 'Remove vote on Post 3'));
  summary.wallet1.push(await execTx(client1, 'like', [3n], 0n, 'Re-like Post 3'));

  console.log('=== Step 3: Wallet 2 remaining 7 transactions (txs 2..8) ===');
  // Wallet 2 interactions (cannot tip Post 2)
  summary.wallet2.push(await execTx(client2, 'like', [1n], 0n, 'Like Post 1'));
  summary.wallet2.push(await execTx(client2, 'dislike', [3n], 0n, 'Dislike Post 3'));
  summary.wallet2.push(await execTx(client2, 'tip', [1n], parseEther('0.002'), 'Tip Post 1 (0.002 BOT)'));
  summary.wallet2.push(await execTx(client2, 'tip', [3n], parseEther('0.002'), 'Tip Post 3 (0.002 BOT)'));
  summary.wallet2.push(await execTx(client2, 'removeVote', [1n], 0n, 'Remove vote on Post 1'));
  summary.wallet2.push(await execTx(client2, 'like', [1n], 0n, 'Re-like Post 1'));
  summary.wallet2.push(await execTx(client2, 'like', [3n], 0n, 'Switch Post 3 to like'));

  console.log('=== Step 4: Wallet 3 remaining 7 transactions (txs 2..8) ===');
  // Wallet 3 interactions (cannot tip Post 3)
  summary.wallet3.push(await execTx(client3, 'like', [1n], 0n, 'Like Post 1'));
  summary.wallet3.push(await execTx(client3, 'like', [2n], 0n, 'Like Post 2'));
  summary.wallet3.push(await execTx(client3, 'tip', [1n], parseEther('0.002'), 'Tip Post 1 (0.002 BOT)'));
  summary.wallet3.push(await execTx(client3, 'tip', [2n], parseEther('0.002'), 'Tip Post 2 (0.002 BOT)'));
  summary.wallet3.push(await execTx(client3, 'dislike', [1n], 0n, 'Switch Post 1 to dislike'));
  summary.wallet3.push(await execTx(client3, 'removeVote', [2n], 0n, 'Remove vote on Post 2'));
  summary.wallet3.push(await execTx(client3, 'like', [2n], 0n, 'Re-like Post 2'));

  console.log('=== All 24 transactions executed successfully! ===');
  fs.writeFileSync('mainnet_transactions_summary.json', JSON.stringify(summary, null, 2));
  console.log('Saved summary to mainnet_transactions_summary.json');
}

main().catch(err => {
  console.error('Fatal error during execution:', err);
  process.exit(1);
});
