import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Filter,
  MessageSquarePlus,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { CompanyDirectoryItem, UpdateRequestItem } from '../types.ts';

function normalizeAlphaNum(str: string): string {
  return (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function findSimilarCompanies(
  typedName: string,
  typedCode: string,
  knownCompanies: { companyCode: string; companyName: string }[]
): { companyCode: string; companyName: string; exactMatch: boolean }[] {
  const cleanTypedCode = normalizeAlphaNum(typedCode || typedName);
  const cleanTypedName = normalizeAlphaNum(typedName);
  if (cleanTypedCode.length < 3) return [];

  const matches: { companyCode: string; companyName: string; exactMatch: boolean }[] = [];
  const seen = new Set<string>();

  for (const item of knownCompanies) {
    if (seen.has(item.companyCode)) continue;
    const itemCodeClean = normalizeAlphaNum(item.companyCode);
    const itemNameClean = normalizeAlphaNum(item.companyName);

    if (item.companyCode.toUpperCase() === typedCode.trim().toUpperCase()) {
      matches.push({ ...item, exactMatch: true });
      seen.add(item.companyCode);
      continue;
    }

    const codeDist = editDistance(cleanTypedCode, itemCodeClean);
    const nameDist =
      cleanTypedName.length >= 3 && itemNameClean.length >= 3
        ? editDistance(cleanTypedName, itemNameClean)
        : 99;

    const isSubstring =
      (cleanTypedCode.length >= 4 &&
        (itemCodeClean.includes(cleanTypedCode) || cleanTypedCode.includes(itemCodeClean))) ||
      (cleanTypedName.length >= 4 &&
        (itemNameClean.includes(cleanTypedName) || cleanTypedName.includes(itemNameClean)));

    if (codeDist <= 2 || nameDist <= 2 || isSubstring) {
      matches.push({ ...item, exactMatch: false });
      seen.add(item.companyCode);
    }
  }

  return matches;
}

export function downloadCompanyCardPng(params: {
  companyName: string;
  companyCode: string;
  adminEmail: string;
  role: string;
  shift: string;
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 920;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#0D1014';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Frame
  ctx.strokeStyle = '#0070F3';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  // Header Banner
  ctx.fillStyle = '#151A21';
  ctx.fillRect(20, 20, canvas.width - 40, 88);

  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('MAINTEX OFFICIAL COMPANY ACCESS CARD (SCREENSHOT PASS)', 48, 60);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '15px sans-serif';
  ctx.fillText(
    'Share this exact Company Code with your factory staff to prevent spelling mistakes during login',
    48,
    90
  );

  // Company Name
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('COMPANY / FACTORY NAME (কোম্পানির নাম):', 48, 155);

  ctx.fillStyle = '#F1F5F9';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(params.companyName, 48, 195);

  // Company Access Code Box
  ctx.fillStyle = '#151A21';
  ctx.fillRect(48, 225, canvas.width - 96, 110);
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 225, canvas.width - 96, 110);

  ctx.fillStyle = '#10B981';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('EXACT COMPANY ACCESS CODE (লগইন করার সময় হুবহু এই কোডটি লিখুন):', 68, 258);

  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 42px monospace';
  ctx.fillText(params.companyCode, 68, 312);

  // Admin & Role Details
  ctx.fillStyle = '#F1F5F9';
  ctx.font = '17px monospace';
  ctx.fillText(`Plant Admin / User : ${params.adminEmail}`, 48, 385);
  ctx.fillText(`Assigned Role      : ${params.role}  |  Shift: ${params.shift}`, 48, 418);

  // Warning Footer
  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(
    'WARNING: বানান ভুল এড়াতে একই কোম্পানির সকল ইউজার লগইন করার সময় উপরের Company Code হুবহু ব্যবহার করুন।',
    48,
    468
  );

  const link = document.createElement('a');
  link.download = `Company-Profile-${params.companyCode}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

interface CompanyScreenshotModalProps {
  isOpen: boolean;
  companyName: string;
  companyCode: string;
  adminEmail: string;
  role: string;
  shift: string;
  onConfirmScreenshotTaken: () => void;
  onClose: () => void;
}

export const CompanyScreenshotModal: React.FC<CompanyScreenshotModalProps> = ({
  isOpen,
  companyName,
  companyCode,
  adminEmail,
  role,
  shift,
  onConfirmScreenshotTaken,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareText = `🏭 MAINTEX Official Company Login Details\n• Company Name: ${companyName}\n• Company Access Code: ${companyCode}\n• Plant Admin: ${adminEmail}\n\n⚠️ গুরুত্বপূর্ণ: লগইন করার সময় বানান ভুল এড়াতে হুবহু "${companyCode}" কোডটি কপি-পেস্ট বা টাইপ করুন, যাতে ভুলবশত নতুন কোম্পানি তৈরি না হয়।`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[#151A21] border-2 border-[#0070F3] rounded-md max-w-xl w-full p-6 space-y-5 shadow-2xl">
        {/* Top Warning Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#262F3D] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#F59E0B]/20 border border-[#F59E0B] flex items-center justify-center text-[#F59E0B] shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#F1F5F9]">
                📸 প্লান্ট এডমিনের জন্য জরুরি: এই কার্ডটির স্ক্রিনশট (Screenshot) নিন!
              </h3>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Official Company Profile & Exact Access Code Pass
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-mono-tech text-[#94A3B8] hover:text-white px-2 py-1"
          >
            ESC
          </button>
        </div>

        {/* Instruction Box explaining why screenshot is mandatory */}
        <div className="p-3.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/40 text-xs text-[#F1F5F9] space-y-1.5 leading-relaxed">
          <div className="font-bold text-[#F59E0B] flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>কেন স্ক্রিনশট নেওয়া আবশ্যক? (Prevent Duplicate Company Spelling Mistakes)</span>
          </div>
          <p className="text-[#E2E8F0]">
            আপনার কোম্পানির অন্যান্য ইঞ্জিনিয়ার, সুপারভাইজার বা স্টোর কিপার যখন তাদের মোবাইল/কম্পিউটার থেকে লগইন করবেন, তখন তারা যদি কোম্পানির কোড বা নামের বানান ভুল (Spelling Mistake) করেন, তবে ভুলবশত একই নামের আরেকটি নতুন ফাঁকা কোম্পানি তৈরি হয়ে যাবে।
          </p>
          <p className="text-[#38BDF8] font-semibold">
            তাই এখনই নিচের বক্সটির একটি স্ক্রিনশট (Screenshot) তুলে রাখুন অথবা ইমেজ ডাউনলোড করে আপনার টিমের সবাইকে পাঠিয়ে দিন।
          </p>
        </div>

        {/* Screenshot-Ready Official Pass Card */}
        <div className="bg-[#0D1014] border-2 border-[#10B981] rounded-md p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#262F3D] pb-3">
            <span className="text-xs font-mono-tech font-bold text-[#10B981] uppercase tracking-wider">
              OFFICIAL FACTORY WORKSPACE CREDENTIAL
            </span>
            <span className="text-xs font-mono-tech text-[#94A3B8]">
              {new Date().toLocaleDateString()}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-mono-tech uppercase text-[#94A3B8]">
                Company / Factory Name (কোম্পানির নাম)
              </div>
              <div className="text-lg font-bold text-[#F1F5F9] mt-0.5 break-words">
                {companyName}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-mono-tech uppercase text-[#10B981]">
                Exact Company Access Code (হুবহু এই কোড দিন)
              </div>
              <div className="text-xl font-mono-tech font-bold text-[#38BDF8] mt-0.5 tracking-wider select-all bg-[#151A21] border border-[#0070F3]/50 rounded px-3 py-1.5 inline-block">
                {companyCode}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#262F3D] text-xs">
            <div>
              <span className="text-[#94A3B8]">Plant Admin / User: </span>
              <span className="font-mono-tech text-[#F1F5F9] font-semibold">{adminEmail}</span>
            </div>
            <div>
              <span className="text-[#94A3B8]">Role & Shift: </span>
              <span className="font-semibold text-[#10B981]">{role}</span>
              <span className="text-[#64748B]"> &middot; {shift}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#1C222B] hover:bg-[#262F3D] border border-[#262F3D] text-xs font-semibold text-[#38BDF8]"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'কপি হয়েছে (Copied!)' : 'Copy Code & Login Text'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                downloadCompanyCardPng({
                  companyName,
                  companyCode,
                  adminEmail,
                  role,
                  shift,
                })
              }
              className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#1C222B] hover:bg-[#262F3D] border border-[#262F3D] text-xs font-semibold text-[#F1F5F9]"
            >
              <Download className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Download Card Image (.PNG)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onConfirmScreenshotTaken}
            className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#10B981] hover:bg-[#059669] text-[#0D1014] text-xs font-bold"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>আমি স্ক্রিনশট নিয়েছি (Screenshot Taken)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface SuperAdminCompaniesScreenProps {
  companies: CompanyDirectoryItem[];
  activeCompanyCode: string;
  superAdminEmail: string;
  isWebsiteSuperAdmin: boolean;
  onSelectCompanyProfile: (companyCode: string, companyName: string) => Promise<void>;
  onDeleteCompanyProfile: (companyCode: string, companyName: string) => Promise<void>;
  onOpenCreateCompanyModal: () => void;
  onOpenScreenshotCard: (companyCode: string, companyName: string) => void;
}

export const SuperAdminCompaniesScreen: React.FC<SuperAdminCompaniesScreenProps> = ({
  companies,
  activeCompanyCode,
  superAdminEmail,
  isWebsiteSuperAdmin,
  onSelectCompanyProfile,
  onDeleteCompanyProfile,
  onOpenCreateCompanyModal,
  onOpenScreenshotCard,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  if (!isWebsiteSuperAdmin) {
    return (
      <div className="bg-[#151A21] border border-[#EF4444]/40 rounded-md p-8 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-[#EF4444] mx-auto" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#F1F5F9]">
          শুধুমাত্র ওয়েবসাইট সুপার এডমিনের জন্য সংরক্ষিত (Super Admin Only)
        </h3>
        <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
          এই পেজটি শুধুমাত্র ওয়েবসাইটের প্রধান এডমিন ({superAdminEmail}) দেখতে পারবেন। অন্য কোনো কোম্পানির ইউজার বা প্লান্ট এডমিন এটি দেখতে পাবেন না।
        </p>
      </div>
    );
  }

  const filteredCompanies = companies.filter(
    (c) =>
      c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.companyCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.plantAdmins.some((email) => email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Detect any potential duplicate-spelled companies across the directory
  const duplicatePairs: { a: CompanyDirectoryItem; b: CompanyDirectoryItem }[] = [];
  for (let i = 0; i < companies.length; i++) {
    for (let j = i + 1; j < companies.length; j++) {
      const a = companies[i];
      const b = companies[j];
      const dist = editDistance(
        normalizeAlphaNum(a.companyCode),
        normalizeAlphaNum(b.companyCode)
      );
      if (dist > 0 && dist <= 2) {
        duplicatePairs.push({ a, b });
      }
    }
  }

  const totalUsers = companies.reduce((sum, c) => sum + c.userCount, 0);
  const totalMachines = companies.reduce((sum, c) => sum + c.machineCount, 0);
  const totalOpenBreakdowns = companies.reduce((sum, c) => sum + c.openBreakdowns, 0);

  return (
    <div className="space-y-6">
      {/* Super Admin Command Banner */}
      <div className="bg-[#151A21] border border-[#262F3D] rounded-md p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#262F3D] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#38BDF8]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#F1F5F9]">
                ওয়েবসাইট প্রধান এডমিন প্যানেল: সকল কোম্পানির পৃথক প্রোফাইল (Super Admin All-Company Directory)
              </h2>
            </div>
            <p className="text-xs text-[#94A3B8]">
              ওয়েবসাইটের প্রধান এডমিন ({superAdminEmail}) হিসেবে আপনি এখানে প্রতিটি কোম্পানির আলাদা প্রোফাইল, তাদের প্লান্ট এডমিন, মেশিন ও ইউজার সংখ্যা দেখতে এবং যেকোনো কোম্পানির প্রোফাইলে সরাসরি প্রবেশ করতে পারবেন।
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenCreateCompanyModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#0070F3] hover:bg-[#005FCC] text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>+ নতুন কোম্পানি প্রোফাইল খুলুন</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#0D1014] border border-[#262F3D] rounded p-4">
            <div className="text-xs text-[#94A3B8]">মোট কোম্পানি প্রোফাইল (Total Companies)</div>
            <div className="text-2xl font-mono-tech font-bold text-[#38BDF8] mt-1">
              {companies.length}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">
              100% Isolated Multi-Tenant Profiles
            </div>
          </div>

          <div className="bg-[#0D1014] border border-[#262F3D] rounded p-4">
            <div className="text-xs text-[#94A3B8]">সকল কোম্পানির মোট ইউজার (Total Users)</div>
            <div className="text-2xl font-mono-tech font-bold text-[#10B981] mt-1">
              {totalUsers}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">
              Plant Admins, Engineers & Staff
            </div>
          </div>

          <div className="bg-[#0D1014] border border-[#262F3D] rounded p-4">
            <div className="text-xs text-[#94A3B8]">মোট নিবন্ধিত মেশিন (Total Machines)</div>
            <div className="text-2xl font-mono-tech font-bold text-[#F1F5F9] mt-1">
              {totalMachines}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">
              Across All Factory Profiles
            </div>
          </div>

          <div className="bg-[#0D1014] border border-[#262F3D] rounded p-4">
            <div className="text-xs text-[#94A3B8]">চলমান ব্রেকডাউন (Open Breakdowns)</div>
            <div className="text-2xl font-mono-tech font-bold text-[#F59E0B] mt-1">
              {totalOpenBreakdowns}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">
              Active Maintenance Tickets
            </div>
          </div>
        </div>

        {/* Spelling Mistake / Similar Company Alert for Super Admin */}
        {duplicatePairs.length > 0 && (
          <div className="p-3.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/40 text-xs space-y-1.5">
            <div className="font-bold text-[#F59E0B] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>
                বানান সতর্কতা (Similar Company Names Detected): নিচের কোম্পানিগুলোর কোড খুবই কাছাকাছি—কোনো ইউজার বানান ভুল করে ডুপ্লিকেট প্রোফাইল খুলেছেন কিনা যাচাই করুন:
              </span>
            </div>
            <div className="space-y-1 text-[#E2E8F0] font-mono-tech">
              {duplicatePairs.map((pair, idx) => (
                <div key={idx}>
                  &bull; [{pair.a.companyName} ({pair.a.companyCode})] এবং [{pair.b.companyName} (
                  {pair.b.companyCode})]
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search & Separate Company Profile Cards */}
      <div className="bg-[#151A21] border border-[#262F3D] rounded-md p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#F1F5F9]">
              পৃথক কোম্পানি প্রোফাইল সমূহ (Individual Company Profiles)
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              {isWebsiteSuperAdmin
                ? 'যেকোনো কোম্পানির "প্রোফাইলে প্রবেশ করুন" বাটনে ক্লিক করে সেই কোম্পানির সম্পূর্ণ ড্যাশবোর্ড ও ডাটা দেখুন'
                : 'আপনার ডিভাইসে সংরক্ষিত ও নিবন্ধিত কোম্পানি প্রোফাইলসমূহ'}
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="কোম্পানির নাম, কোড বা এডমিন ইমেইল খুঁজুন..."
              className="w-full bg-[#0D1014] border border-[#262F3D] rounded pl-9 pr-3 py-2 text-xs text-[#F1F5F9]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCompanies.map((comp) => {
            const isActive = comp.companyCode === activeCompanyCode;
            return (
              <div
                key={comp.companyCode}
                className={`rounded-md border p-4 flex flex-col justify-between space-y-4 transition-all ${
                  isActive
                    ? 'bg-[#0070F3]/10 border-[#0070F3]'
                    : 'bg-[#0D1014] border-[#262F3D] hover:border-[#38BDF8]/60'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#38BDF8] shrink-0" />
                        <h4 className="text-sm font-bold text-[#F1F5F9]">{comp.companyName}</h4>
                      </div>
                      <div className="text-xs font-mono-tech text-[#38BDF8] mt-1">
                        Code: <span className="font-bold select-all">{comp.companyCode}</span>
                      </div>
                    </div>
                    {isActive && (
                      <span className="text-[10px] font-mono-tech font-bold text-[#10B981]">
                        ACTIVE PROFILE
                      </span>
                    )}
                  </div>

                  {/* Plant Admin Info */}
                  <div className="text-xs bg-[#151A21] border border-[#262F3D] rounded p-2.5 space-y-1">
                    <div className="text-[11px] text-[#94A3B8]">
                      কোম্পানি প্লান্ট এডমিন (Plant Admin):
                    </div>
                    <div className="font-mono-tech text-[#F1F5F9] truncate">
                      {comp.plantAdmins.length > 0
                        ? comp.plantAdmins.join(', ')
                        : 'Assigned on First Login'}
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-4 gap-2 text-center pt-1">
                    <div className="bg-[#151A21] rounded p-2 border border-[#262F3D]">
                      <div className="text-[10px] text-[#94A3B8]">Users</div>
                      <div className="text-xs font-mono-tech font-bold text-[#F1F5F9]">
                        {comp.userCount}
                      </div>
                    </div>
                    <div className="bg-[#151A21] rounded p-2 border border-[#262F3D]">
                      <div className="text-[10px] text-[#94A3B8]">Depts</div>
                      <div className="text-xs font-mono-tech font-bold text-[#F1F5F9]">
                        {comp.departmentCount}
                      </div>
                    </div>
                    <div className="bg-[#151A21] rounded p-2 border border-[#262F3D]">
                      <div className="text-[10px] text-[#94A3B8]">Machines</div>
                      <div className="text-xs font-mono-tech font-bold text-[#38BDF8]">
                        {comp.machineCount}
                      </div>
                    </div>
                    <div className="bg-[#151A21] rounded p-2 border border-[#262F3D]">
                      <div className="text-[10px] text-[#94A3B8]">Spares</div>
                      <div className="text-xs font-mono-tech font-bold text-[#10B981]">
                        {comp.sparePartCount}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="space-y-2.5 pt-3 border-t border-[#262F3D]">
                  {confirmDeleteCode === comp.companyCode ? (
                    <div className="p-2.5 rounded bg-[#EF4444]/15 border border-[#EF4444]/50 space-y-2">
                      <div className="text-[11px] text-[#F1F5F9] font-semibold">
                        আপনি কি নিশ্চিতভাবে <span className="text-[#EF4444] font-bold">{comp.companyName} ({comp.companyCode})</span> কোম্পানি এবং এর সকল ডাটা স্থায়ীভাবে ডিলিট করতে চান?
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCode(null)}
                          disabled={deletingCode === comp.companyCode}
                          className="px-2.5 py-1 rounded bg-[#151A21] hover:bg-[#1C222B] border border-[#262F3D] text-[11px] text-[#94A3B8]"
                        >
                          বাতিল (Cancel)
                        </button>
                        <button
                          type="button"
                          disabled={deletingCode === comp.companyCode}
                          onClick={async () => {
                            setDeletingCode(comp.companyCode);
                            try {
                              await onDeleteCompanyProfile(comp.companyCode, comp.companyName);
                            } finally {
                              setDeletingCode(null);
                              setConfirmDeleteCode(null);
                            }
                          }}
                          className="px-3 py-1 rounded bg-[#EF4444] hover:bg-[#DC2626] text-white text-[11px] font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>
                            {deletingCode === comp.companyCode
                              ? 'ডিলিট হচ্ছে...'
                              : 'হ্যাঁ, স্থায়ীভাবে ডিলিট করুন'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenScreenshotCard(comp.companyCode, comp.companyName)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#151A21] hover:bg-[#1C222B] border border-[#262F3D] text-xs text-[#94A3B8] hover:text-white"
                          title="View Screenshot Card & Code"
                        >
                          <Camera className="w-3.5 h-3.5 text-[#F59E0B]" />
                          <span>স্ক্রিনশট কার্ড</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCode(comp.companyCode)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#EF4444]/15 hover:bg-[#EF4444]/25 border border-[#EF4444]/40 text-xs font-semibold text-[#EF4444]"
                          title="এই কোম্পানি প্রোফাইল ও সকল ডাটা স্থায়ীভাবে ডিলিট করুন"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ডিলিট</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectCompanyProfile(comp.companyCode, comp.companyName)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                          isActive
                            ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                            : 'bg-[#0070F3] hover:bg-[#005FCC] text-white'
                        }`}
                      >
                        <span>
                          {isActive ? 'বর্তমান প্রোফাইল (Active)' : 'প্রোফাইলে প্রবেশ করুন'}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
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

export const REQUEST_TYPES = [
  'New Feature Request (নতুন ফিচার সংযোজন)',
  'Bug / Problem Report (ওয়েবসাইট বা WebApp-এর অসুবিধা/সমস্যা)',
  'UI / Design Improvement (ডিজাইন ও ব্যবহার সহজীকরণ)',
  'Report / Print Format Request (রিপোর্ট বা প্রিন্ট ফরম্যাট পরিবর্তন)',
  'Performance / Sync Issue (ডাটা সিঙ্ক বা গতির সমস্যা)',
  'Other Update Request (অন্যান্য আপডেট অনুরোধ)',
] as const;

export const TARGET_MODULES = [
  'Whole Webapp (সম্পূর্ণ ওয়েবসাইট / WebApp)',
  'Dashboard',
  'Asset Management (Section / Machine / Spare Part)',
  'Maintenance (Breakdown / Daily / PM)',
  'Store & Inventory',
  'Procurement & PO',
  'Users, Roles & Multi-Company Profile',
  'Reports & Analytics',
  'Documents & Instructions Book',
] as const;

export const REQUEST_PRIORITIES = [
  'Normal (সাধারণ)',
  'High (গুরুত্বপূর্ণ)',
  'Urgent / Blocker (জরুরি সমাধান প্রয়োজন)',
] as const;

export const REQUEST_STATUSES = [
  'Pending Review',
  'Under Development',
  'Completed / Live',
  'Planned',
] as const;

interface UpdateRequestsScreenProps {
  requests: UpdateRequestItem[];
  currentCompanyCode: string;
  currentCompanyName: string;
  currentUserEmail: string;
  currentUserName: string;
  currentUserRole: string;
  isWebsiteSuperAdmin: boolean;
  onSubmitUpdateRequest: (payload: {
    requestCode: string;
    companyName: string;
    senderName: string;
    senderRole: string;
    requestType: string;
    targetModule: string;
    priority: string;
    title: string;
    description: string;
  }) => Promise<void>;
  onRespondToUpdateRequest: (
    id: number,
    status: string,
    superAdminReply: string
  ) => Promise<void>;
}

export const UpdateRequestsScreen: React.FC<UpdateRequestsScreenProps> = ({
  currentCompanyCode,
  currentCompanyName,
  currentUserEmail,
  currentUserName,
  currentUserRole,
  onSubmitUpdateRequest,
}) => {
  const [requestType, setRequestType] = useState<string>(REQUEST_TYPES[0]);
  const [targetModule, setTargetModule] = useState<string>(TARGET_MODULES[0]);
  const [priority, setPriority] = useState<string>(REQUEST_PRIORITIES[0]);
  const [senderName, setSenderName] = useState<string>(
    currentUserName || currentUserEmail.split('@')[0]
  );
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submittedSuccess, setSubmittedSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    setSubmittedSuccess(null);
    try {
      const reqCode = `UPD-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      await onSubmitUpdateRequest({
        requestCode: reqCode,
        companyName: currentCompanyName,
        senderName: senderName.trim() || currentUserEmail.split('@')[0],
        senderRole: currentUserRole,
        requestType,
        targetModule,
        priority,
        title: title.trim(),
        description: description.trim(),
      });
      setTitle('');
      setDescription('');
      setSubmittedSuccess(
        `আপনার আপডেট রিকোয়েস্ট (${reqCode}) সফলভাবে পাঠানো হয়েছে। ধন্যবাদ!`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Clean Submit Request For An Update Card */}
      <div className="cmms-card rounded-md p-6 space-y-5">
        <div className="border-b border-[var(--border-color)] pb-4 space-y-1.5">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-[var(--accent-color)]" />
            <h2 className="text-base font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Request For An Update — আপডেট বা নতুন ফিচারের অনুরোধ পাঠান
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            ওয়েবসাইট বা অ্যাপ ব্যবহারে কোনো অসুবিধা হলে অথবা আপনার ফ্যাক্টরির জন্য নতুন কোনো ফিচার যুক্ত করার প্রয়োজন হলে নিচের ফরমটি পূরণ করে পাঠান।
          </p>
        </div>

        {submittedSuccess && (
          <div className="p-3.5 rounded cmms-badge-success text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{submittedSuccess}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Auto-tagged Sender Company & Role Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-3.5">
            <div>
              <div className="text-[10px] font-mono-tech uppercase text-[var(--text-secondary)]">
                প্রেরকের কোম্পানি (Company)
              </div>
              <div className="font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                {currentCompanyName} ({currentCompanyCode})
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono-tech uppercase text-[var(--text-secondary)]">
                প্রেরকের পদবী (Role)
              </div>
              <div className="font-mono-tech text-[var(--accent-text)] font-semibold mt-0.5 truncate">
                {currentUserRole}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              আপনার নাম (Your Name / Designation) *
            </label>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="আপনার নাম লিখুন"
              required
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              রিকোয়েস্টের ধরন (Request Category) *
            </label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-primary)]"
            >
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-secondary)] mb-1">
                কোন পেজ বা মডিউলের জন্য (Target Module)
              </label>
              <select
                value={targetModule}
                onChange={(e) => setTargetModule(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-primary)]"
              >
                {TARGET_MODULES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] mb-1">
                জরুরি মাত্রা (Priority)
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-primary)]"
              >
                {REQUEST_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              বিষয় / শিরোনাম (Subject / Feature or Issue Title) *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="যেমন: মেশিন ব্রেকডাউন রিপোর্টে PDF এক্সপোর্ট অপশন যুক্ত করা প্রয়োজন"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              বিস্তারিত বর্ণনা (Detailed Description) *
            </label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="কী ধরনের অসুবিধা হচ্ছে অথবা নতুন কী ফিচার কীভাবে কাজ করলে আপনার ফ্যাক্টরির জন্য সুবিধা হবে—তা এখানে বিস্তারিতভাবে লিখুন..."
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-primary)] leading-relaxed"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded bg-[var(--accent-color)] hover:opacity-95 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Send className="w-4 h-4" />
            <span>
              {submitting ? 'পাঠানো হচ্ছে...' : 'Send Request For An Update (আপডেট রিকোয়েস্ট পাঠান)'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};

