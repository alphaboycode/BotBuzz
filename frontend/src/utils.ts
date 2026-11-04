import { formatEther } from 'viem';

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatRelativeTime(timestampSec: bigint | number): string {
  const now = Math.floor(Date.now() / 1000);
  const ts = typeof timestampSec === 'bigint' ? Number(timestampSec) : timestampSec;
  const diff = now - ts;

  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function formatBOT(amountWei: bigint): string {
  const str = formatEther(amountWei);
  const num = parseFloat(str);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}
