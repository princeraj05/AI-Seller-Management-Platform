import React from 'react';
import { HelpCircle, MessageSquare, FileText, Video, Phone, Mail, CheckCircle2 } from 'lucide-react';

export default function HelpSupport() {
  return (
    <div className="space-y-6 font-sans text-xs">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Help & Support</h1>
        <p className="text-slate-500">Find answers, get support or raise a ticket. We're here to help you grow your business.</p>
      </div>

      {/* Top 4 Support Options */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <MessageSquare className="w-6 h-6 text-blue-600" />
          <h3 className="font-bold text-slate-900">Contact Support</h3>
          <p className="text-slate-500 leading-snug">Chat with our support team for instant help.</p>
          <button className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg text-xs">Start Chat →</button>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <Mail className="w-6 h-6 text-indigo-600" />
          <h3 className="font-bold text-slate-900">Raise a Ticket</h3>
          <p className="text-slate-500 leading-snug">Submit a support request and we'll get back to you.</p>
          <button className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg text-xs">Create Ticket</button>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <FileText className="w-6 h-6 text-emerald-600" />
          <h3 className="font-bold text-slate-900">Knowledge Base</h3>
          <p className="text-slate-500 leading-snug">Browse guides, tutorials and API documentation.</p>
          <button className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg text-xs">View Articles</button>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <Video className="w-6 h-6 text-purple-600" />
          <h3 className="font-bold text-slate-900">Video Tutorials</h3>
          <p className="text-slate-500 leading-snug">Watch step-by-step videos to learn quickly.</p>
          <button className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg text-xs">Watch Now</button>
        </div>
      </div>
    </div>
  );
}
