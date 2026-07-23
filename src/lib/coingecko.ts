const BASE_URL = "https://api.coingecko.com/api/v3";

const POPULAR_COINS: Array<{ id: string; symbol: string; name: string }> = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin" },
  { id: "ethereum", symbol: "eth", name: "Ethereum" },
  { id: "the-open-network", symbol: "ton", name: "Toncoin" },
  { id: "solana", symbol: "sol", name: "Solana" },
  { id: "binancecoin", symbol: "bnb", name: "BNB" },
  { id: "ripple", symbol: "xrp", name: "XRP" },
  { id: "cardano", symbol: "ada", name: "Cardano" },
  { id: "dogecoin", symbol: "doge", name: "Dogecoin" },
  { id: "polkadot", symbol: "dot", name: "Polkadot" },
  { id: "avalanche-2", symbol: "avax", name: "Avalanche" },
];

export function getPopularCoins() {
  return POPULAR_COINS;
}

export interface CoinPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap: number;
}

export async function fetchPrices(
  coinIds: string[],
  currency = "usd",
): Promise<Record<string, CoinPrice>> {
  if (coinIds.length === 0) return {};
  const ids = coinIds.join(",");
  const url = `${BASE_URL}/coins/markets?vs_currency=${currency}&ids=${ids}&order=market_cap_desc&per_page=${coinIds.length}&page=1&sparkline=false&price_change_percentage=24h`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }
  const data: Array<{
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    price_change_24h: number;
    price_change_percentage_24h: number;
    market_cap: number;
  }> = await res.json();
  const result: Record<string, CoinPrice> = {};
  for (const coin of data) {
    result[coin.id] = {
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      current_price: coin.current_price,
      price_change_24h: coin.price_change_24h,
      price_change_percentage_24h: coin.price_change_percentage_24h,
      market_cap: coin.market_cap,
    };
  }
  return result;
}

export async function searchCoin(
  query: string,
): Promise<Array<{ id: string; symbol: string; name: string }>> {
  const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko search error: ${res.status}`);
  const data: { coins: Array<{ id: string; symbol: string; name: string }> } = await res.json();
  return data.coins.slice(0, 10).map((c) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
  }));
}

export function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toPrecision(4)}`;
}

export function formatPercentChange(pct: number): string {
  const arrow = pct >= 0 ? "▲" : "▼";
  const sign = pct >= 0 ? "+" : "";
  return `${arrow} ${sign}${pct.toFixed(2)}%`;
}

export function formatPriceChange(oldPrice: number, newPrice: number): string {
  const change = newPrice - oldPrice;
  const pct = oldPrice > 0 ? (change / oldPrice) * 100 : 0;
  const arrow = change >= 0 ? "▲" : "▼";
  const sign = change >= 0 ? "+" : "";
  return `${arrow} ${sign}${pct.toFixed(2)}%`;
}
