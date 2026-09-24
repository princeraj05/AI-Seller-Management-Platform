import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Store,
  Globe,
  TrendingUp,
  Boxes,
  Zap,
  CheckCircle2,
  UploadCloud,
  RefreshCw,
  FileText,
  BarChart3
} from 'lucide-react';
import { loginApi } from '../../services/authService';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('prince@seller.com');
  const [password, setPassword] = useState('Prince1234');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const res = await loginApi(email, password);
      if (res.success) {
        localStorage.setItem('authToken', res.token || 'mock-token-12345');
        if (res.user) {
          localStorage.setItem('user', JSON.stringify(res.user));
        }
        setSuccessMsg('Sign in successful! Redirecting...');
        setTimeout(() => {
          navigate('/');
        }, 800);
      } else {
        setErrorMsg(res.message || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred during sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    localStorage.setItem('authToken', 'google-mock-token-999');
    setSuccessMsg('Google sign-in successful! Redirecting...');
    setTimeout(() => {
      navigate('/');
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-slate-50 to-indigo-50/50 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Header Navigation */}
      <header className="w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-900 tracking-tight leading-tight block">
                AI Seller
              </span>
              <span className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase block -mt-1">
                Management Platform
              </span>
            </div>
          </div>

          <div className="hidden md:block h-6 w-px bg-slate-200 mx-1"></div>

          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <span>Sell Smarter.</span>
            <span>Manage Easier.</span>
            <span>Grow Faster.</span>
          </div>
        </div>

        {/* Right Navigation */}
        <div className="flex items-center gap-6">
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#about" className="hover:text-blue-600 transition-colors">About</a>
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
            <a href="#help" className="hover:text-blue-600 transition-colors">Help</a>
          </nav>
          <a
            href="#contact"
            className="px-5 py-1.5 rounded-full border border-blue-500 text-blue-600 hover:bg-blue-600 hover:text-white font-medium text-sm transition-all shadow-sm"
          >
            Contact Us
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Side: Hero Brand & Feature Showcase */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Main Title & Subtitle */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
              Manage Every Sales Channel.{' '}
              <span className="text-blue-600 inline-block">From One Place.</span>
            </h1>
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-2xl">
              Connect Amazon, Flipkart, Myntra, your own website and offline store. Create products with AI, manage inventory, sync orders and grow your business — all from one powerful dashboard.
            </p>
          </div>

          {/* Channels Pills */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white border border-slate-200/80 shadow-sm rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="font-extrabold text-slate-900 tracking-tighter text-sm">amazon</span>
            </div>

            <div className="bg-white border border-slate-200/80 shadow-sm rounded-xl px-4 py-2 flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center text-[9px] font-bold text-blue-900">f</div>
              <span className="font-bold text-blue-700 text-sm">Flipkart</span>
            </div>

            <div className="bg-white border border-slate-200/80 shadow-sm rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="font-black text-pink-600 text-sm tracking-tight">M</span>
              <span className="font-semibold text-slate-800 text-sm">Myntra</span>
            </div>

            <div className="bg-white border border-slate-200/80 shadow-sm rounded-xl px-4 py-2 flex items-center gap-2 text-slate-700 text-xs font-semibold">
              <Globe className="w-4 h-4 text-blue-500" />
              <span>Your Website</span>
            </div>

            <div className="bg-white border border-slate-200/80 shadow-sm rounded-xl px-4 py-2 flex items-center gap-2 text-slate-700 text-xs font-semibold">
              <Store className="w-4 h-4 text-indigo-500" />
              <span>Offline Store</span>
            </div>
          </div>

          {/* Interactive UI Mockup Showcase */}
          <div className="relative pt-2">
            <div className="bg-gradient-to-tr from-blue-100/60 to-indigo-100/60 p-5 rounded-3xl border border-white/60 shadow-xl backdrop-blur-sm relative overflow-hidden">
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                
                {/* 3D Box Illustration Badge */}
                <div className="md:col-span-4 bg-white/90 rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-2">
                  <div className="w-16 h-16 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 relative shadow-inner">
                    <Boxes className="w-9 h-9" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-ping"></span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-md text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                    From Local to Global
                  </div>
                </div>

                {/* AI Product Generator Card */}
                <div className="md:col-span-4 bg-white/90 rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-3">
                  <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                    <span>AI Product Generator</span>
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="bg-slate-100/80 rounded-lg p-3 flex items-center justify-center">
                    <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-bold text-xs shadow-sm">
                      👜 Bag
                    </div>
                  </div>
                  <button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[11px] font-semibold py-1.5 rounded-lg shadow-sm flex items-center justify-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>Generate with AI</span>
                  </button>
                </div>

                {/* Marketplace Feature List */}
                <div className="md:col-span-4 bg-white/90 rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-2 text-[11px]">
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-blue-50/60 text-blue-900 font-medium">
                    <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
                    <span>Auto Upload to Marketplaces</span>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-amber-50/60 text-amber-900 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Sync Inventory in Real-time</span>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-purple-50/60 text-purple-900 font-medium">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    <span>Manage Orders from All Channels</span>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-50/60 text-emerald-900 font-medium">
                    <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>AI Insights for Better Sales</span>
                  </div>
                </div>

              </div>

              {/* Total Sales floating widget */}
              <div className="mt-4 bg-white rounded-2xl p-4 shadow-md border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Total Sales</div>
                  <div className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <span>₹ 2,45,680</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                      ↑ 12%
                    </span>
                  </div>
                </div>
                {/* Bar chart mockup */}
                <div className="flex items-end gap-1.5 h-9">
                  <div className="w-2.5 bg-blue-200 rounded-t h-4"></div>
                  <div className="w-2.5 bg-blue-300 rounded-t h-6"></div>
                  <div className="w-2.5 bg-blue-400 rounded-t h-5"></div>
                  <div className="w-2.5 bg-blue-500 rounded-t h-7"></div>
                  <div className="w-2.5 bg-blue-600 rounded-t h-9"></div>
                </div>
              </div>

              {/* Annotation */}
              <div className="absolute top-3 right-6 hidden md:block">
                <span className="font-serif italic text-xs text-indigo-700 font-semibold bg-white/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-indigo-200 shadow-sm">
                  AI Powering Your Growth ↗
                </span>
              </div>

            </div>
          </div>

          {/* Bottom 5 Feature Highlights Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 text-center">
            <div className="flex flex-col items-center gap-1.5 text-slate-700">
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold leading-snug">AI Product Generation</span>
            </div>

            <div className="flex flex-col items-center gap-1.5 text-slate-700">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold leading-snug">Multi-Channel Selling</span>
            </div>

            <div className="flex flex-col items-center gap-1.5 text-slate-700">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold leading-snug">Real-time Inventory</span>
            </div>

            <div className="flex flex-col items-center gap-1.5 text-slate-700">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold leading-snug">Advanced Analytics</span>
            </div>

            <div className="flex flex-col items-center gap-1.5 text-slate-700">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold leading-snug">Grow Your Business</span>
            </div>
          </div>

        </div>

        {/* Right Side: Login Form Card */}
        <div className="lg:col-span-5 w-full flex flex-col items-center">
          
          <div className="bg-white rounded-3xl shadow-xl shadow-blue-950/5 border border-slate-100 p-8 sm:p-10 w-full max-w-md relative overflow-hidden">
            
            {/* Card Header */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                Welcome back
              </h2>
              <p className="text-sm text-slate-500 mt-2 font-medium">
                Sign in to your seller account
              </p>
            </div>

            {/* Error / Success Notifications */}
            {errorMsg && (
              <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium text-center">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium text-center">
                {successMsg}
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Email address
                </label>
                <div className="relative rounded-xl border border-slate-200 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10 transition-all bg-white">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Enter your email"
                    className="w-full pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 rounded-xl outline-none bg-transparent"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <div className="relative rounded-xl border border-slate-200 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10 transition-all bg-white">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 rounded-xl outline-none bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me & Forgot Password */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Remember me</span>
                </label>
                <a href="#forgot" className="text-blue-600 font-semibold hover:text-blue-700 hover:underline">
                  Forgot password?
                </a>
              </div>

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-blue-600/25 text-sm flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

            </form>

            {/* OR Divider */}
            <div className="relative my-6 text-center">
              <span className="bg-white px-3 text-xs font-semibold text-slate-400 relative z-10">
                OR
              </span>
              <div className="absolute inset-0 top-1/2 border-t border-slate-200"></div>
            </div>

            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              type="button"
              className="w-full border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-3 transition-colors shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.15C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.99-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.99 3.15c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Create Account Link */}
            <p className="text-center text-xs text-slate-600 font-medium mt-6">
              Don't have an account?{' '}
              <Link to="/onboarding" className="text-blue-600 font-bold hover:underline">
                Create account
              </Link>
            </p>

            {/* Green Security Banner */}
            <div className="bg-emerald-50/90 border border-emerald-100 p-3 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 font-medium mt-6 shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Secure sign-in • Your marketplace credentials are never stored here.</span>
            </div>

          </div>

          {/* Subcaption tagline with indicator */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-xs text-slate-500 font-medium italic">
              "Empowering sellers with AI to build a bigger tomorrow."
            </p>
            <div className="w-8 h-1 bg-blue-500/30 rounded-full mx-auto"></div>
          </div>

        </div>

      </main>
    </div>
  );
}
