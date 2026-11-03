import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Search,
  TrendingUp,
  Warehouse,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  inr,
  LoadingRows,
  PageHeader,
  Panel,
  SearchBox,
  Select,
  shortDate,
  Stat,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { STATES } from "@/lib/locations";
import { WB_DISTRICTS } from "@/lib/roleFields";
import { getMandiPrices, mandiErrorMessage } from "@/lib/mandi";
import type { MandiPrice } from "@/lib/mandi";

/**
 * Mandi Prices — live APMC trade for the selected state, district and market.
 *
 * Rows show the minimum, maximum and modal price plus the arrival date, exactly
 * as the data.gov.in feed reports them. A "trend" arrow is only drawn when the
 * feed gives at least two arrival dates to compare; otherwise the column says
 * "single day".
 */

export default function MandiPage() {
  const { profile } = useAuth();
  const details = profile?.details ?? {};

  const [state, setState] = useState(details.state ?? "");
  const [district, setDistrict] = useState(details.district ?? "");
  const [market, setMarket] = useState("");
  const [commodity, setCommodity] = useState("");
  const [query, setQuery] = useState("");

  const [rows, setRows] = useState<MandiPrice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getMandiPrices({
        state: state || undefined,
        district: district || undefined,
        commodity: commodity || undefined,
        limit: 200,
      });
      setRows(result.records);
      setTotal(result.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(mandiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [state, district, commodity]);

  useEffect(() => {
    void load();
  }, [load]);

  const markets = useMemo(() => [...new Set(rows.map((r) => r.market).filter(Boolean))].sort(), [rows]);
  const commodities = useMemo(() => [...new Set(rows.map((r) => r.commodity).filter(Boolean))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (market && row.market !== market) return false;
      if (!q) return true;
      return `${row.commodity} ${row.market} ${row.district ?? ""} ${row.variety ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, market, query]);

  /** Average modal price across what is on screen — a real figure, or nothing. */
  const summary = useMemo(() => {
    const priced = visible.filter((r) => r.modal_price != null);
    if (priced.length === 0) return null;
    const avg = priced.reduce((sum, r) => sum + (r.modal_price ?? 0), 0) / priced.length;
    const best = priced.reduce((a, b) => ((a.modal_price ?? 0) > (b.modal_price ?? 0) ? a : b));
    const arrivals = [...new Set(priced.map((r) => r.arrival_date).filter(Boolean))].sort();
    return { avg, best, days: arrivals.length, arrivals };
  }, [visible]);

  /** Change vs the best earlier arrival, when there is one to compare. */
  function changeFor(row: MandiPrice): number | null {
    if (row.modal_price == null) return null;
    const earlier = rows
      .filter((r) => r.commodity === row.commodity && r.market === row.market && r.arrival_date && r.arrival_date < (row.arrival_date ?? ""))
      .sort((a, b) => (b.arrival_date ?? "").localeCompare(a.arrival_date ?? ""))[0];
    if (!earlier?.modal_price) return null;
    return ((row.modal_price - earlier.modal_price) / earlier.modal_price) * 100;
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={TrendingUp}
        title="Mandi Prices"
        description="Live wholesale prices from APMC mandis, as published by data.gov.in. Pick your state, district and mandi to compare what your produce is fetching."
        meta={
          <>
            <Chip tone="green" icon={MapPin}>
              {[district, state].filter(Boolean).join(", ") || "All India"}
            </Chip>
            <Chip tone="blue">Live feed</Chip>
            {summary && <Chip tone="slate">Arrival date {shortDate(summary.arrivals.at(-1))}</Chip>}
          </>
        }
        actions={
          <GhostButton onClick={() => void load()} disabled={loading}>
            Refresh
          </GhostButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Trades shown" value={visible.length} icon={TrendingUp} hint={`of ${total} available`} />
        <Stat
          label="Average modal price"
          value={summary ? `${inr(summary.avg)}` : "—"}
          icon={TrendingUp}
          tone="teal"
          hint="Per quintal, this selection"
        />
        <Stat
          label="Highest today"
          value={summary ? inr(summary.best.modal_price ?? null) : "—"}
          icon={ArrowUpRight}
          tone="green"
          hint={summary ? summary.best.commodity : "No data"}
        />
        <Stat
          label="Commodities"
          value={commodities.length}
          icon={Warehouse}
          tone="blue"
          hint={`Across ${markets.length} mandis`}
        />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <Panel flush>
        <div className="grid gap-2 border-b border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">State</span>
            <Select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setDistrict("");
                setMarket("");
              }}
            >
              <option value="">All states</option>
              {STATES.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">District</span>
            {state === "West Bengal" || !state ? (
              <Select
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setMarket("");
                }}
              >
                <option value="">All districts</option>
                {WB_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            ) : (
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="Type a district"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
              />
            )}
            {(state === "West Bengal" || !state) && (
              <button
                type="button"
                onClick={() => setDistrict("")}
                className="mt-1 text-[10px] font-semibold text-brand-700 hover:underline"
              >
                Type another district
              </button>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Mandi</span>
            <Select value={market} onChange={(e) => setMarket(e.target.value)} disabled={markets.length === 0}>
              <option value="">All mandis</option>
              {markets.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Commodity
            </span>
            <Select value={commodity} onChange={(e) => setCommodity(e.target.value)}>
              <option value="">All commodities</option>
              {commodities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder="Search commodity or mandi…" label="Search prices" />
          <span className="shrink-0 text-[11px] text-slate-500">
            {loading ? "Loading…" : `${visible.length} rows`}
          </span>
        </div>

        {loading ? (
          <LoadingRows rows={6} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No prices for this selection"
            body="Try a wider district, a different commodity, or clear the mandi filter. Prices are published only on trading days."
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Commodity</Th>
                  <Th>Mandi</Th>
                  <Th className="text-right">Min</Th>
                  <Th className="text-right">Max</Th>
                  <Th className="text-right">Modal</Th>
                  <Th className="text-right">Change</Th>
                  <Th>Arrival</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => {
                  const change = changeFor(row);
                  return (
                    <tr key={`${row.commodity}-${row.market}-${row.variety ?? ""}-${row.arrival_date ?? ""}-${i}`} className="hover:bg-slate-50">
                      <Td>
                        <span className="font-semibold text-forest">{row.commodity}</span>
                        {row.variety && <span className="ml-1 text-[10px] text-slate-500">({row.variety})</span>}
                      </Td>
                      <Td>
                        <span>{row.market}</span>
                        {row.district && <span className="block text-[10px] text-slate-500">{row.district}</span>}
                      </Td>
                      <Td className="text-right tabular-nums">{inr(row.min_price ?? null)}</Td>
                      <Td className="text-right tabular-nums">{inr(row.max_price ?? null)}</Td>
                      <Td className="text-right font-bold tabular-nums text-forest">{inr(row.modal_price ?? null)}</Td>
                      <Td className="text-right">
                        {change == null ? (
                          <span className="text-[10px] text-slate-400">single day</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
                              change >= 0 ? "text-emerald-700" : "text-rose-600"
                            }`}
                          >
                            {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(change).toFixed(1)}%
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-[11px]">{shortDate(row.arrival_date ?? null)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Sell on the marketplace", to: "/marketplace", text: "List your produce and reach buyers directly." },
          { label: "Store for a better price", to: "/storage", text: "Compare warehouse rates before you wait." },
          { label: "Plan a transport", to: "/transport", text: "Get quotes to move produce to the mandi." },
        ].map((item) => (
          <Link key={item.to} to={item.to} className="creator-card p-4 transition hover:border-brand-300 hover:shadow-card">
            <p className="flex items-center gap-1.5 text-xs font-bold text-forest">
              <CalendarDays className="h-3.5 w-3.5 text-brand-700" /> {item.label}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.text}</p>
          </Link>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <Search className="h-3 w-3" /> Source: data.gov.in — “Current Daily Price of Various Commodities from
        Various Markets (Mandi)”. Modal price is the most common traded price that day, per quintal.
      </p>
    </FarmerShell>
  );
}
