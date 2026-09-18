import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "loi-nhuan-shopee";
const STATE_KEY = "state";

function seedPeople() {
  return ["Lan", "Minh"];
}

function seedCardProfiles() {
  return [
    { id: "cp1", tenNganHang: "Vietcombank Visa", soDuoi: "4499", chuThe: "NGUYEN VAN A", chinhSach: "Hoàn 10% tối đa 300.000đ cho đơn từ 500.000đ, áp dụng đến 31/12" },
    { id: "cp2", tenNganHang: "ACB Mastercard", soDuoi: "7712", chuThe: "NGUYEN VAN A", chinhSach: "Hoàn 5% không giới hạn, cộng dồn vào cuối tháng" },
    { id: "cp3", tenNganHang: "Techcombank Visa", soDuoi: "2085", chuThe: "NGUYEN VAN A", chinhSach: "Hoàn 8% tối đa 200.000đ/tháng cho giao dịch Shopee" },
  ];
}

function seedOrders() {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (base: Date, n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };
  return [
    {
      id: "seed1", nguoiQuanLy: "Lan", tenSanPham: "Ốp lưng iPhone 15 silicone",
      soLuong: 10, giaMua: 25000, giaBan: 45000, ngayMua: iso(today),
      trangThai: "da_nhan", ghiChu: "",
      thanhToan: "cod", cardProfileId: null, tenThe: "", soTienHoan: 0, ngayHoan: "", ngaySaoKe: "", ngayThanhToan: "", daThanhToan: false,
      congTacVien: "Hà (nhờ săn hộ)", hoaHongValue: 20000,
    },
    {
      id: "seed2", nguoiQuanLy: "Lan", tenSanPham: "Tai nghe Bluetooth mini",
      soLuong: 5, giaMua: 120000, giaBan: 180000, ngayMua: iso(addDays(today, -7)),
      trangThai: "da_nhan", ghiChu: "",
      thanhToan: "the", cardProfileId: "cp1", tenThe: "Vietcombank Visa •••• 4499", soTienHoan: 27000,
      ngayHoan: iso(addDays(today, 10)), ngaySaoKe: iso(addDays(today, 5)), ngayThanhToan: iso(addDays(today, 20)), daThanhToan: false,
      congTacVien: "Tuấn (săn deal)", hoaHongValue: 45000,
    },
    {
      id: "seed3", nguoiQuanLy: "Minh", tenSanPham: "Đồng hồ thông minh mini",
      soLuong: 2, giaMua: 350000, giaBan: 480000, ngayMua: iso(addDays(today, -16)),
      trangThai: "chua_nhan", ghiChu: "",
      thanhToan: "cod", cardProfileId: null, tenThe: "", soTienHoan: 0, ngayHoan: "", ngaySaoKe: "", ngayThanhToan: "", daThanhToan: false,
      congTacVien: "", hoaHongValue: 0,
    },
    {
      id: "seed4", nguoiQuanLy: "Minh", tenSanPham: "Sạc dự phòng 10000mAh",
      soLuong: 3, giaMua: 150000, giaBan: 210000, ngayMua: iso(addDays(today, -11)),
      trangThai: "huy", ghiChu: "Khách hủy đơn trước khi giao",
      thanhToan: "cod", cardProfileId: null, tenThe: "", soTienHoan: 0, ngayHoan: "", ngaySaoKe: "", ngayThanhToan: "", daThanhToan: false,
      congTacVien: "", hoaHongValue: 0,
    },
    {
      id: "seed5", nguoiQuanLy: "Lan", tenSanPham: "Kính cường lực iPhone",
      soLuong: 20, giaMua: 8000, giaBan: 20000, ngayMua: iso(addDays(today, -37)),
      trangThai: "hoan", ghiChu: "Hàng lỗi, khách hoàn trả toàn bộ",
      thanhToan: "the", cardProfileId: "cp2", tenThe: "ACB Mastercard •••• 7712", soTienHoan: 0,
      ngayHoan: "", ngaySaoKe: iso(addDays(today, -26)), ngayThanhToan: iso(addDays(today, -11)), daThanhToan: true,
      congTacVien: "", hoaHongValue: 0,
    },
    {
      id: "seed6", nguoiQuanLy: "Minh", tenSanPham: "Chuột không dây mini",
      soLuong: 4, giaMua: 95000, giaBan: 140000, ngayMua: iso(addDays(today, -21)),
      trangThai: "da_nhan", ghiChu: "",
      thanhToan: "the", cardProfileId: "cp3", tenThe: "Techcombank Visa •••• 2085", soTienHoan: 11200,
      ngayHoan: iso(addDays(today, 2)), ngaySaoKe: iso(addDays(today, -6)), ngayThanhToan: iso(addDays(today, 5)), daThanhToan: false,
      congTacVien: "", hoaHongValue: 0,
    },
  ];
}

function seedState() {
  return { orders: seedOrders(), people: seedPeople(), cardProfiles: seedCardProfiles() };
}

export default async (req: Request, context: Context) => {
  const store = getStore(STORE_NAME, { consistency: "strong" });

  if (req.method === "GET") {
    let state = await store.get(STATE_KEY, { type: "json" });
    if (!state) {
      state = seedState();
      await store.setJSON(STATE_KEY, state);
    }
    return new Response(JSON.stringify(state), {
      headers: { "content-type": "application/json" },
    });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const state = {
      orders: Array.isArray(body.orders) ? body.orders : [],
      people: Array.isArray(body.people) ? body.people : [],
      cardProfiles: Array.isArray(body.cardProfiles) ? body.cardProfiles : [],
    };
    await store.setJSON(STATE_KEY, state);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (req.method === "DELETE") {
    const empty = { orders: [], people: [], cardProfiles: [] };
    await store.setJSON(STATE_KEY, empty);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/data",
};
