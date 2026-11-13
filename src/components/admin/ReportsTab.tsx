'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Download,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatInr } from '@/lib/format';
import { Button, Card, Skeleton } from '@/components/ui';

interface ReportsData {
  range: string;
  startDate: string;
  endDate: string;
  summary: {
    totalSpendPaise: number;
    totalSpendRupees: number;
    totalSalesPaise: number;
    totalSalesRupees: number;
    estimatedGrossProfitPaise: number;
    estimatedGrossProfitRupees: number;
    grossProfitLabel: string;
    purchaseCount: number;
    paidOrderCount: number;
  };
  topIngredients: {
    ingredientId: number;
    name: string;
    totalSpendPaise: number;
    totalSpendRupees: number;
    purchaseCount: number;
  }[];
  timeline: {
    date: string;
    spendPaise: number;
    salesPaise: number;
    spendRupees: number;
    salesRupees: number;
    estimatedProfitRupees: number;
  }[];
  monthlyTable: {
    date: string;
    spendRupees: number;
    salesRupees: number;
    netRupees: number;
  }[];
}

export function ReportsTab({ showToast }: { showToast: (msg: string) => void }) {
  const [range, setRange] = useState<'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom'>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/api/inventory/reports?range=${range}`;
      if (range === 'custom' && customStart && customEnd) {
        url += `&startDate=${encodeURIComponent(customStart)}&endDate=${encodeURIComponent(customEnd)}`;
      }
      const res = await apiFetch<ReportsData>(url);
      setData(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadReports();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadReports]);

  const handleExportCsv = () => {
    const url = `/api/inventory/reports/export?range=${range}`;
    window.open(url, '_blank');
  };

  const ranges = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4 rounded-[20px] shadow-sm border border-leaf/10">
        <div className="flex flex-wrap items-center gap-1.5">
          {ranges.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id as typeof range)}
              className={`min-h-[40px] px-3.5 rounded-full text-[13px] font-bold transition ${
                range === r.id
                  ? 'bg-sun text-ink shadow-sm'
                  : 'bg-mint-bg text-leaf hover:bg-mint'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="min-h-[40px] px-3 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[13px] font-bold"
            />
            <span className="text-muted text-[13px]">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="min-h-[40px] px-3 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[13px] font-bold"
            />
            <Button variant="sun" onClick={loadReports} className="min-h-[40px] px-3 text-[13px]">
              Apply
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="mint"
            onClick={loadReports}
            className="min-h-[40px] px-3 text-[13px]"
            aria-label="Refresh financial reports"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="leaf"
            onClick={handleExportCsv}
            className="min-h-[40px] px-4 text-[13px] inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-[20px]" />
          ))}
        </div>
      )}

      {/* METRIC CARDS */}
      {!loading && data && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Total Raw-Material Spend */}
            <Card className="p-5 border-l-4 border-l-tomato space-y-1">
              <span className="text-[12px] font-extrabold text-muted uppercase tracking-wider">
                Raw-Material Spend
              </span>
              <p className="text-[26px] font-extrabold text-ink">
                {formatInr(data.summary.totalSpendPaise)}
              </p>
              <p className="text-[12px] text-muted">
                {data.summary.purchaseCount} purchase order(s)
              </p>
            </Card>

            {/* 2. Total Sales from Captured Payments */}
            <Card className="p-5 border-l-4 border-l-leaf space-y-1">
              <span className="text-[12px] font-extrabold text-muted uppercase tracking-wider">
                Total Sales (Paid Orders)
              </span>
              <p className="text-[26px] font-extrabold text-leaf">
                {formatInr(data.summary.totalSalesPaise)}
              </p>
              <p className="text-[12px] text-muted">
                {data.summary.paidOrderCount} settled payment(s)
              </p>
            </Card>

            {/* 3. Estimated Gross Profit */}
            <Card className="p-5 border-l-4 border-l-sun space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-muted uppercase tracking-wider">
                  Estimated Gross Profit
                </span>
                {data.summary.estimatedGrossProfitPaise >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-leaf" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-tomato" />
                )}
              </div>
              <p
                className={`text-[26px] font-extrabold ${
                  data.summary.estimatedGrossProfitPaise >= 0 ? 'text-ink' : 'text-tomato'
                }`}
              >
                {formatInr(data.summary.estimatedGrossProfitPaise)}
              </p>
              <p className="text-[11px] text-muted font-bold">
                Sales minus raw-material spend (estimate)
              </p>
            </Card>

            {/* 4. Number of Purchases */}
            <Card className="p-5 border-l-4 border-l-leaf-mid space-y-1">
              <span className="text-[12px] font-extrabold text-muted uppercase tracking-wider">
                Material Purchases
              </span>
              <p className="text-[26px] font-extrabold text-ink">
                {data.summary.purchaseCount}
              </p>
              <p className="text-[12px] text-muted">Stock replenishment transactions</p>
            </Card>
          </div>

          {/* CHARTS SECTION */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Chart 1: Spend vs Sales Over Time */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-extrabold text-ink">
                  Sales vs. Raw-Material Spend Over Time
                </h3>
                <span className="text-[12px] text-muted font-bold">In Rupees (₹)</span>
              </div>
              <div className="h-64 w-full">
                {data.timeline.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted text-[13px]">
                    No spend or sales data recorded in this range.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.timeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4F6D2" />
                      <XAxis dataKey="date" stroke="#5C6B52" fontSize={12} />
                      <YAxis stroke="#5C6B52" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFBE6',
                          borderRadius: '12px',
                          border: '1px solid #1F6B3A',
                          fontWeight: 700,
                        }}
                      />
                      <Legend wrapperStyle={{ fontWeight: 700 }} />
                      <Line
                        type="monotone"
                        dataKey="salesRupees"
                        name="Sales (₹)"
                        stroke="#1F6B3A"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="spendRupees"
                        name="Spend (₹)"
                        stroke="#C73A25"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Chart 2: Top 10 Ingredients by Spend */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-extrabold text-ink">
                  Top Ingredients by Material Spend
                </h3>
                <span className="text-[12px] text-muted font-bold">Top 10 items</span>
              </div>
              <div className="h-64 w-full">
                {data.topIngredients.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted text-[13px]">
                    No ingredient purchases found in this range.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.topIngredients}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4F6D2" />
                      <XAxis type="number" stroke="#5C6B52" fontSize={12} />
                      <YAxis dataKey="name" type="category" stroke="#5C6B52" fontSize={11} width={80} />
                      <Tooltip
                        formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                        contentStyle={{
                          backgroundColor: '#FFFBE6',
                          borderRadius: '12px',
                          border: '1px solid #1F6B3A',
                          fontWeight: 700,
                        }}
                      />
                      <Bar dataKey="totalSpendRupees" name="Spend (₹)" fill="#FFD93D" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* MONTHLY SUMMARY TABLE */}
          <Card className="p-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-extrabold text-ink">Daily Breakdown & Summary Table</h3>
                <p className="text-[12px] text-muted font-bold">
                  Day-by-day raw-material spend vs captured guest sales
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-mint-bg text-leaf text-[12px] font-extrabold">
                {data.monthlyTable.length} active day(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-leaf/10 text-muted font-extrabold uppercase text-[11px] tracking-wider">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Spend (₹)</th>
                    <th className="py-2.5 px-3 text-right">Sales (₹)</th>
                    <th className="py-2.5 px-3 text-right">Gross Est. (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-leaf/5 font-bold">
                  {data.monthlyTable.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted font-normal">
                        No financial activity recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    data.monthlyTable.map((row) => (
                      <tr key={row.date} className="hover:bg-cream/50 transition">
                        <td className="py-2.5 px-3 font-extrabold text-ink">{row.date}</td>
                        <td className="py-2.5 px-3 text-right text-tomato">
                          {row.spendRupees > 0 ? `₹${row.spendRupees.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-leaf">
                          {row.salesRupees > 0 ? `₹${row.salesRupees.toFixed(2)}` : '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right ${
                            row.netRupees >= 0 ? 'text-leaf' : 'text-tomato'
                          }`}
                        >
                          {row.netRupees >= 0 ? `+₹${row.netRupees.toFixed(2)}` : `-₹${Math.abs(row.netRupees).toFixed(2)}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-leaf/20 bg-cream font-extrabold text-ink text-[14px]">
                    <td className="py-3 px-3 uppercase tracking-wider">Total</td>
                    <td className="py-3 px-3 text-right text-tomato">
                      ₹{data.summary.totalSpendRupees.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right text-leaf">
                      ₹{data.summary.totalSalesRupees.toFixed(2)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right ${
                        data.summary.estimatedGrossProfitRupees >= 0 ? 'text-leaf' : 'text-tomato'
                      }`}
                    >
                      {data.summary.estimatedGrossProfitRupees >= 0
                        ? `+₹${data.summary.estimatedGrossProfitRupees.toFixed(2)}`
                        : `-₹${Math.abs(data.summary.estimatedGrossProfitRupees).toFixed(2)}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
