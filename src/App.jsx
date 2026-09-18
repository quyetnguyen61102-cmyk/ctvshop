import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, X, Pencil, Trash2, Search, CreditCard, Package,
  Check, Loader2, UserPlus, Users, LayoutGrid, ChevronLeft, ChevronRight, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

/* ---------------------------------------------------------
   Tokens — a digital ledger, not a SaaS dashboard.
--------------------------------------------------------- */
const C = {
  paper: "#F7F7F1",
  paperRaised: "#FFFFFF",
  ink: "#1D2420",
  inkSoft: "#5B6158",
  inkFaint: "#8B9086",
  rule: "#DEDBCC",
  ruleSoft: "#EAE7D9",
  green: "#175A45",
  greenTint: "#E7F0E9",
  gold: "#A8710C",
  goldTint: "#FAF0DA",
  red: "#9A3E33",
  redTint: "#F5E8E4",
  blue: "#2B5876",
  blueTint: "#E7EEF3",
};

const API_URL = "/api/data";
const POLL_MS = 15000;

/* ---------------------------------------------------------
   Small API client
--------------------------------------------------------- */
async function apiFetch() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error("Fetch failed: " + res.status);
  return res.json();
}
async function apiSave(state) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error("Save failed: " + res.status);
}
async function apiReset() {
  const res = await fetch(API_URL, { method: "DELETE" });
  if (!res.ok) throw new Error("Reset failed: " + res.status);
}

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISO() {
  return toISODate(new Date());
}
function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
function fmtVND(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString("vi-VN") + "đ";
}
function fmtDateShort(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function mondayOf(iso) {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}
function weekKey(iso) { return mondayOf(iso); }
function weekLabel(mondayIso) {
  const sun = addDaysISO(mondayIso, 6);
  return `${fmtDateShort(mondayIso).slice(0, 5)}–${fmtDateShort(sun).slice(0, 5)}`;
}
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(mk) { const [y, m] = mk.split("-"); return `T${Number(m)}/${y}`; }
function monthLabelFull(mk) { const [y, m] = mk.split("-"); return `Tháng ${Number(m)}/${y}`; }
function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(todayISO() + "T00:00:00");
  const target = new Date(iso + "T00:00:00");
  return Math.round((target - today) / 86400000);
}
function currentPeriod(mode) { return mode === "week" ? weekKey(todayISO()) : monthKey(todayISO()); }
function shiftPeriod(anchor, mode, delta) {
  if (mode === "week") return addDaysISO(anchor, delta * 7);
  const [y, m] = anchor.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_META = {
  chua_nhan: { label: "Chưa nhận hàng", color: C.blue, tint: C.blueTint },
  da_nhan: { label: "Đã nhận hàng", color: C.green, tint: C.greenTint },
  huy: { label: "Hủy hàng", color: C.red, tint: C.redTint },
  hoan: { label: "Hoàn hàng", color: C.gold, tint: C.goldTint },
};
const COUNTED_STATUSES = ["chua_nhan", "da_nhan"];

function isCounted(o) { return COUNTED_STATUSES.includes(o.trangThai); }
function grossProfitOf(o) {
  if (!isCounted(o)) return 0;
  return (Number(o.giaBan) - Number(o.giaMua)) * Number(o.soLuong || 1);
}
function commissionOf(o) {
  if (!isCounted(o)) return 0;
  if (!o.congTacVien || !String(o.congTacVien).trim()) return 0;
  return Number(o.hoaHongValue || 0);
}
function profitOf(o) {
  if (!isCounted(o)) return 0;
  return grossProfitOf(o) - commissionOf(o);
}
function cardLabel(cp) { return `${cp.tenNganHang}${cp.soDuoi ? " •••• " + cp.soDuoi : ""}`; }

function migrateOrder(o) {
  const trangThai = o.trangThai === "binh_thuong" ? "da_nhan" : o.trangThai;
  return { congTacVien: "", hoaHongValue: 0, cardProfileId: null, ...o, trangThai };
}

/* ---------------------------------------------------------
   Small building blocks
--------------------------------------------------------- */
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.chua_nhan;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap" style={{ color: m.color, background: m.tint }}>
      {m.label}
    </span>
  );
}

function Num({ value, size = "base", tone }) {
  const color = tone === "pos" ? C.green : tone === "neg" ? C.red : tone === "cost" ? C.gold : C.ink;
  const text = fmtVND(value);
  let fontSize;
  if (size === "lg") {
    const len = text.length;
    fontSize = len <= 9 ? 30 : len <= 11 ? 25 : len <= 13 ? 21 : len <= 15 ? 18 : 15;
  } else if (size === "sm") {
    fontSize = text.length > 13 ? 12 : 14;
  } else {
    fontSize = text.length > 13 ? 13 : 16;
  }
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color, fontSize, lineHeight: 1.2, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function IconBtn({ onClick, title, children, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      type="button"
      disabled={disabled}
      className="inline-flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded transition-colors shrink-0"
      style={{ color: disabled ? C.inkFaint : C.inkSoft, opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = C.ruleSoft; }}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="text-xs font-medium mb-1.5" style={{ color: C.inkSoft }}>{label}</div>
      {children}
      {hint && <div className="text-xs mt-1" style={{ color: C.inkFaint }}>{hint}</div>}
    </label>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 10px", borderRadius: 6, border: `1px solid ${C.rule}`,
  background: C.paper, color: C.ink, fontSize: 15, outline: "none",
};

function MoneyInput({ value, onChange, placeholder, style }) {
  const ref = useRef(null);

  function formatDigits(digits) {
    if (!digits) return "";
    return Number(digits).toLocaleString("vi-VN");
  }

  const displayValue = formatDigits(String(value ?? "").replace(/\D/g, ""));

  function handleChange(e) {
    const input = e.target;
    const raw = input.value;
    const cursorBefore = input.selectionStart ?? raw.length;
    const digitsBeforeCursor = raw.slice(0, cursorBefore).replace(/\D/g, "").length;
    const cleanedDigits = raw.replace(/\D/g, "");

    onChange(cleanedDigits);

    requestAnimationFrame(() => {
      if (!ref.current) return;
      const formatted = formatDigits(cleanedDigits);
      let count = 0, pos = formatted.length;
      if (digitsBeforeCursor === 0) {
        pos = 0;
      } else {
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) count++;
          if (count === digitsBeforeCursor) { pos = i + 1; break; }
        }
      }
      ref.current.setSelectionRange(pos, pos);
    });
  }

  return (
    <input ref={ref} type="text" inputMode="numeric" value={displayValue}
      onChange={handleChange} placeholder={placeholder} style={style || inputStyle} />
  );
}

/* ---------------------------------------------------------
   Person tabs — add and delete
--------------------------------------------------------- */
function PersonTabs({ people, selected, onSelect, onAddPerson, onOpenManage }) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  function commit() {
    const name = val.trim();
    if (name) onAddPerson(name);
    setVal("");
    setAdding(false);
  }

  return (
    <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
      <button onClick={() => onSelect("all")} className="px-3 py-1.5 rounded text-sm font-medium transition-colors shrink-0"
        style={{ background: selected === "all" ? C.green : "transparent", color: selected === "all" ? "#fff" : C.inkSoft }}>
        Tất cả
      </button>
      {people.map((p) => (
        <button key={p} onClick={() => onSelect(p)} className="px-3 py-1.5 rounded text-sm font-medium transition-colors shrink-0"
          style={{ background: selected === p ? C.green : "transparent", color: selected === p ? "#fff" : C.inkSoft }}>
          {p}
        </button>
      ))}
      {adding ? (
        <input ref={inputRef} value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(""); setAdding(false); } }}
          onBlur={commit} placeholder="Tên người..." className="px-2 py-1 rounded text-sm w-28 outline-none shrink-0"
          style={{ border: `1px solid ${C.rule}`, background: C.paperRaised }} />
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-sm shrink-0" style={{ color: C.inkFaint }} title="Thêm người quản lý">
          <UserPlus size={14} /> Thêm
        </button>
      )}
      <button onClick={onOpenManage} className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-sm shrink-0" style={{ color: C.inkFaint }} title="Quản lý / xóa người quản lý">
        <Users size={14} /> Quản lý
      </button>
    </div>
  );
}

/* ---------------------------------------------------------
   People manager — deleting lives here, deliberately away
   from the quick-select tabs, so a stray tap can't remove anyone.
--------------------------------------------------------- */
function PeopleManagerDrawer({ people, orders, onClose, onDeletePerson, onResetAll }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(29,36,32,0.35)" }} onClick={onClose}>
      <div className="w-full sm:w-[400px] h-full overflow-y-auto" style={{ background: C.paperRaised }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 sticky top-0 z-10" style={{ background: C.paperRaised, borderBottom: `1px solid ${C.rule}` }}>
          <h2 className="font-semibold text-lg" style={{ color: C.ink }}>Quản lý người quản lý</h2>
          <IconBtn onClick={onClose} title="Đóng"><X size={18} /></IconBtn>
        </div>
        <div className="p-4 sm:p-5 space-y-2">
          {people.length === 0 && <p className="text-sm" style={{ color: C.inkFaint }}>Chưa có người quản lý nào.</p>}
          {people.map((p) => {
            const count = orders.filter((o) => o.nguoiQuanLy === p).length;
            return (
              <div key={p} className="flex items-center justify-between gap-3 p-3 rounded" style={{ border: `1px solid ${C.ruleSoft}` }}>
                <div className="min-w-0">
                  <div className="text-sm font-medium" style={{ color: C.ink }}>{p}</div>
                  <div className="text-xs" style={{ color: C.inkFaint }}>{count} đơn hàng</div>
                </div>
                <button onClick={() => onDeletePerson(p)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-sm shrink-0"
                  style={{ border: `1px solid ${C.rule}`, color: C.red }}>
                  <Trash2 size={14} /> Xóa
                </button>
              </div>
            );
          })}
        </div>
        <div className="p-4 sm:p-5 text-xs" style={{ color: C.inkFaint, borderTop: `1px solid ${C.ruleSoft}` }}>
          Xóa người quản lý sẽ không xóa các đơn hàng cũ của họ — đơn vẫn còn nguyên trong "Tất cả", chỉ không còn tab lọc riêng nữa. Vẫn sẽ có hộp xác nhận trước khi xóa thật.
        </div>
        <div className="p-4 sm:p-5" style={{ borderTop: `1px solid ${C.rule}` }}>
          <div className="text-sm font-semibold mb-2" style={{ color: C.red }}>Vùng nguy hiểm</div>
          <p className="text-xs mb-3" style={{ color: C.inkFaint }}>Xóa toàn bộ đơn hàng, người quản lý và thẻ đã lưu — dùng khi muốn bắt đầu lại từ đầu. Không thể hoàn tác.</p>
          <button onClick={onResetAll} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded text-sm font-medium"
            style={{ background: C.redTint, color: C.red }}>
            <Trash2 size={14} /> Xóa toàn bộ dữ liệu
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Dashboard — browsable by week or month, current or past
--------------------------------------------------------- */
function Dashboard({ orders, onEdit, onGoCards }) {
  const [periodMode, setPeriodMode] = useState("month");
  const [periodAnchor, setPeriodAnchor] = useState(() => currentPeriod("month"));

  useEffect(() => { setPeriodAnchor(currentPeriod(periodMode)); }, [periodMode]);

  const isNow = periodAnchor === currentPeriod(periodMode);
  const keyFn = periodMode === "week" ? weekKey : monthKey;

  const periodOrders = useMemo(() => orders.filter((o) => keyFn(o.ngayMua) === periodAnchor), [orders, periodMode, periodAnchor]);
  const periodProfit = periodOrders.reduce((s, o) => s + profitOf(o), 0);
  const periodCommission = periodOrders.reduce((s, o) => s + commissionOf(o), 0);
  const periodIssues = periodOrders.filter((o) => o.trangThai === "huy" || o.trangThai === "hoan").length;

  const chartData = useMemo(() => {
    if (periodMode === "week") {
      const weeks = [];
      let m = currentPeriod("week");
      for (let i = 0; i < 8; i++) { weeks.unshift(m); m = addDaysISO(m, -7); }
      return weeks.map((w) => ({ key: w, label: weekLabel(w), value: orders.filter((o) => weekKey(o.ngayMua) === w).reduce((s, o) => s + profitOf(o), 0) }));
    }
    const months = [];
    let cur = currentPeriod("month");
    for (let i = 0; i < 6; i++) { months.unshift(cur); cur = shiftPeriod(cur, "month", -1); }
    return months.map((mo) => ({ key: mo, label: monthLabel(mo), value: orders.filter((o) => monthKey(o.ngayMua) === mo).reduce((s, o) => s + profitOf(o), 0) }));
  }, [orders, periodMode]);

  const upcoming = useMemo(() => {
    return orders.filter((o) => o.thanhToan === "the" && o.ngayThanhToan && !o.daThanhToan)
      .sort((a, b) => a.ngayThanhToan.localeCompare(b.ngayThanhToan)).slice(0, 4);
  }, [orders]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
        <div className="flex rounded overflow-hidden shrink-0" style={{ border: `1px solid ${C.rule}` }}>
          {["week", "month"].map((mode) => (
            <button key={mode} onClick={() => setPeriodMode(mode)} className="px-3 py-1.5 text-sm"
              style={{ background: periodMode === mode ? C.green : "transparent", color: periodMode === mode ? "#fff" : C.inkSoft }}>
              {mode === "week" ? "Theo tuần" : "Theo tháng"}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between sm:justify-center gap-2 flex-1">
          <IconBtn onClick={() => setPeriodAnchor(shiftPeriod(periodAnchor, periodMode, -1))} title="Kỳ trước"><ChevronLeft size={17} /></IconBtn>
          <div className="text-sm font-semibold text-center flex-1 sm:flex-none sm:min-w-[130px]" style={{ color: C.ink }}>
            {periodMode === "week" ? weekLabel(periodAnchor) : monthLabelFull(periodAnchor)}
          </div>
          <IconBtn onClick={() => setPeriodAnchor(shiftPeriod(periodAnchor, periodMode, 1))} title="Kỳ sau" disabled={isNow}><ChevronRight size={17} /></IconBtn>
        </div>
        {!isNow && <button onClick={() => setPeriodAnchor(currentPeriod(periodMode))} className="text-sm shrink-0" style={{ color: C.green }}>Về hiện tại</button>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-4" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
          <div className="text-sm mb-2" style={{ color: C.inkFaint }}>Lợi nhuận</div>
          <Num value={periodProfit} size="lg" tone={periodProfit >= 0 ? "pos" : "neg"} />
        </div>
        <div className="rounded-lg p-4" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
          <div className="text-sm mb-2" style={{ color: C.inkFaint }}>Hoa hồng CTV</div>
          <Num value={periodCommission} size="lg" tone="cost" />
        </div>
        <div className="rounded-lg p-4" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
          <div className="text-sm mb-2" style={{ color: C.inkFaint }}>Tổng số đơn</div>
          <span className="text-3xl font-semibold" style={{ color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{periodOrders.length}</span>
        </div>
        <div className="rounded-lg p-4" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
          <div className="text-sm mb-2" style={{ color: C.inkFaint }}>Đơn hủy / hoàn</div>
          <span className="text-3xl font-semibold" style={{ color: periodIssues ? C.red : C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{periodIssues}</span>
        </div>
      </div>

      <div className="rounded-lg p-4 sm:p-5" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
        <h3 className="font-semibold mb-3" style={{ color: C.ink }}>Xu hướng {periodMode === "week" ? "8 tuần gần đây" : "6 tháng gần đây"}</h3>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={C.ruleSoft} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={{ stroke: C.rule }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={false} tickLine={false}
                tickFormatter={(v) => (Math.abs(v) >= 1000000 ? (v / 1000000).toFixed(1) + "tr" : (v / 1000).toFixed(0) + "k")} width={40} />
              <Tooltip formatter={(v) => fmtVND(v)} contentStyle={{ borderRadius: 6, border: `1px solid ${C.rule}`, fontFamily: "'Be Vietnam Pro', sans-serif", fontSize: 13 }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} onClick={(d) => d && setPeriodAnchor(d.key)} style={{ cursor: "pointer" }}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.value >= 0 ? C.green : C.red} opacity={d.key === periodAnchor ? 1 : 0.5} stroke={d.key === periodAnchor ? C.ink : "none"} strokeWidth={d.key === periodAnchor ? 1.5 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs mt-2" style={{ color: C.inkFaint }}>Bấm vào một cột để xem chi tiết kỳ đó ở trên.</p>
      </div>

      <div className="rounded-lg p-4 sm:p-5" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold" style={{ color: C.ink }}>Sắp đến hạn thanh toán thẻ</h3>
          <button onClick={onGoCards} className="text-sm" style={{ color: C.green }}>Xem tất cả</button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm" style={{ color: C.inkFaint }}>Không có khoản nào sắp đến hạn.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((o) => {
              const d = daysUntil(o.ngayThanhToan);
              const urgent = d !== null && d <= 7;
              return (
                <button key={o.id} onClick={() => onEdit(o)} className="w-full flex items-center justify-between p-3 rounded text-left"
                  style={{ background: urgent ? C.goldTint : C.paper, borderLeft: `3px solid ${urgent ? C.gold : C.rule}` }}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: C.ink }}>{o.tenThe || "Chưa đặt tên thẻ"}</div>
                    <div className="text-xs truncate" style={{ color: C.inkFaint }}>{o.tenSanPham}</div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <div className="text-sm font-medium" style={{ color: urgent ? C.gold : C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{fmtDateShort(o.ngayThanhToan)}</div>
                    <div className="text-xs" style={{ color: C.inkFaint }}>{d < 0 ? `Trễ ${-d} ngày` : d === 0 ? "Hôm nay" : `Còn ${d} ngày`}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Orders — table on desktop, stacked cards on phone
--------------------------------------------------------- */
function OrdersTab({ orders, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return orders
      .filter((o) => (statusFilter === "all" ? true : o.trangThai === statusFilter))
      .filter((o) => o.tenSanPham.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.ngayMua.localeCompare(a.ngayMua));
  }, [orders, search, statusFilter]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
      <div className="flex flex-col sm:flex-row gap-3 p-4" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
          <Search size={15} style={{ color: C.inkFaint }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm sản phẩm..." className="bg-transparent outline-none text-sm flex-1" style={{ color: C.ink }} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.rule}`, color: C.ink }}>
          <option value="all">Mọi trạng thái</option>
          <option value="chua_nhan">Chưa nhận hàng</option>
          <option value="da_nhan">Đã nhận hàng</option>
          <option value="huy">Hủy hàng</option>
          <option value="hoan">Hoàn hàng</option>
        </select>
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 960 }}>
          <thead>
            <tr style={{ color: C.inkFaint }}>
              {["Ngày", "Người", "CTV", "Sản phẩm", "SL", "Giá mua", "Giá bán", "Lợi nhuận", "Trạng thái", "TT", ""].map((h, i) => (
                <th key={i} className={`text-left font-medium py-2 px-3 ${i >= 4 && i <= 7 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const p = profitOf(o);
              const excluded = !isCounted(o);
              const comm = commissionOf(o);
              return (
                <tr key={o.id} style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
                  <td className="py-2.5 px-3" style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{fmtDateShort(o.ngayMua)}</td>
                  <td className="py-2.5 px-3" style={{ color: C.inkSoft }}>{o.nguoiQuanLy}</td>
                  <td className="py-2.5 px-3">
                    {o.congTacVien ? (
                      <>
                        <div style={{ color: C.inkSoft }}>{o.congTacVien}</div>
                        {comm > 0 && <div className="text-xs" style={{ color: C.gold }}>{fmtVND(o.hoaHongValue)}</div>}
                      </>
                    ) : <span style={{ color: C.inkFaint }}>—</span>}
                  </td>
                  <td className="py-2.5 px-3" style={{ color: C.ink }}>
                    {o.tenSanPham}
                    {o.ghiChu && <div className="text-xs mt-0.5" style={{ color: C.inkFaint }}>{o.ghiChu}</div>}
                  </td>
                  <td className="py-2.5 px-3 text-right" style={{ color: C.inkSoft }}>{o.soLuong}</td>
                  <td className="py-2.5 px-3 text-right" style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{fmtVND(o.giaMua)}</td>
                  <td className="py-2.5 px-3 text-right" style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{fmtVND(o.giaBan)}</td>
                  <td className="py-2.5 px-3 text-right">
                    {excluded ? <span className="text-xs" style={{ color: C.inkFaint }}>không tính</span> : <Num value={p} tone={p >= 0 ? "pos" : "neg"} />}
                  </td>
                  <td className="py-2.5 px-3"><StatusPill status={o.trangThai} /></td>
                  <td className="py-2.5 px-3">
                    {o.thanhToan === "the" ? (
                      <span title={o.tenThe} className="inline-flex items-center gap-1 text-xs" style={{ color: C.inkSoft }}><CreditCard size={13} /> Thẻ</span>
                    ) : <span className="text-xs" style={{ color: C.inkSoft }}>COD</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1 justify-end">
                      <IconBtn onClick={() => onEdit(o)} title="Sửa"><Pencil size={14} /></IconBtn>
                      <IconBtn onClick={() => onDelete(o)} title="Xóa"><Trash2 size={14} /></IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center py-10 text-sm" style={{ color: C.inkFaint }}>Chưa có đơn nào khớp.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden">
        {filtered.length === 0 && <div className="text-center py-10 text-sm" style={{ color: C.inkFaint }}>Chưa có đơn nào khớp.</div>}
        {filtered.map((o) => {
          const p = profitOf(o);
          const excluded = !isCounted(o);
          return (
            <div key={o.id} className="p-4" style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium" style={{ color: C.ink }}>{o.tenSanPham}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.inkFaint }}>{o.nguoiQuanLy} · {fmtDateShort(o.ngayMua)}</div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconBtn onClick={() => onEdit(o)} title="Sửa"><Pencil size={15} /></IconBtn>
                  <IconBtn onClick={() => onDelete(o)} title="Xóa"><Trash2 size={15} /></IconBtn>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                <StatusPill status={o.trangThai} />
                {o.thanhToan === "the" ? (
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: C.inkSoft }}><CreditCard size={12} /> Thẻ</span>
                ) : <span className="text-xs" style={{ color: C.inkSoft }}>COD</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-2.5">
                <div><div style={{ color: C.inkFaint }}>SL</div><div style={{ color: C.inkSoft }}>{o.soLuong}</div></div>
                <div><div style={{ color: C.inkFaint }}>Giá mua</div><div style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{fmtVND(o.giaMua)}</div></div>
                <div><div style={{ color: C.inkFaint }}>Giá bán</div><div style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{fmtVND(o.giaBan)}</div></div>
              </div>
              {o.congTacVien && (
                <div className="text-xs mb-2" style={{ color: C.inkFaint }}>CTV: {o.congTacVien} — <span style={{ color: C.gold, fontWeight: 600 }}>{fmtVND(o.hoaHongValue)}</span></div>
              )}
              {o.ghiChu && <div className="text-xs mb-2" style={{ color: C.inkFaint }}>{o.ghiChu}</div>}
              <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
                <span className="text-xs" style={{ color: C.inkSoft }}>Lợi nhuận</span>
                {excluded ? <span className="text-xs" style={{ color: C.inkFaint }}>không tính</span> : <Num value={p} tone={p >= 0 ? "pos" : "neg"} size="sm" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Saved card profiles — fill once, click to reuse later
--------------------------------------------------------- */
function CardProfilesPanel({ profiles, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);

  function startNew() { setEditing({ id: null, tenNganHang: "", soDuoi: "", chuThe: "", chinhSach: "" }); }
  function submit(e) {
    e.preventDefault();
    if (!editing.tenNganHang.trim()) return;
    onSave({ ...editing, id: editing.id || uid() });
    setEditing(null);
  }

  return (
    <div className="rounded-lg overflow-hidden mb-4" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
      <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
        <span className="font-medium text-sm" style={{ color: C.ink }}>Thẻ đã lưu</span>
        {!editing && (
          <button onClick={startNew} type="button" className="inline-flex items-center gap-1 text-sm" style={{ color: C.green }}>
            <Plus size={14} /> Thêm thẻ
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={submit} className="p-4 space-y-3" style={{ borderBottom: `1px solid ${C.ruleSoft}`, background: C.paper }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tên ngân hàng / loại thẻ">
              <input value={editing.tenNganHang} onChange={(e) => setEditing({ ...editing, tenNganHang: e.target.value })} placeholder="VD: Vietcombank Visa" style={inputStyle} required />
            </Field>
            <Field label="4 số cuối thẻ">
              <input value={editing.soDuoi} maxLength={4} inputMode="numeric" onChange={(e) => setEditing({ ...editing, soDuoi: e.target.value.replace(/\D/g, "") })} placeholder="4499" style={inputStyle} />
            </Field>
          </div>
          <Field label="Họ tên chủ thẻ">
            <input value={editing.chuThe} onChange={(e) => setEditing({ ...editing, chuThe: e.target.value })} placeholder="NGUYEN VAN A" style={inputStyle} />
          </Field>
          <Field label="Chính sách hoàn tiền / khuyến mãi" hint="Không bắt buộc — có thể để trống">
            <textarea value={editing.chinhSach} onChange={(e) => setEditing({ ...editing, chinhSach: e.target.value })} rows={2} placeholder="VD: Hoàn 10% tối đa 300k cho đơn từ 500k" style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded text-sm font-medium" style={{ background: C.green, color: "#fff" }}>Lưu thẻ</button>
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded text-sm" style={{ border: `1px solid ${C.rule}`, color: C.inkSoft }}>Hủy</button>
          </div>
        </form>
      )}

      {profiles.length === 0 && !editing && (
        <p className="p-4 text-sm" style={{ color: C.inkFaint }}>Chưa có thẻ nào được lưu. Thêm thẻ để lần sau chỉ cần chọn, không phải điền lại.</p>
      )}
      {profiles.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 p-4" style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: C.ink }}>{cardLabel(p)}</div>
            {p.chuThe && <div className="text-xs mt-0.5" style={{ color: C.inkFaint }}>{p.chuThe}</div>}
            {p.chinhSach && <div className="text-xs mt-0.5" style={{ color: C.gold }}>{p.chinhSach}</div>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <IconBtn onClick={() => setEditing({ ...p })} title="Sửa"><Pencil size={14} /></IconBtn>
            <IconBtn onClick={() => onDelete(p)} title="Xóa"><Trash2 size={14} /></IconBtn>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   Cards & cashback tab
--------------------------------------------------------- */
function CardsTab({ orders, cardProfiles, onEdit, onTogglePaid, onSaveCardProfile, onDeleteCardProfile }) {
  const cardOrders = orders.filter((o) => o.thanhToan === "the");
  const groups = useMemo(() => {
    const map = {};
    cardOrders.forEach((o) => {
      const key = o.tenThe || "Chưa đặt tên thẻ";
      if (!map[key]) map[key] = [];
      map[key].push(o);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => (a.ngayThanhToan || "").localeCompare(b.ngayThanhToan || "")));
    return map;
  }, [cardOrders]);

  return (
    <div className="space-y-4">
      <CardProfilesPanel profiles={cardProfiles} onSave={onSaveCardProfile} onDelete={onDeleteCardProfile} />

      {cardOrders.length === 0 ? (
        <div className="rounded-lg p-10 text-center" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
          <CreditCard size={28} className="mx-auto mb-3" style={{ color: C.inkFaint }} />
          <p className="text-sm" style={{ color: C.inkFaint }}>Chưa có đơn nào thanh toán bằng thẻ.</p>
        </div>
      ) : (
        Object.entries(groups).map(([card, list]) => {
          const totalCashback = list.reduce((s, o) => s + Number(o.soTienHoan || 0), 0);
          const unpaid = list.filter((o) => !o.daThanhToan).length;
          return (
            <div key={card} className="rounded-lg overflow-hidden" style={{ background: C.paperRaised, border: `1px solid ${C.rule}` }}>
              <div className="flex items-center justify-between p-4 gap-2" style={{ borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
                <div className="flex items-center gap-2 min-w-0">
                  <CreditCard size={16} style={{ color: C.green }} className="shrink-0" />
                  <span className="font-medium truncate" style={{ color: C.ink }}>{card}</span>
                  {unpaid > 0 && <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ background: C.goldTint, color: C.gold }}>{unpaid} chưa TT</span>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs" style={{ color: C.inkFaint }}>Tổng tiền hoàn</div>
                  <Num value={totalCashback} tone="pos" size="sm" />
                </div>
              </div>
              <div>
                {list.map((o) => {
                  const d = daysUntil(o.ngayThanhToan);
                  const urgent = !o.daThanhToan && d !== null && d <= 7;
                  const overdue = !o.daThanhToan && d !== null && d < 0;
                  return (
                    <div key={o.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4"
                      style={{ borderTop: `1px solid ${C.ruleSoft}`, borderLeft: `3px solid ${overdue ? C.red : urgent ? C.gold : "transparent"}`, background: o.daThanhToan ? C.paper : "transparent" }}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => onTogglePaid(o)} type="button" className="shrink-0" title="Đánh dấu đã thanh toán">
                          <span className="w-6 h-6 sm:w-5 sm:h-5 rounded flex items-center justify-center" style={{ border: `1.5px solid ${o.daThanhToan ? C.green : C.rule}`, background: o.daThanhToan ? C.green : "transparent" }}>
                            {o.daThanhToan && <Check size={13} color="#fff" />}
                          </span>
                        </button>
                        <button onClick={() => onEdit(o)} type="button" className="flex-1 text-left min-w-0 sm:hidden">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: C.ink }}>{o.tenSanPham}</span>
                            <StatusPill status={o.trangThai} />
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: C.inkFaint }}>{o.nguoiQuanLy} · {fmtDateShort(o.ngayMua)}</div>
                        </button>
                      </div>
                      <button onClick={() => onEdit(o)} type="button" className="flex-1 text-left hidden sm:block min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: C.ink }}>{o.tenSanPham}</span>
                          <StatusPill status={o.trangThai} />
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: C.inkFaint }}>{o.nguoiQuanLy} · {fmtDateShort(o.ngayMua)}</div>
                      </button>
                      <div className="grid grid-cols-3 gap-3 sm:gap-6 text-xs sm:pr-2">
                        <div><div style={{ color: C.inkFaint }}>Sao kê</div><div style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{fmtDateShort(o.ngaySaoKe)}</div></div>
                        <div><div style={{ color: C.inkFaint }}>Hoàn tiền</div><div style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{fmtDateShort(o.ngayHoan)}</div></div>
                        <div><div style={{ color: C.inkFaint }}>Hạn TT</div><div style={{ color: overdue ? C.red : urgent ? C.gold : C.inkSoft, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtDateShort(o.ngayThanhToan)}</div></div>
                      </div>
                      <div className="text-right shrink-0" style={{ minWidth: 90 }}>
                        <div className="text-xs" style={{ color: C.inkFaint }}>Tiền hoàn</div>
                        <Num value={o.soTienHoan} tone="pos" size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Order drawer (add / edit)
--------------------------------------------------------- */
function emptyDraft(people, selectedPerson) {
  return {
    id: null,
    nguoiQuanLy: selectedPerson !== "all" ? selectedPerson : (people[0] || ""),
    tenSanPham: "", soLuong: 1, giaMua: "", giaBan: "", ngayMua: todayISO(),
    trangThai: "chua_nhan", ghiChu: "",
    thanhToan: "cod", cardProfileId: null, tenThe: "", soTienHoan: "",
    ngayHoan: "", ngaySaoKe: "", ngayThanhToan: "", daThanhToan: false,
    congTacVien: "", hoaHongValue: "",
  };
}

function OrderDrawer({ draft, setDraft, people, cardProfiles, onAddCardProfile, onClose, onSave, onDelete }) {
  const [addingCard, setAddingCard] = useState(false);
  const [newCard, setNewCard] = useState({ tenNganHang: "", soDuoi: "", chuThe: "", chinhSach: "" });

  const isEdit = !!draft.id;
  const notCounted = draft.trangThai === "huy" || draft.trangThai === "hoan";
  const gp = grossProfitOf(draft);
  const comm = commissionOf(draft);
  const net = profitOf(draft);
  const selectedProfile = cardProfiles.find((p) => p.id === draft.cardProfileId);

  function set(k, v) {
    setDraft((d) => {
      const next = { ...d, [k]: v };
      if (k === "ngaySaoKe" && v && !d.ngayThanhToan) next.ngayThanhToan = addDaysISO(v, 15);
      return next;
    });
  }

  function pickCard(id) {
    const profile = cardProfiles.find((p) => p.id === id);
    setDraft((d) => ({ ...d, cardProfileId: id || null, tenThe: profile ? cardLabel(profile) : "" }));
  }

  function saveNewCard() {
    if (!newCard.tenNganHang.trim()) return;
    const profile = { ...newCard, id: uid() };
    onAddCardProfile(profile);
    setDraft((d) => ({ ...d, cardProfileId: profile.id, tenThe: cardLabel(profile) }));
    setNewCard({ tenNganHang: "", soDuoi: "", chuThe: "", chinhSach: "" });
    setAddingCard(false);
  }

  function submit(e) {
    e.preventDefault();
    if (!draft.tenSanPham.trim()) return;
    onSave({ ...draft, id: draft.id || uid() });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(29,36,32,0.35)" }} onClick={onClose}>
      <div className="w-full sm:w-[440px] h-full overflow-y-auto" style={{ background: C.paperRaised }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 sticky top-0 z-10" style={{ background: C.paperRaised, borderBottom: `1px solid ${C.rule}` }}>
          <h2 className="font-semibold text-lg" style={{ color: C.ink }}>{isEdit ? "Sửa đơn hàng" : "Thêm đơn hàng"}</h2>
          <IconBtn onClick={onClose} title="Đóng"><X size={18} /></IconBtn>
        </div>

        <form onSubmit={submit} className="p-4 sm:p-5 space-y-4 pb-8">
          <Field label="Người quản lý">
            <select value={draft.nguoiQuanLy} onChange={(e) => set("nguoiQuanLy", e.target.value)} style={inputStyle}>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          <Field label="Tên sản phẩm">
            <input value={draft.tenSanPham} onChange={(e) => set("tenSanPham", e.target.value)} placeholder="VD: Ốp lưng iPhone 15" style={inputStyle} required />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Số lượng"><input type="number" min="1" value={draft.soLuong} onChange={(e) => set("soLuong", e.target.value)} style={inputStyle} /></Field>
            <Field label="Giá mua"><MoneyInput value={draft.giaMua} onChange={(v) => set("giaMua", v)} placeholder="0" /></Field>
            <Field label="Giá bán"><MoneyInput value={draft.giaBan} onChange={(v) => set("giaBan", v)} placeholder="0" /></Field>
          </div>

          <Field label="Ngày mua"><input type="date" value={draft.ngayMua} onChange={(e) => set("ngayMua", e.target.value)} style={inputStyle} /></Field>

          <Field label="Trạng thái đơn">
            <select value={draft.trangThai} onChange={(e) => set("trangThai", e.target.value)} style={inputStyle}>
              <option value="chua_nhan">Chưa nhận hàng</option>
              <option value="da_nhan">Đã nhận hàng</option>
              <option value="huy">Hủy hàng</option>
              <option value="hoan">Hoàn hàng</option>
            </select>
          </Field>

          {notCounted && (
            <Field label="Lý do hủy / hoàn">
              <textarea value={draft.ghiChu} onChange={(e) => set("ghiChu", e.target.value)} rows={2} placeholder="VD: Khách hủy trước khi giao..." style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
          )}

          <Field label="Phương thức thanh toán">
            <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${C.rule}` }}>
              {[["cod", "Nhận hàng (COD)"], ["the", "Thẻ ngân hàng"]].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => set("thanhToan", val)} className="flex-1 py-2.5 text-sm"
                  style={{ background: draft.thanhToan === val ? C.green : "transparent", color: draft.thanhToan === val ? "#fff" : C.inkSoft }}>
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          {draft.thanhToan === "the" && (
            <div className="space-y-4 p-4 rounded" style={{ background: C.paper, border: `1px solid ${C.ruleSoft}` }}>
              <Field label="Chọn thẻ đã lưu">
                <select value={draft.cardProfileId || ""} onChange={(e) => pickCard(e.target.value)} style={inputStyle}>
                  <option value="">— Chọn thẻ —</option>
                  {cardProfiles.map((p) => <option key={p.id} value={p.id}>{cardLabel(p)}{p.chuThe ? ` — ${p.chuThe}` : ""}</option>)}
                </select>
              </Field>

              {selectedProfile?.chinhSach && (
                <div className="text-xs p-2.5 rounded" style={{ background: C.goldTint, color: C.gold }}>Chính sách: {selectedProfile.chinhSach}</div>
              )}

              {!addingCard ? (
                <button type="button" onClick={() => setAddingCard(true)} className="text-sm inline-flex items-center gap-1" style={{ color: C.green }}>
                  <Plus size={14} /> Thêm thẻ mới
                </button>
              ) : (
                <div className="space-y-3 p-3 rounded" style={{ border: `1px dashed ${C.rule}` }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Tên ngân hàng / loại thẻ">
                      <input value={newCard.tenNganHang} onChange={(e) => setNewCard({ ...newCard, tenNganHang: e.target.value })} placeholder="VD: Vietcombank Visa" style={inputStyle} />
                    </Field>
                    <Field label="4 số cuối thẻ">
                      <input value={newCard.soDuoi} maxLength={4} inputMode="numeric" onChange={(e) => setNewCard({ ...newCard, soDuoi: e.target.value.replace(/\D/g, "") })} placeholder="4499" style={inputStyle} />
                    </Field>
                  </div>
                  <Field label="Họ tên chủ thẻ">
                    <input value={newCard.chuThe} onChange={(e) => setNewCard({ ...newCard, chuThe: e.target.value })} placeholder="NGUYEN VAN A" style={inputStyle} />
                  </Field>
                  <Field label="Chính sách hoàn tiền / khuyến mãi" hint="Không bắt buộc — có thể để trống">
                    <textarea value={newCard.chinhSach} onChange={(e) => setNewCard({ ...newCard, chinhSach: e.target.value })} rows={2} placeholder="VD: Hoàn 10% tối đa 300k cho đơn từ 500k" style={{ ...inputStyle, resize: "vertical" }} />
                  </Field>
                  <div className="flex gap-2">
                    <button type="button" onClick={saveNewCard} className="px-3 py-1.5 rounded text-sm font-medium" style={{ background: C.green, color: "#fff" }}>Lưu thẻ</button>
                    <button type="button" onClick={() => setAddingCard(false)} className="px-3 py-1.5 rounded text-sm" style={{ border: `1px solid ${C.rule}`, color: C.inkSoft }}>Hủy</button>
                  </div>
                </div>
              )}

              <Field label="Số tiền hoàn (cashback) cho đơn này"><MoneyInput value={draft.soTienHoan} onChange={(v) => set("soTienHoan", v)} placeholder="0" /></Field>
              <Field label="Ngày hoàn tiền"><input type="date" value={draft.ngayHoan} onChange={(e) => set("ngayHoan", e.target.value)} style={inputStyle} /></Field>
              <Field label="Ngày sao kê"><input type="date" value={draft.ngaySaoKe} onChange={(e) => set("ngaySaoKe", e.target.value)} style={inputStyle} /></Field>
              <Field label="Ngày phải thanh toán" hint="Mặc định +15 ngày sau sao kê, có thể sửa lại cho đúng hạn mức thẻ">
                <input type="date" value={draft.ngayThanhToan} onChange={(e) => set("ngayThanhToan", e.target.value)} style={inputStyle} />
              </Field>
              <label className="flex items-center gap-2 text-sm" style={{ color: C.inkSoft }}>
                <input type="checkbox" checked={draft.daThanhToan} onChange={(e) => set("daThanhToan", e.target.checked)} />
                Đã thanh toán sao kê này
              </label>
            </div>
          )}

          <Field label="Cộng tác viên (nếu nhờ người khác săn hộ)">
            <input value={draft.congTacVien} onChange={(e) => set("congTacVien", e.target.value)} placeholder="Để trống nếu tự săn hàng" style={inputStyle} />
          </Field>

          {draft.congTacVien && draft.congTacVien.trim() && (
            <Field label="Số tiền hoa hồng (VND)">
              <MoneyInput value={draft.hoaHongValue} onChange={(v) => set("hoaHongValue", v)} placeholder="0" />
            </Field>
          )}

          <div className="p-3 rounded space-y-1.5" style={{ background: notCounted ? C.paper : C.greenTint }}>
            {notCounted ? (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: C.inkSoft }}>Lợi nhuận</span>
                <span className="text-sm" style={{ color: C.inkFaint }}>Không tính (đã hủy/hoàn)</span>
              </div>
            ) : (
              <>
                {comm > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: C.inkSoft }}>Lợi nhuận gộp</span>
                    <Num value={gp} size="sm" tone={gp >= 0 ? "pos" : "neg"} />
                  </div>
                )}
                {comm > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: C.inkSoft }}>Hoa hồng CTV</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: C.gold }}>−{fmtVND(comm)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: C.inkSoft }}>{comm > 0 ? "Lợi nhuận ròng" : "Lợi nhuận dự kiến"}</span>
                  <Num value={net} tone={net >= 0 ? "pos" : "neg"} />
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="flex-1 py-3 rounded font-medium text-sm" style={{ background: C.green, color: "#fff" }}>
              {isEdit ? "Lưu thay đổi" : "Thêm đơn hàng"}
            </button>
            {isEdit && (
              <button type="button" onClick={() => onDelete(draft)} className="px-4 py-3 rounded text-sm" style={{ border: `1px solid ${C.rule}`, color: C.red }}>Xóa</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   App
--------------------------------------------------------- */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [people, setPeople] = useState([]);
  const [cardProfiles, setCardProfiles] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState("all");
  const [tab, setTab] = useState("dashboard");
  const [draft, setDraft] = useState(null);
  const [managingPeople, setManagingPeople] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const lastWriteRef = useRef(0);
  const pendingWritesRef = useRef(0);

  const load = useCallback(async (showSpinner) => {
    if (pendingWritesRef.current > 0) return; // never let a poll clobber an order that's still being saved
    if (showSpinner) setSyncing(true);
    try {
      const state = await apiFetch();
      setOrders((state.orders || []).map(migrateOrder));
      setPeople(state.people && state.people.length ? state.people : []);
      setCardProfiles(state.cardProfiles || []);
      setLastSynced(new Date());
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Poll for changes made by other people on other devices
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastWriteRef.current > 2000) load(false);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Refresh promptly whenever the tab regains focus
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && Date.now() - lastWriteRef.current > 2000) load(false);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function persistAll(nextOrders, nextPeople, nextCardProfiles) {
    setOrders(nextOrders);
    setPeople(nextPeople);
    setCardProfiles(nextCardProfiles);
    pendingWritesRef.current += 1;
    try {
      await apiSave({ orders: nextOrders, people: nextPeople, cardProfiles: nextCardProfiles });
      setLastSynced(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      pendingWritesRef.current -= 1;
      lastWriteRef.current = Date.now();
    }
  }
  function persistOrders(next) { persistAll(next, people, cardProfiles); }
  function persistPeople(next) { persistAll(orders, next, cardProfiles); }
  function persistCardProfiles(next) { persistAll(orders, people, next); }

  function handleAddPerson(name) {
    if (people.includes(name)) { setSelectedPerson(name); return; }
    persistPeople([...people, name]);
    setSelectedPerson(name);
  }
  function handleDeletePerson(name) {
    if (!window.confirm(`Xóa "${name}" khỏi danh sách người quản lý?\n\nCác đơn hàng cũ của ${name} vẫn được giữ nguyên, chỉ không còn tab lọc riêng.`)) return;
    if (selectedPerson === name) setSelectedPerson("all");
    persistPeople(people.filter((p) => p !== name));
  }

  async function resetAllData() {
    if (!window.confirm("XÓA TOÀN BỘ dữ liệu: tất cả đơn hàng, người quản lý và thẻ đã lưu.\n\nKhông thể hoàn tác. Tiếp tục?")) return;
    if (!window.confirm("Xác nhận lần cuối: xóa vĩnh viễn toàn bộ dữ liệu?")) return;
    try {
      await apiReset();
      setOrders([]);
      setPeople([]);
      setCardProfiles([]);
      setSelectedPerson("all");
      setManagingPeople(false);
    } catch (e) {
      console.error(e);
      window.alert("Không xóa được, vui lòng thử lại.");
    }
  }

  function saveCardProfile(profile) {
    const exists = cardProfiles.some((p) => p.id === profile.id);
    const next = exists ? cardProfiles.map((p) => (p.id === profile.id ? profile : p)) : [...cardProfiles, profile];
    persistCardProfiles(next);
  }
  function deleteCardProfile(p) {
    if (!window.confirm(`Xóa thẻ "${cardLabel(p)}"? Các đơn đã lưu trước đó vẫn giữ nguyên thông tin cũ.`)) return;
    persistCardProfiles(cardProfiles.filter((x) => x.id !== p.id));
  }

  function openNew() { setDraft(emptyDraft(people, selectedPerson)); }
  function openEdit(order) { setDraft({ ...order }); }
  function closeDrawer() { setDraft(null); }
  function saveDraft(d) {
    const exists = orders.some((o) => o.id === d.id);
    const next = exists ? orders.map((o) => (o.id === d.id ? d : o)) : [...orders, d];
    persistOrders(next);
    setDraft(null);
  }
  function deleteOrder(o) {
    if (!window.confirm(`Xóa đơn "${o.tenSanPham}"? Không thể hoàn tác.`)) return;
    persistOrders(orders.filter((x) => x.id !== o.id));
    setDraft(null);
  }
  function togglePaid(o) {
    persistOrders(orders.map((x) => (x.id === o.id ? { ...x, daThanhToan: !x.daThanhToan } : x)));
  }

  const visibleOrders = useMemo(
    () => (selectedPerson === "all" ? orders : orders.filter((o) => o.nguoiQuanLy === selectedPerson)),
    [orders, selectedPerson]
  );

  const TABS = [
    ["dashboard", "Tổng quan", "Tổng quan", LayoutGrid],
    ["orders", "Đơn hàng", "Đơn hàng", Package],
    ["cards", "Thẻ & hoàn tiền", "Thẻ", CreditCard],
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.paper }}>
        <div className="flex items-center gap-2" style={{ color: C.inkFaint }}>
          <Loader2 size={18} className="animate-spin" /> Đang tải dữ liệu...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: C.paper }}>
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 sm:mb-5 px-1">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: C.ink }}>Theo dõi lợi nhuận Shopee</h1>
            <p className="text-sm" style={{ color: C.inkFaint }}>Quản lý đơn hàng, cộng tác viên và thẻ ngân hàng khi nhập sỉ Shopee</p>
          </div>
          <button onClick={openNew} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded font-medium text-sm shrink-0 w-full sm:w-auto" style={{ background: C.green, color: "#fff" }}>
            <Plus size={16} /> Thêm đơn
          </button>
        </div>

        {loadError && (
          <div className="mb-3 mx-1 p-3 rounded text-sm" style={{ background: C.redTint, color: C.red }}>
            Không kết nối được với máy chủ dữ liệu. Đang hiển thị dữ liệu gần nhất đã tải — bấm làm mới để thử lại.
          </div>
        )}

        <div className="flex items-center gap-2 mb-3 pb-3 px-1" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
          <div className="overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: "none" }}>
            <PersonTabs people={people} selected={selectedPerson} onSelect={setSelectedPerson} onAddPerson={handleAddPerson} onOpenManage={() => setManagingPeople(true)} />
          </div>
          <button onClick={() => load(true)} className="inline-flex items-center gap-1.5 text-xs shrink-0" style={{ color: C.inkFaint }} title="Làm mới dữ liệu">
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{lastSynced ? `Đồng bộ ${lastSynced.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "Làm mới"}</span>
          </button>
        </div>

        <div className="flex gap-1 mb-4 sm:mb-5 px-1">
          {TABS.map(([key, label, shortLabel, Icon]) => (
            <button key={key} onClick={() => setTab(key)} className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm font-medium"
              style={{ color: tab === key ? C.green : C.inkFaint, borderBottom: tab === key ? `2px solid ${C.green}` : "2px solid transparent" }}>
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </button>
          ))}
        </div>

        <div className="px-1">
          {tab === "dashboard" && <Dashboard orders={visibleOrders} onEdit={openEdit} onGoCards={() => setTab("cards")} />}
          {tab === "orders" && <OrdersTab orders={visibleOrders} onEdit={openEdit} onDelete={deleteOrder} />}
          {tab === "cards" && (
            <CardsTab orders={visibleOrders} cardProfiles={cardProfiles} onEdit={openEdit} onTogglePaid={togglePaid} onSaveCardProfile={saveCardProfile} onDeleteCardProfile={deleteCardProfile} />
          )}
        </div>
      </div>

      {draft && (
        <OrderDrawer draft={draft} setDraft={setDraft} people={people} cardProfiles={cardProfiles} onAddCardProfile={saveCardProfile} onClose={closeDrawer} onSave={saveDraft} onDelete={deleteOrder} />
      )}
      {managingPeople && (
        <PeopleManagerDrawer people={people} orders={orders} onClose={() => setManagingPeople(false)} onDeletePerson={handleDeletePerson} onResetAll={resetAllData} />
      )}
    </div>
  );
}
