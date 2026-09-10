import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { create } from 'zustand';
import { isNative } from './platform';
import { flushNativeStorage } from './storage';
import { useAppStore } from '@/stores/appStore';
import { productById } from '@/domain/catalog';
import { buyWithLeaves } from '@/domain/market';

export const LEAF_PACKS = [
  { id: 'com.reminduh.leaves.100', leaves: 100, name: 'A handful' },
  { id: 'com.reminduh.leaves.350', leaves: 350, name: 'A little basket' },
  { id: 'com.reminduh.leaves.800', leaves: 800, name: 'A leafy bundle' },
] as const;
export interface PaidOrder {
  id: string;
  productId: string;
  paidLeaves: number;
  earnedLeaves: number;
}
interface Wallet {
  balance: number;
  pending?: PaidOrder;
}
export interface LeafPack {
  id: string;
  leaves: number;
  price: string;
}
interface LeafPlugin {
  getWallet(): Promise<Wallet>;
  getProducts(): Promise<{ products: LeafPack[] }>;
  purchase(options: {
    productId: string;
  }): Promise<{ status: 'purchased' | 'pending' | 'cancelled'; wallet?: Wallet }>;
  reserveSpend(options: {
    productId: string;
    orderId: string;
    earnedLeaves: number;
  }): Promise<Wallet>;
  cancelSpend(options: { orderId: string }): Promise<Wallet>;
  finishSpend(options: { orderId: string }): Promise<Wallet>;
  addListener(name: 'walletChanged', fn: (wallet: Wallet) => void): Promise<PluginListenerHandle>;
  addListener(
    name: 'walletError',
    fn: (data: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
}
const LeafStore = registerPlugin<LeafPlugin>('LeafStore');
export const useLeafWallet = create<{
  balance: number;
  loading: boolean;
  error: string;
  pending: boolean;
}>(() => ({ balance: 0, loading: isNative, error: '', pending: false }));
const accept = (wallet: Wallet) => {
  if (!Number.isSafeInteger(wallet.balance) || wallet.balance < 0)
    throw new Error('Your leaf wallet couldn’t be read. Please try again.');
  useLeafWallet.setState({
    balance: wallet.balance,
    loading: false,
    pending: !!wallet.pending,
    error: '',
  });
};
let recovering: Promise<void> | null = null;
async function recover(wallet: Wallet) {
  accept(wallet);
  if (!wallet.pending) return;
  if (recovering) return recovering;
  recovering = (async () => {
    const result = useAppStore.getState().completePaidOrder(wallet.pending!);
    if (!result.ok) {
      // A failed local commit grants nothing. Return the reserved paid leaves.
      accept(await LeafStore.cancelSpend({ orderId: wallet.pending!.id }));
      throw new Error(result.error);
    }
    await flushNativeStorage();
    accept(await LeafStore.finishSpend({ orderId: wallet.pending!.id }));
  })();
  try {
    await recovering;
  } finally {
    recovering = null;
  }
}
export async function refreshLeafWallet() {
  if (!isNative) return;
  try {
    await recover(await LeafStore.getWallet());
  } catch (error) {
    useLeafWallet.setState({
      loading: false,
      error: error instanceof Error ? error.message : 'Your leaf wallet couldn’t be loaded.',
    });
  }
}
export async function watchLeafWallet() {
  if (!isNative) return () => {};
  await refreshLeafWallet();
  const changed = await LeafStore.addListener('walletChanged', (wallet) => {
    void recover(wallet).catch(() =>
      useLeafWallet.setState({
        error: 'Your shop item is waiting to finish. Open Leaves to retry.',
      }),
    );
  });
  const failed = await LeafStore.addListener('walletError', ({ message }) =>
    useLeafWallet.setState({ error: message }),
  );
  return () => {
    void changed.remove();
    void failed.remove();
  };
}
export async function loadLeafPacks() {
  if (!isNative) return [];
  const { products } = await LeafStore.getProducts();
  return products.filter(
    (product) =>
      LEAF_PACKS.some((p) => p.id === product.id && p.leaves === product.leaves) &&
      typeof product.price === 'string',
  );
}
export async function purchaseLeafPack(id: string) {
  if (!isNative) throw new Error('Leaf purchases will be available in the iPhone app.');
  if (!LEAF_PACKS.some((pack) => pack.id === id)) throw new Error('Choose a leaf pack.');
  const result = await LeafStore.purchase({ productId: id });
  if (result.wallet) await recover(result.wallet);
  return result.status;
}
let spending = false;
export async function purchaseShopItem(productId: string, orderId: string) {
  if (spending) return { ok: false, error: 'A shop purchase is already finishing.' };
  const product = productById(productId);
  if (!product) return { ok: false, error: 'Choose an item from the shop.' };
  spending = true;
  try {
    const data = useAppStore.getState().data;
    if (data.market.coins >= product.price || !isNative)
      return product.kind === 'room'
        ? useAppStore.getState().buyRoomProduct(productId, orderId)
        : useAppStore.getState().buyProduct(productId, orderId);
    await refreshLeafWallet();
    if (useLeafWallet.getState().error || useLeafWallet.getState().pending)
      throw new Error(
        useLeafWallet.getState().error || 'Your previous shop item is still finishing.',
      );
    const current = useAppStore.getState().data;
    if (current.market.coins >= product.price)
      return product.kind === 'room'
        ? useAppStore.getState().buyRoomProduct(productId, orderId)
        : useAppStore.getState().buyProduct(productId, orderId);
    // Check ownership, inventory limits and order IDs before reserving paid currency.
    buyWithLeaves(
      { ...current, market: { ...current.market, coins: product.price } },
      productId,
      orderId,
    );
    const wallet = await LeafStore.reserveSpend({
      productId,
      orderId,
      earnedLeaves: current.market.coins,
    });
    await recover(wallet);
    useAppStore
      .getState()
      .showToast(
        product.name +
          (product.kind === 'room' ? ' is in your room.' : ' added to your collection.'),
      );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Your purchase is waiting to finish. Open Leaves to retry.',
    };
  } finally {
    spending = false;
  }
}
export function useLeafBalance() {
  const earned = useAppStore((s) => s.data.market.coins);
  const bought = useLeafWallet((s) => s.balance);
  return earned + bought;
}
