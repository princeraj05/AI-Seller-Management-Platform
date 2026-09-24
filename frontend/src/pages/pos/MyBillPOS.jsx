import React, { useState } from 'react';
import { Search, Plus, Minus, Trash2, Printer, CheckCircle2, ShoppingCart } from 'lucide-react';
import { mockProducts } from '../../utils/mockData';

export default function MyBillPOS() {
  const [cart, setCart] = useState([
    { ...mockProducts[0], qty: 1 },
    { ...mockProducts[1], qty: 2 },
  ]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [showReceipt, setShowReceipt] = useState(false);

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const updateQty = (id, delta) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }));
  };

  const removeItem = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.masterPrice * item.qty), 0);
  const tax = Math.round(subtotal * 0.05);
  const grandTotal = subtotal + tax;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans text-xs min-h-[550px]">
      {/* Left: Product Selector */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-600" /> Offline Billing POS (MyBill)
          </h1>
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold">
            Live Inventory Sync Active
          </span>
        </div>

        {/* Barcode / Name Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Scan barcode or type product name/SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
          />
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {mockProducts.map((p) => (
            <div
              key={p.id}
              onClick={() => addToCart(p)}
              className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl cursor-pointer transition-all space-y-2"
            >
              <img src={p.image} alt={p.name} className="w-full h-24 object-cover rounded-lg" />
              <div className="font-bold text-slate-900 line-clamp-1">{p.name}</div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-slate-500">{p.sku}</span>
                <span className="font-extrabold text-slate-900">₹{p.masterPrice}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Cart & Checkout */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4">
        <div>
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">Billing Cart ({cart.length})</h2>

          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto py-2 space-y-2">
            {cart.map((item) => (
              <div key={item.id} className="pt-2 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">{item.name}</div>
                  <div className="text-[11px] text-slate-500">₹{item.masterPrice} x {item.qty}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.id, -1)} className="p-1 bg-slate-100 rounded text-slate-600">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="font-bold text-slate-800">{item.qty}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="p-1 bg-slate-100 rounded text-slate-600">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeItem(item.id)} className="p-1 text-rose-500 ml-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Summary */}
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="space-y-1 text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-800">₹{subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (5%)</span>
              <span className="font-semibold text-slate-800">₹{tax}</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-slate-900 border-t border-slate-100 pt-1">
              <span>Grand Total</span>
              <span className="text-emerald-600">₹{grandTotal}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600">Payment Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {['UPI', 'Cash', 'Card'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPaymentMethod(mode)}
                  className={`py-1.5 rounded-lg border font-bold text-xs ${paymentMethod === mode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700'}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowReceipt(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl shadow-md shadow-emerald-500/20 text-xs flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Complete Order & Print Receipt
          </button>
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceipt && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="text-center space-y-1 border-b border-slate-100 pb-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-base text-slate-900">Payment Successful</h3>
              <p className="text-[11px] text-slate-500">Bill #BILL-1246 • {paymentMethod}</p>
            </div>

            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between"><span>Items ({cart.length})</span><span>₹{subtotal}</span></div>
              <div className="flex justify-between"><span>GST Tax</span><span>₹{tax}</span></div>
              <div className="flex justify-between font-bold text-xs border-t border-slate-200 pt-1"><span>Total Paid</span><span>₹{grandTotal}</span></div>
            </div>

            <button
              onClick={() => { setShowReceipt(false); setCart([]); }}
              className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg text-xs"
            >
              Done & Next Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
