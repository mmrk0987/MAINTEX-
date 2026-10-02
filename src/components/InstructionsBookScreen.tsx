import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Boxes,
  CheckCircle2,
  ClipboardList,
  CloudUpload,
  Cpu,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Mail,
  Search,
  ShieldAlert,
  Users,
  Wrench,
} from 'lucide-react';
import { NavSectionId } from '../types.ts';

interface InstructionsBookProps {
  onNavigate?: (section: NavSectionId) => void;
}

interface GuideSectionItem {
  id: NavSectionId;
  numberBn: string;
  title: string;
  icon: React.FC<any>;
  summary?: string;
  whatItShows?: string;
  intro?: string;
  bullets?: { label: string; desc: string }[];
  workflowSteps?: string[];
}

const GUIDE_SECTIONS: GuideSectionItem[] = [
  {
    id: 'dashboard',
    numberBn: '১',
    title: 'Dashboard (ড্যাশবোর্ড)',
    icon: LayoutDashboard,
    summary: 'পুরো ফ্যাক্টরির সার্বিক অবস্থা এক নজরে দেখার কমান্ড সেন্টার।',
    whatItShows:
      'বর্তমানে কয়টি মেশিনে ব্রেকডাউন চলছে (Open Breakdowns), কয়টি পার্টসের স্টক কমে গেছে (Low Stock Items), কয়টি ক্রয়ের আবেদন পেন্ডিং আছে (Pending Requisitions), এবং প্রতিটি মেশিনের হেলথ স্কোর।',
  },
  {
    id: 'assets',
    numberBn: '২',
    title: 'Asset Management (অ্যাসেট ম্যানেজমেন্ট)',
    icon: Cpu,
    intro: 'ফ্যাক্টরি সেটআপ শুরু করার জন্য সবার আগে এই ট্যাবটি ব্যবহার করবেন। এর ভেতরে ৪টি সাব-ট্যাব আছে:',
    bullets: [
      {
        label: 'Sections (+ Add Section)',
        desc: 'ফ্যাক্টরির ফ্লোর বা জোন তৈরি করা (যেমন: CNC Bay, Packaging Floor)।',
      },
      {
        label: 'Machines (+ Register Machine)',
        desc: 'কোন সেকশনে কোন মেশিন আছে তার নাম, মডেল ও সিরিয়াল নাম্বার যুক্ত করা।',
      },
      {
        label: 'Components (+ Add Component)',
        desc: 'প্রতিটি মেশিনের ভেতরের মূল অংশ (যেমন: Motor, Spindle, Hydraulic Valve, PLC) যুক্ত করা।',
      },
      {
        label: 'Spare Parts (+ Catalog Part)',
        desc: 'মেশিনের জন্য প্রয়োজনীয় খুচরা যন্ত্রাংশের নাম, দাম, মিনিমাম স্টক লেভেল ও শেলফ/বিন লোকেশন (Bin Location) তালিকাভুক্ত করা।',
      },
    ],
  },
  {
    id: 'maintenance',
    numberBn: '৩',
    title: 'Maintenance (মেইনটেন্যান্স)',
    icon: Wrench,
    intro: 'মেশিনের মেরামত ও নিয়মিত রক্ষণাবেক্ষণের জন্য ৪টি সাব-ট্যাব রয়েছে:',
    bullets: [
      {
        label: 'Breakdown Logs (+ Log Breakdown)',
        desc: 'কোনো মেশিন হঠাৎ নষ্ট হলে এখানে টিকেট খোলা হয়। মেরামত শেষ হলে স্ট্যাটাস Resolved করে দিলে মেশিনটি আবার সচল (Running) হয়ে যাবে এবং স্বয়ংক্রিয়ভাবে হিস্ট্রিতে জমা হবে।',
      },
      {
        label: 'Daily Maintenance (+ Daily Inspection)',
        desc: 'প্রতি শিফটে অপারেটরদের দৈনিক চেকলিস্ট (লুব্রিকেশন, প্রেশার, তাপমাত্রা, ভাইব্রেশন) রেকর্ড করার জায়গা।',
      },
      {
        label: 'Preventive Schedules (+ New PM Schedule)',
        desc: 'সাপ্তাহিক, মাসিক বা বাৎসরিক নির্ধারিত মেইনটেন্যান্সের শিডিউল তৈরি করা।',
      },
      {
        label: 'Machine History',
        desc: 'কোন মেশিনে কবে কী মেরামত হয়েছে এবং কী পার্টস বদলানো হয়েছে তার সম্পূর্ণ রেকর্ড এখানে অটোমেটিক জমা থাকে।',
      },
    ],
  },
  {
    id: 'store',
    numberBn: '৪',
    title: 'Store & Inventory (স্টোর ও ইনভেন্টরি)',
    icon: Boxes,
    intro: 'স্পেয়ার পার্টসের স্টক হিসাব রাখার জন্য ৪টি অংশ রয়েছে:',
    bullets: [
      {
        label: 'Spare Stock',
        desc: 'কোন পার্টস কোন র‍্যাক/বিনে (Bin Location) কতগুলো মজুদ আছে তা দেখায়।',
      },
      {
        label: 'Stock Issues (+ Issue Spare)',
        desc: 'মেরামতের কাজের জন্য স্টোর থেকে ইঞ্জিনিয়ারকে পার্টস ইস্যু করলে স্টক অটোমেটিক কমে যাবে।',
      },
      {
        label: 'Stock Receives (+ Receive Stock / GRN)',
        desc: 'সাপ্লায়ারের কাছ থেকে নতুন পার্টস স্টোরে ঢুকলে এখানে এন্ট্রি দিলে স্টক অটোমেটিক বেড়ে যাবে।',
      },
      {
        label: 'Low Stock Alerts',
        desc: 'কোনো পার্টসের সংখ্যা নির্ধারিত সীমার (Min Stock Level) নিচে নামলে এখানে স্বয়ংক্রিয়ভাবে সতর্কবার্তা (Critical / Warning) দেখাবে।',
      },
    ],
  },
  {
    id: 'procurement',
    numberBn: '৫',
    title: 'Procurement (ক্রয় ও অনুমোদন)',
    icon: ClipboardList,
    intro: 'স্টোরের মালামাল কেনার জন্য ৩টি ধাপ রয়েছে:',
    bullets: [
      {
        label: 'Requisitions (+ New Requisition)',
        desc: 'নতুন পার্টস বা মালামাল কেনার জন্য চাহিদাপত্র (PR) তৈরি করা।',
      },
      {
        label: 'Approvals',
        desc: 'পেন্ডিং রিকুইজিশনগুলো অ্যাডমিন বা ম্যানেজার Approve বা Reject করতে পারবেন। অনুমোদনের সময় সাপ্লায়ারের নাম দিলে স্বয়ংক্রিয়ভাবে Purchase Order (PO) তৈরি হয়ে যাবে।',
      },
      {
        label: 'Purchase History',
        desc: 'অনুমোদিত সব Purchase Order এবং ডেলিভারি স্ট্যাটাসের তালিকা।',
      },
    ],
  },
  {
    id: 'users',
    numberBn: '৬',
    title: 'Users & Roles (ইউজার ও রোল ম্যানেজমেন্ট)',
    icon: Users,
    summary:
      'ফ্যাক্টরির ডিপার্টমেন্ট তৈরি করা এবং যেসব ইউজার Gmail দিয়ে লগইন করেছেন তাদের পদবি (Plant Admin, Maintenance Engineer, Store Keeper, Production Supervisor), শিফট এবং RLS সিকিউরিটি পলিসি নির্ধারণ করা।',
  },
  {
    id: 'activity',
    numberBn: '৭',
    title: 'Activity Log (অ্যাক্টিভিটি লগ)',
    icon: Activity,
    summary:
      'অ্যাপের ভেতরে কে, কখন, কোন Gmail দিয়ে কোন তথ্য যোগ বা পরিবর্তন করেছেন তার সম্পূর্ণ অডিট ট্রেইল এখানে স্বয়ংক্রিয়ভাবে রেকর্ড হয়।',
  },
  {
    id: 'reports',
    numberBn: '৮',
    title: 'Reports & Analytics (রিপোর্ট ও অ্যানালিটিক্স)',
    icon: BarChart3,
    summary:
      'ফ্যাক্টরির MTTR (গড় মেরামত সময়), মেশিনের গড় হেলথ, মোট ডাউনটাইম, স্টোরের মোট আর্থিক মূল্য এবং প্রকিউরমেন্ট খরচের গ্রাফিক্যাল রিপোর্ট দেখায়।',
  },
  {
    id: 'documents',
    numberBn: '৯',
    title: 'Documents (ডকুমেন্টস)',
    icon: FileText,
    summary:
      'মেশিনের ম্যানুয়াল, ইলেকট্রিক্যাল/হাইড্রোলিক ডায়াগ্রাম, SOP এবং ISO সার্টিফিকেটের ভার্সন ও অ্যাক্সেস পারমিশন সংরক্ষণ করা (+ Register Document)।',
  },
];

export const InstructionsBookScreen: React.FC<InstructionsBookProps> = ({ onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = GUIDE_SECTIONS.filter((sec) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchTitle = sec.title.toLowerCase().includes(q);
    const matchSummary = sec.summary?.toLowerCase().includes(q);
    const matchShows = sec.whatItShows?.toLowerCase().includes(q);
    const matchIntro = sec.intro?.toLowerCase().includes(q);
    const matchBullets = sec.bullets?.some(
      (b) => b.label.toLowerCase().includes(q) || b.desc.toLowerCase().includes(q)
    );
    const matchWorkflow = sec.workflowSteps?.some((w) => w.toLowerCase().includes(q));
    return (
      matchTitle || matchSummary || matchShows || matchIntro || matchBullets || matchWorkflow
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Search */}
      <div className="bg-[#151A21] border border-[#262F3D] rounded-md p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#0070F3]/15 border border-[#0070F3]/30 text-[#38BDF8] text-xs font-mono-tech">
            <BookOpen className="w-3.5 h-3.5" />
            <span>INSTRUCTIONS BOOK &bull; ব্যবহারবিধি ও নির্দেশিকা</span>
          </div>
          <h2 className="text-lg font-bold text-[#F1F5F9]">
            MAINTEX (Factory Maintenance App)-এর প্রতিটি মেনু, অপশন এবং সেটিংসের কাজ ও ব্যবহারবিধি
          </h2>
          <p className="text-xs text-[#94A3B8]">
            ফ্যাক্টরির ইঞ্জিনিয়ার, সুপারভাইজার, স্টোর কিপার এবং অ্যাডমিনদের জন্য সম্পূর্ণ বাংলা অপারেটিং গাইড।
          </p>
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="নির্দেশিকা খুঁজুন (যেমন: Store, Breakdown)..."
            className="w-full bg-[#0D1014] border border-[#262F3D] focus:border-[#0070F3] rounded pl-9 pr-3 py-2 text-xs text-[#F1F5F9] outline-none"
          />
        </div>
      </div>

      {/* Quick Start Order Highlight Box */}
      <div className="bg-[#0070F3]/10 border border-[#0070F3]/40 rounded-md p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#38BDF8]">
          <Lightbulb className="w-4 h-4 text-[#F59E0B] shrink-0" />
          <span>নতুন ফ্যাক্টরির কাজ শুরু করার সঠিক ক্রম (Quick Start Order):</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-[#0D1014]/90 border border-[#262F3D] rounded p-3.5 flex items-start gap-3">
            <span className="w-6 h-6 rounded bg-[#0070F3] text-white font-mono-tech text-xs font-bold flex items-center justify-center shrink-0">
              1
            </span>
            <p className="text-xs text-[#F1F5F9] leading-relaxed">
              প্রথমে <strong className="text-[#38BDF8]">Users &amp; Roles</strong> বা{' '}
              <strong className="text-[#38BDF8]">Asset Management &rarr; Sections</strong> থেকে সেকশন
              তৈরি করুন।
            </p>
          </div>
          <div className="bg-[#0D1014]/90 border border-[#262F3D] rounded p-3.5 flex items-start gap-3">
            <span className="w-6 h-6 rounded bg-[#0070F3] text-white font-mono-tech text-xs font-bold flex items-center justify-center shrink-0">
              2
            </span>
            <p className="text-xs text-[#F1F5F9] leading-relaxed">
              এরপর <strong className="text-[#38BDF8]">Asset Management &rarr; Machines</strong> থেকে
              মেশিন এবং <strong className="text-[#38BDF8]">Spare Parts</strong> থেকে পার্টস যুক্ত করুন।
            </p>
          </div>
          <div className="bg-[#0D1014]/90 border border-[#262F3D] rounded p-3.5 flex items-start gap-3">
            <span className="w-6 h-6 rounded bg-[#0070F3] text-white font-mono-tech text-xs font-bold flex items-center justify-center shrink-0">
              3
            </span>
            <p className="text-xs text-[#F1F5F9] leading-relaxed">
              এরপর থেকে নিয়মিত <strong className="text-[#38BDF8]">Maintenance</strong>,{' '}
              <strong className="text-[#38BDF8]">Complaints</strong>,{' '}
              <strong className="text-[#38BDF8]">Store</strong>, এবং{' '}
              <strong className="text-[#38BDF8]">Procurement</strong> ব্যবহার করতে পারবেন।
            </p>
          </div>
        </div>
      </div>

      {/* Part 1: Header & Sidebar Controls */}
      <div className="bg-[#151A21] border border-[#262F3D] rounded-md p-5 space-y-4">
        <div className="border-b border-[#262F3D] pb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#F1F5F9]">
            ১. লগইন ও অ্যাকাউন্ট সেটিংস (Header &amp; Sidebar Controls)
          </h3>
          <span className="text-[11px] font-mono-tech text-[#38BDF8]">AUTH &amp; CLOUD SYNC</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0D1014] border border-[#262F3D] rounded p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#38BDF8]">
              <Mail className="w-4 h-4 text-[#0070F3]" />
              <span>Sign In / Switch Gmail (বাম নিচে ও ডান উপরে)</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              আপনার ডিভাইসের যেকোনো Gmail দিয়ে লগইন করতে বা একাধিক Gmail অ্যাকাউন্টের মধ্যে পরিবর্তন
              (Switch) করতে এটি ব্যবহার করা হয়।
            </p>
          </div>

          <div className="bg-[#0D1014] border border-[#262F3D] rounded p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#38BDF8]">
              <CloudUpload className="w-4 h-4 text-[#10B981]" />
              <span>Realtime Backup Sync (উপরে ডান পাশে)</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              অ্যাপটি প্রতি ১৫ সেকেন্ডে অটোমেটিক ডাটাবেসের সাথে সিঙ্ক হয়। তবে আপনি যেকোনো মুহূর্তে
              ম্যানুয়ালি সাথে সাথে ক্লাউড ব্যাকআপ সিঙ্ক করতে চাইলে এই বাটনে ক্লিক করবেন।
            </p>
          </div>
        </div>
      </div>

      {/* Part 2: 10 Core Sections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#F1F5F9]">
            ২. ১০টি মূল সেকশনের কাজ ও ব্যবহারবিধি
          </h3>
          <span className="text-xs font-mono-tech text-[#94A3B8]">
            মোট সেকশন: {filteredSections.length}টি
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div
                key={sec.id}
                className="bg-[#151A21] border border-[#262F3D] hover:border-[#0070F3]/60 transition-colors rounded-md p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3 border-b border-[#262F3D] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded bg-[#0070F3]/15 border border-[#0070F3]/40 flex items-center justify-center text-[#38BDF8] shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono-tech uppercase text-[#38BDF8]">
                          সেকশন {sec.numberBn}
                        </span>
                        <h4 className="text-sm font-bold text-[#F1F5F9]">{sec.title}</h4>
                      </div>
                    </div>

                    {onNavigate && (
                      <button
                        onClick={() => onNavigate(sec.id)}
                        className="px-2.5 py-1 rounded bg-[#1C222B] hover:bg-[#0070F3] text-[#38BDF8] hover:text-white border border-[#262F3D] text-[11px] font-mono-tech flex items-center gap-1 transition-colors shrink-0"
                      >
                        <span>ওপেন করুন</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {sec.summary && (
                    <div className="text-xs text-[#F1F5F9] leading-relaxed">
                      <span className="font-semibold text-[#38BDF8]">কাজ: </span>
                      {sec.summary}
                    </div>
                  )}

                  {sec.whatItShows && (
                    <div className="text-xs text-[#94A3B8] leading-relaxed bg-[#0D1014] border border-[#262F3D] rounded p-3">
                      <span className="font-semibold text-[#F1F5F9]">কী দেখায়: </span>
                      {sec.whatItShows}
                    </div>
                  )}

                  {sec.intro && (
                    <p className="text-xs font-semibold text-[#94A3B8]">{sec.intro}</p>
                  )}

                  {sec.bullets && (
                    <div className="space-y-2">
                      {sec.bullets.map((b, idx) => (
                        <div
                          key={idx}
                          className="bg-[#0D1014] border border-[#262F3D] rounded p-3 text-xs space-y-1"
                        >
                          <div className="font-mono-tech font-semibold text-[#38BDF8] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#0070F3] shrink-0" />
                            <span>{b.label}:</span>
                          </div>
                          <p className="text-[#94A3B8] leading-relaxed pl-5">{b.desc}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {sec.workflowSteps && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {sec.workflowSteps.map((step, idx) => (
                        <div
                          key={idx}
                          className="bg-[#0D1014] border border-[#262F3D] rounded p-2.5 flex items-center gap-2.5 text-xs"
                        >
                          <span className="w-5 h-5 rounded bg-[#0070F3]/20 border border-[#0070F3]/40 text-[#38BDF8] font-mono-tech text-[11px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-[#F1F5F9]">{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
