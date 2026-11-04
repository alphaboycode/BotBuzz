export interface Post {
  id: bigint;
  author: string;
  title: string;
  description: string;
  createdAt: bigint;
  likes: bigint;
  dislikes: bigint;
  totalTips: bigint;
}

export type SortMode = 'newest' | 'top' | 'tipped';

export type ActiveTab = 'news' | 'post';

export interface TxStatus {
  state: 'idle' | 'pending' | 'success' | 'error';
  message?: string;
  hash?: `0x${string}`;
}
