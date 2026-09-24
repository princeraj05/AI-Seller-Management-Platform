import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Store, ShoppingBag, BarChart2, Globe, Building } from 'lucide-react';
import { submitOnboardingApi } from '../../services/onboardingService';

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState('Bhartiye Crafts');
  const [ownerName, setOwnerName] = useState('Prince Kumar');
  const [mobile, setMobile] = useState('+91 98765 43210');
  const [email, setEmail] = useState('prince@seller.com');
  const [selectedCategories, setSelectedCategories] = useState(['Fashion', 'Handicrafts']);
  const [selectedChannels, setSelectedChannels] = useState(['amazon', 'flipkart', 'myntra']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const categoriesList = [
    { name: 'Fashion', desc: 'Clothing, Apparel & Accessories', icon: '👗' },
    { name: 'Electronics', desc: 'Mobiles, Gadgets & Devices', icon: '💻' },
    { name: 'Home & Kitchen', desc: 'Home Decor, Kitchen & Living', icon: '🏠' },
    { name: 'Beauty', desc: 'Personal Care & Cosmetics', icon: '💄' },
    { name: 'Grocery', desc: 'Food & Beverages', icon: '🛒' },
    { name: 'Handicrafts', desc: 'Handmade & Traditional Items', icon: '🌿' },
    { name: 'Jewelry', desc: 'Fashion & Fine Jewelry', icon: '💎' },
    { name: 'Footwear', desc: 'Shoes, Sandals & More', icon: '👟' },
  ];

  const channelsList = [
    { id: 'amazon', name: 'Amazon', desc: 'Reach millions of customers', icon: Store },
    { id: 'flipkart', name: 'Flipkart', desc: 'Grow your business across India', icon: ShoppingBag },
    { id: 'myntra', name: 'Myntra', desc: 'Tap into India’s fashion market', icon: BarChart2 },
    { id: 'website', name: 'Your Own Website', desc: 'Connect Shopify, WooCommerce', icon: Globe },
    { id: 'pos', name: 'Offline Store / POS', desc: 'Sync your offline sales', icon: Building },
  ];

  const toggleCategory = (cat) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const toggleChannel = (chId) => {
    if (selectedChannels.includes(chId)) {
      setSelectedChannels(selectedChannels.filter(c => c !== chId));
    } else {
      setSelectedChannels([...selectedChannels, chId]);
    }
  };

  const handleFinish = async () => {
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const payload = {
        businessName,
        ownerName,
        mobile,
        email,
        categories: selectedCategories,
        channels: selectedChannels,
      };

      const res = await submitOnboardingApi(payload);
      if (res.success) {
        if (res.store) {
          localStorage.setItem('store', JSON.stringify(res.store));
        }
        localStorage.setItem('onboardingCompleted', 'true');
        navigate('/');
      } else {
        setErrorMsg(res.message || 'Onboarding submission failed');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit onboarding');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full p-8">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900">AI Seller Management Platform</h1>
              <p className="text-xs text-slate-500">Business Setup Wizard</p>
            </div>
          </div>
          <div className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
            Step {step} of 4
          </div>
        </div>

        {/* Error Notification Banner */}
        {errorMsg && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium text-center">
            {errorMsg}
          </div>
        )}

        {/* Step Indicator Bar */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {['Welcome', 'Business Details', 'Business Category', 'Channel Selection'].map((stName, idx) => {
            const current = idx + 1;
            const isPassed = step > current;
            const isCurrent = step === current;
            return (
              <div key={stName} className={`border-t-4 pt-2 text-xs font-semibold ${isCurrent ? 'border-blue-600 text-blue-600' : isPassed ? 'border-emerald-500 text-emerald-600' : 'border-slate-200 text-slate-400'}`}>
                {isPassed ? '✓ ' : `${current}. `}{stName}
              </div>
            );
          })}
        </div>

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <div className="text-center py-8 space-y-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600">
              <Sparkles className="w-10 h-10" />
            </div>
            <div className="max-w-lg mx-auto space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900">Welcome to AI Seller Platform</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Set up your business in a few simple steps and start selling everywhere with the power of AI.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto pt-4 text-xs font-medium">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">✨ Create with AI</div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">🛍️ Multi-Channel Sync</div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">🔄 Real-time Inventory</div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">📈 Grow Sales Faster</div>
            </div>
            <button
              onClick={() => setStep(2)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-blue-500/20 text-xs inline-flex items-center gap-2"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Business Details */}
        {step === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Business Details</h2>
              <p className="text-xs text-slate-500">Tell us about your business so we can personalize your experience.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Owner Name *</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Number *</label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-xs font-semibold flex items-center gap-1">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Business Category */}
        {step === 3 && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Business Category</h2>
              <p className="text-xs text-slate-500">Choose the categories that best describe what you sell.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categoriesList.map((cat) => {
                const isSelected = selectedCategories.includes(cat.name);
                return (
                  <button
                    key={cat.name}
                    onClick={() => toggleCategory(cat.name)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="text-2xl mb-2">{cat.icon}</div>
                    <div className="font-bold text-xs text-slate-900">{cat.name}</div>
                    <div className="text-[11px] text-slate-500 leading-snug">{cat.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={() => setStep(4)} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-xs font-semibold flex items-center gap-1">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Channel Selection */}
        {step === 4 && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Connect Your Sales Channels</h2>
              <p className="text-xs text-slate-500">Select the platforms where you want to sell.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {channelsList.map((ch) => {
                const Icon = ch.icon;
                const isSelected = selectedChannels.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    onClick={() => toggleChannel(ch.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Icon className="w-6 h-6 text-blue-600" />
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 fill-blue-600 text-white" />}
                    </div>
                    <div className="font-bold text-xs text-slate-900">{ch.name}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{ch.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleFinish}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 disabled:opacity-70"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>Finish Setup & Open App</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
