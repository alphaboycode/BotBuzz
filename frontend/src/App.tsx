import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseEther,
} from 'viem';
import { contractAddress, botBuzzAbi, botTestnet } from './contracts';
import { Post, SortMode, ActiveTab, TxStatus } from './types';
import { shortenAddress, formatRelativeTime, formatBOT } from './utils';
import appLogo from './assets/logo.jpeg';
import './App.css';

const publicClient = createPublicClient({
  chain: botTestnet,
  transport: http('https://rpc.bohr.life'),
});

export const App: React.FC = () => {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('news');

  // Wallet state
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // Data state
  const [posts, setPosts] = useState<Post[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);

  // Tipping UI state per post: postId -> open state & amount string
  const [activeTipPostId, setActiveTipPostId] = useState<bigint | null>(null);
  const [tipAmount, setTipAmount] = useState<string>('0.1');

  // Filter & sorting
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // Transaction state
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: 'idle' });

  const isCorrectChain = chainId === botTestnet.id;

  // Initialize wallet if already connected without popping modal
  const checkConnection = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    try {
      const accounts: string[] = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0] as `0x${string}`);
      } else {
        setAccount(null);
      }

      const currentChainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      setChainId(parseInt(currentChainIdHex, 16));
    } catch (err) {
      console.error('Error checking wallet connection:', err);
    }
  }, []);

  useEffect(() => {
    checkConnection();

    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0] as `0x${string}`);
        } else {
          setAccount(null);
        }
      };

      const handleChainChanged = (hexChainId: string) => {
        setChainId(parseInt(hexChainId, 16));
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [checkConnection]);

  // Add / Switch network action
  const switchToBotTestnet = async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x3c8' }], // 968 in hex
      });
      setChainId(968);
    } catch (switchError: any) {
      // 4902 means the chain has not been added to MetaMask
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x3c8',
                chainName: 'BOT Testnet',
                nativeCurrency: {
                  name: 'BOT',
                  symbol: 'BOT',
                  decimals: 18,
                },
                rpcUrls: ['https://rpc.bohr.life'],
                blockExplorerUrls: ['https://scan.bohr.life'],
              },
            ],
          });
          setChainId(968);
        } catch (addError) {
          console.error('Failed to add BOT Testnet:', addError);
        }
      } else {
        console.error('Failed to switch network:', switchError);
      }
    }
  };

  // Helper to reliably get an authorized wallet client and active account
  const getAuthorizedWalletClient = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('Please install MetaMask or another Web3 wallet.');
    }

    // Always explicitly request/confirm account authorization
    const accounts: string[] = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    if (!accounts || accounts.length === 0) {
      throw new Error('No authorized account found. Please select an account in your wallet.');
    }

    const activeAccount = accounts[0] as `0x${string}`;
    setAccount(activeAccount);

    // Verify chain ID
    const currentChainHex = await window.ethereum.request({ method: 'eth_chainId' });
    const currentChain = parseInt(currentChainHex, 16);
    setChainId(currentChain);

    if (currentChain !== botTestnet.id) {
      await switchToBotTestnet();
    }

    const client = createWalletClient({
      account: activeAccount,
      chain: botTestnet,
      transport: custom(window.ethereum),
    });

    return { client, account: activeAccount };
  };

  // Connect wallet action
  const connectWallet = async () => {
    try {
      const { account: activeAccount } = await getAuthorizedWalletClient();
      setAccount(activeAccount);
      setTxStatus({ state: 'idle' });
    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      setTxStatus({
        state: 'error',
        message: err?.shortMessage || err?.message || 'Failed to connect wallet.',
      });
    }
  };

  // Fetch posts from contract
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const totalPosts = await publicClient.readContract({
        address: contractAddress,
        abi: botBuzzAbi,
        functionName: 'postCount',
      });

      if (totalPosts === 0n) {
        setPosts([]);
        setUserVotes({});
        setLoading(false);
        return;
      }

      // Fetch all posts (getPosts returns newest first)
      const rawPosts = await publicClient.readContract({
        address: contractAddress,
        abi: botBuzzAbi,
        functionName: 'getPosts',
        args: [0n, totalPosts],
      });

      const formattedPosts: Post[] = rawPosts.map((p) => ({
        id: p.id,
        author: p.author,
        title: p.title,
        description: p.description,
        createdAt: p.createdAt,
        likes: p.likes,
        dislikes: p.dislikes,
        totalTips: p.totalTips,
      }));

      setPosts(formattedPosts);

      // Fetch user votes if wallet connected
      if (account) {
        const votesEntries = await Promise.all(
          formattedPosts.map(async (p) => {
            const vote = await publicClient.readContract({
              address: contractAddress,
              abi: botBuzzAbi,
              functionName: 'getVote',
              args: [p.id, account],
            });
            return [p.id.toString(), vote] as const;
          })
        );
        setUserVotes(Object.fromEntries(votesEntries));
      } else {
        setUserVotes({});
      }
    } catch (err: any) {
      console.error('Error fetching posts:', err);
      setFetchError(err?.shortMessage || err?.message || 'Failed to load posts from chain.');
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Handle post creation
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();

    if (!trimmedTitle || trimmedTitle.length > 100) return;
    if (!trimmedDesc || trimmedDesc.length > 500) return;

    setSubmittingPost(true);
    setTxStatus({ state: 'pending', message: 'Authorizing wallet and preparing transaction...' });

    try {
      const { client, account: activeAccount } = await getAuthorizedWalletClient();

      setTxStatus({ state: 'pending', message: 'Submitting news post to BOT Testnet...' });

      const hash = await client.writeContract({
        address: contractAddress,
        abi: botBuzzAbi,
        functionName: 'createPost',
        args: [trimmedTitle, trimmedDesc],
        account: activeAccount,
        chain: botTestnet,
      });

      setTxStatus({
        state: 'pending',
        message: 'Transaction broadcasted. Awaiting block confirmation...',
        hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      setTxStatus({
        state: 'success',
        message: 'News item published successfully onchain!',
        hash,
      });

      setTitle('');
      setDescription('');
      setActiveTab('news'); // Switch back to feed to see newly created post
      await fetchPosts();
    } catch (err: any) {
      console.error('Create post failed:', err);
      setTxStatus({
        state: 'error',
        message: err?.shortMessage || err?.message || 'Failed to publish post.',
      });
    } finally {
      setSubmittingPost(false);
    }
  };

  // Handle voting (like / dislike / toggle remove)
  const handleVote = async (postId: bigint, voteType: 1 | -1) => {
    const currentVote = userVotes[postId.toString()] || 0;
    const isRemoving = currentVote === voteType;
    const actionLabel = isRemoving
      ? 'Removing vote...'
      : voteType === 1
      ? 'Liking post...'
      : 'Disliking post...';

    setTxStatus({ state: 'pending', message: actionLabel });

    try {
      const { client, account: activeAccount } = await getAuthorizedWalletClient();

      let hash: `0x${string}`;
      if (isRemoving) {
        hash = await client.writeContract({
          address: contractAddress,
          abi: botBuzzAbi,
          functionName: 'removeVote',
          args: [postId],
          account: activeAccount,
          chain: botTestnet,
        });
      } else if (voteType === 1) {
        hash = await client.writeContract({
          address: contractAddress,
          abi: botBuzzAbi,
          functionName: 'like',
          args: [postId],
          account: activeAccount,
          chain: botTestnet,
        });
      } else {
        hash = await client.writeContract({
          address: contractAddress,
          abi: botBuzzAbi,
          functionName: 'dislike',
          args: [postId],
          account: activeAccount,
          chain: botTestnet,
        });
      }

      setTxStatus({
        state: 'pending',
        message: 'Vote submitted. Confirming onchain...',
        hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      setTxStatus({
        state: 'success',
        message: 'Vote recorded!',
        hash,
      });

      await fetchPosts();
    } catch (err: any) {
      console.error('Vote failed:', err);
      setTxStatus({
        state: 'error',
        message: err?.shortMessage || err?.message || 'Vote transaction failed.',
      });
    }
  };

  // Handle Tipping
  const handleTip = async (postId: bigint) => {
    const val = parseFloat(tipAmount);
    if (isNaN(val) || val <= 0) {
      alert('Please enter a valid BOT tip amount greater than 0.');
      return;
    }

    setTxStatus({ state: 'pending', message: `Sending ${tipAmount} BOT tip to author...` });

    try {
      const { client, account: activeAccount } = await getAuthorizedWalletClient();

      const hash = await client.writeContract({
        address: contractAddress,
        abi: botBuzzAbi,
        functionName: 'tip',
        args: [postId],
        value: parseEther(tipAmount),
        account: activeAccount,
        chain: botTestnet,
      });

      setTxStatus({
        state: 'pending',
        message: 'Tip transaction broadcasted. Awaiting confirmation...',
        hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      setTxStatus({
        state: 'success',
        message: `Successfully tipped ${tipAmount} BOT!`,
        hash,
      });

      setActiveTipPostId(null);
      await fetchPosts();
    } catch (err: any) {
      console.error('Tip failed:', err);
      setTxStatus({
        state: 'error',
        message: err?.shortMessage || err?.message || 'Tip failed.',
      });
    }
  };

  // Sorted posts view
  const sortedPosts = useMemo(() => {
    const list = [...posts];
    if (sortMode === 'newest') {
      return list.sort((a, b) => Number(b.id - a.id));
    }
    if (sortMode === 'top') {
      return list.sort((a, b) => {
        const scoreA = Number(a.likes - a.dislikes);
        const scoreB = Number(b.likes - b.dislikes);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return Number(b.id - a.id);
      });
    }
    if (sortMode === 'tipped') {
      return list.sort((a, b) => {
        if (b.totalTips !== a.totalTips) {
          return b.totalTips > a.totalTips ? 1 : -1;
        }
        return Number(b.id - a.id);
      });
    }
    return list;
  }, [posts, sortMode]);

  const isFormValid =
    title.trim().length >= 1 &&
    title.length <= 100 &&
    description.trim().length >= 1 &&
    description.length <= 500;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand" onClick={() => setActiveTab('news')} style={{ cursor: 'pointer' }}>
          <img src={appLogo} alt="BotBuzz" className="app-logo" />
          <h1 className="brand-title">BotBuzz</h1>
          <span className="network-pill">BOT Testnet (968)</span>
        </div>

        <div className="header-actions">
          {account ? (
            <div className="account-controls">
              {!isCorrectChain ? (
                <button className="btn btn-warning" onClick={switchToBotTestnet}>
                  ⚠️ Switch to BOT Testnet
                </button>
              ) : (
                <span className="chain-status-badge">● Connected</span>
              )}
              <span className="account-address" title={account}>
                {shortenAddress(account)}
              </span>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Network warning banner */}
      {account && !isCorrectChain && (
        <div className="network-banner">
          <span>Your wallet is not connected to BOT Testnet (Chain ID 968).</span>
          <button className="btn btn-sm btn-warning" onClick={switchToBotTestnet}>
            Switch Network
          </button>
        </div>
      )}

      {/* Transaction status toast */}
      {txStatus.state !== 'idle' && (
        <div className={`tx-banner tx-${txStatus.state}`}>
          <div className="tx-content">
            {txStatus.state === 'pending' && <span className="spinner">⏳</span>}
            {txStatus.state === 'success' && <span>✅</span>}
            {txStatus.state === 'error' && <span>❌</span>}
            <span className="tx-message">{txStatus.message}</span>
            {txStatus.hash && (
              <a
                href={`https://scan.bohr.life/tx/${txStatus.hash}`}
                target="_blank"
                rel="noreferrer"
                className="tx-link"
              >
                View on Explorer ↗
              </a>
            )}
          </div>
          <button
            className="tx-close"
            onClick={() => setTxStatus({ state: 'idle' })}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Tab Navigation */}
      <nav className="nav-tabs-container">
        <div className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'news' ? 'active' : ''}`}
            onClick={() => setActiveTab('news')}
          >
            📰 All News <span className="tab-badge">{posts.length}</span>
          </button>
          <button
            className={`nav-tab ${activeTab === 'post' ? 'active' : ''}`}
            onClick={() => setActiveTab('post')}
          >
            ✍️ Post News
          </button>
        </div>
      </nav>

      <main className="main-content">
        {/* TAB 1: ALL NEWS FEED */}
        {activeTab === 'news' && (
          <section className="feed-section">
            <div className="feed-header">
              <div className="feed-header-left">
                <h2 className="section-title">
                  All News <span className="feed-count">({posts.length})</span>
                </h2>
              </div>

              <div className="feed-header-right">
                {/* Sort Toggle */}
                <div className="sort-bar">
                  <span className="sort-label">Sort:</span>
                  <button
                    className={`sort-tab ${sortMode === 'newest' ? 'active' : ''}`}
                    onClick={() => setSortMode('newest')}
                  >
                    Newest
                  </button>
                  <button
                    className={`sort-tab ${sortMode === 'top' ? 'active' : ''}`}
                    onClick={() => setSortMode('top')}
                  >
                    Top
                  </button>
                  <button
                    className={`sort-tab ${sortMode === 'tipped' ? 'active' : ''}`}
                    onClick={() => setSortMode('tipped')}
                  >
                    Most Tipped
                  </button>
                </div>

                <button className="btn btn-sm btn-primary" onClick={() => setActiveTab('post')}>
                  + Post News
                </button>
              </div>
            </div>

            {/* Loading, Error & Empty States */}
            {loading && (
              <div className="state-card loading-state">
                <div className="spinner-large">⏳</div>
                <p>Fetching onchain news from BOT Testnet...</p>
              </div>
            )}

            {fetchError && !loading && (
              <div className="state-card error-state">
                <p>⚠️ {fetchError}</p>
                <button className="btn btn-sm btn-secondary" onClick={fetchPosts}>
                  Retry
                </button>
              </div>
            )}

            {!loading && !fetchError && sortedPosts.length === 0 && (
              <div className="state-card empty-state">
                <span className="empty-icon">📰</span>
                <h3>No news posted yet</h3>
                <p>Be the first to publish a news story to the BOT chain!</p>
                <button className="btn btn-primary" onClick={() => setActiveTab('post')}>
                  Write First Post
                </button>
              </div>
            )}

            {/* Post Cards */}
            {!loading && !fetchError && sortedPosts.length > 0 && (
              <div className="posts-list">
                {sortedPosts.map((post) => {
                  const postIdStr = post.id.toString();
                  const myVote = userVotes[postIdStr] || 0;
                  const isAuthor =
                    account && account.toLowerCase() === post.author.toLowerCase();
                  const score = Number(post.likes - post.dislikes);
                  const isTipOpen = activeTipPostId === post.id;

                  return (
                    <article key={postIdStr} className="card post-card">
                      {/* Header: Author & Time */}
                      <div className="post-header">
                        <div className="author-info">
                          <span className="author-avatar">🤖</span>
                          <span className="author-address" title={post.author}>
                            {shortenAddress(post.author)}
                          </span>
                          {isAuthor && <span className="you-badge">You</span>}
                        </div>
                        <time
                          className="post-time"
                          title={new Date(Number(post.createdAt) * 1000).toLocaleString()}
                        >
                          {formatRelativeTime(post.createdAt)}
                        </time>
                      </div>

                      {/* Content: Title & Description strictly rendered as plain text */}
                      <h3 className="post-title">{post.title}</h3>
                      <p className="post-description">{post.description}</p>

                      {/* Stats & Actions Row */}
                      <div className="post-footer">
                        {/* Vote buttons */}
                        <div className="vote-actions">
                          <button
                            className={`btn-vote btn-like ${myVote === 1 ? 'voted' : ''}`}
                            onClick={() => handleVote(post.id, 1)}
                            title={myVote === 1 ? 'Click to remove like' : 'Like'}
                          >
                            👍 <span className="count">{post.likes.toString()}</span>
                          </button>

                          <button
                            className={`btn-vote btn-dislike ${myVote === -1 ? 'voted' : ''}`}
                            onClick={() => handleVote(post.id, -1)}
                            title={myVote === -1 ? 'Click to remove dislike' : 'Dislike'}
                          >
                            👎 <span className="count">{post.dislikes.toString()}</span>
                          </button>

                          <span
                            className={`score-badge ${
                              score > 0 ? 'score-pos' : score < 0 ? 'score-neg' : ''
                            }`}
                          >
                            Score: {score > 0 ? `+${score}` : score}
                          </span>
                        </div>

                        {/* Tips info and Tip button */}
                        <div className="tip-actions">
                          <span className="tips-display" title={`${post.totalTips.toString()} wei`}>
                            💰 {formatBOT(post.totalTips)} BOT
                          </span>

                          <button
                            className="btn btn-sm btn-tip"
                            disabled={!!isAuthor}
                            title={isAuthor ? "You can't tip your own post" : 'Tip the author in BOT'}
                            onClick={() => {
                              if (isTipOpen) {
                                setActiveTipPostId(null);
                              } else {
                                setActiveTipPostId(post.id);
                                setTipAmount('0.1');
                              }
                            }}
                          >
                            {isTipOpen ? 'Cancel' : 'Tip Author'}
                          </button>
                        </div>
                      </div>

                      {/* Tip Input Popout */}
                      {isTipOpen && (
                        <div className="tip-input-row">
                          <div className="tip-input-group">
                            <label htmlFor={`tip-${postIdStr}`}>Tip (BOT):</label>
                            <input
                              id={`tip-${postIdStr}`}
                              type="number"
                              step="0.01"
                              min="0.0001"
                              className="input-tip"
                              value={tipAmount}
                              onChange={(e) => setTipAmount(e.target.value)}
                            />
                          </div>
                          <div className="tip-presets">
                            {['0.05', '0.1', '0.5', '1'].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                className="btn-preset"
                                onClick={() => setTipAmount(preset)}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleTip(post.id)}
                          >
                            Send Tip
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: POST NEWS FORM */}
        {activeTab === 'post' && (
          <section className="card post-form-card">
            <h2 className="section-title">Post News</h2>
            <p className="section-subtitle">
              Publish onchain news directly to the BOT blockchain. No middleman, plain string storage.
            </p>

            <form onSubmit={handleCreatePost} className="post-form">
              <div className="form-group">
                <div className="form-label-row">
                  <label htmlFor="post-title">Title</label>
                  <span
                    className={`char-counter ${title.length > 100 ? 'counter-overflow' : ''}`}
                  >
                    {title.length} / 100
                  </span>
                </div>
                <input
                  id="post-title"
                  type="text"
                  className="input-text"
                  placeholder="Brief, catchy headline..."
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={submittingPost}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label htmlFor="post-desc">Description</label>
                  <span
                    className={`char-counter ${
                      description.length > 500 ? 'counter-overflow' : ''
                    }`}
                  >
                    {description.length} / 500
                  </span>
                </div>
                <textarea
                  id="post-desc"
                  className="textarea-input"
                  placeholder="Detailed summary or report of the news item..."
                  rows={5}
                  value={description}
                  maxLength={500}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submittingPost}
                />
              </div>

              <div className="form-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveTab('news')}
                  disabled={submittingPost}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!isFormValid || submittingPost}
                >
                  {submittingPost ? 'Publishing...' : 'Publish News'}
                </button>
              </div>
            </form>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          BotBuzz on <a href="https://scan.bohr.life/" target="_blank" rel="noreferrer">BOT Testnet (Chain ID 968)</a>
        </p>
        <p className="contract-address-info">
          Contract:{' '}
          <a
            href={`https://scan.bohr.life/address/${contractAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            {contractAddress}
          </a>
        </p>
      </footer>
    </div>
  );
};

export default App;
