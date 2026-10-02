import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardList,
  CloudUpload,
  Cpu,
  Download,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageSquarePlus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sun,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { AuthProvider, formatCompanyCode, useAuth } from './context/AuthContext.tsx';
import {
  CompanyDirectoryItem,
  NavSectionId,
  PLANT_ROLES,
  PLANT_SHIFTS,
  PlantStateData,
  SUPER_ADMIN_EMAILS,
  normalizeShiftLabel,
} from './types.ts';
import { DashboardScreen } from './components/DashboardScreen.tsx';
import { AssetsScreen } from './components/AssetsScreen.tsx';
import { MaintenanceScreen } from './components/MaintenanceScreen.tsx';
import { ComplaintsScreen } from './components/ComplaintsScreen.tsx';
import { StoreScreen } from './components/StoreScreen.tsx';
import { ProcurementScreen } from './components/ProcurementScreen.tsx';
import {
  ActivityLogScreen,
  DocumentsScreen,
  ReportsScreen,
  UsersScreen,
} from './components/ManagementScreens.tsx';
import { InstructionsBookScreen } from './components/InstructionsBookScreen.tsx';
import {
  CompanyScreenshotModal,
  UpdateRequestsScreen,
  downloadCompanyCardPng,
  findSimilarCompanies,
} from './components/CompanyPortalScreens.tsx';
import { SuperAdminPanel } from './components/SuperAdminPanel.tsx';
import {
  applyLocalMutation,
  buildLocalCompaniesDirectory,
  isRetiredOrDeletedCompany,
  loadLocalPlantState,
  saveLocalPlantState,
} from './lib/clientFallbackStore.ts';

const INITIAL_EMPTY_STATE: PlantStateData = {
  updateRequests: [],
  departments: [],
  users: [],
  sections: [],
  machines: [],
  components: [],
  spareParts: [],
  breakdownLogs: [],
  dailyMaintenance: [],
  preventiveSchedules: [],
  machineHistory: [],
  complaints: [],
  spareStock: [],
  stockIssues: [],
  stockReceives: [],
  lowStockAlerts: [],
  requisitions: [],
  approvals: [],
  purchaseHistory: [],
  activityLogs: [],
  documents: [],
  syncedAt: new Date().toISOString(),
};

const NAV_ITEMS: { id: NavSectionId; label: string; topLabel?: string; icon: React.FC<any> }[] = [
  { id: 'dashboard', label: 'Dashboard', topLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'companies', label: 'Super Admin Panel', topLabel: 'All Companies', icon: ShieldCheck },
  { id: 'assets', label: 'Asset Management', topLabel: 'Asset Management', icon: Cpu },
  { id: 'maintenance', label: 'Maintenance', topLabel: 'Maintenance', icon: Wrench },
  { id: 'complaints', label: 'Complaints', topLabel: 'Complaints', icon: ShieldAlert },
  { id: 'store', label: 'Store & Inventory', topLabel: 'Store & Inventory', icon: Boxes },
  { id: 'procurement', label: 'Procurement', topLabel: 'Procurement', icon: ClipboardList },
  { id: 'users', label: 'Users & Roles', icon: Users },
  { id: 'activity', label: 'Activity Log', icon: Activity },
  { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'update-requests', label: 'Request For An Update', icon: MessageSquarePlus },
  { id: 'instructions', label: 'Instructions Book', icon: BookOpen },
];

const TOP_NAV_TAB_IDS: NavSectionId[] = [
  'dashboard',
  'companies',
  'assets',
  'maintenance',
  'complaints',
  'store',
  'procurement',
];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'Plant Admin': 'Full factory setup, users, departments & all modules',
  'Maintenance Engineer': 'Breakdowns, PM schedules, repairs & machine history',
  'Production Supervisor': 'Daily machine inspections, floor monitoring & maintenance coordination',
  'Store Keeper': 'Catalog spare parts, issue stock & receive GRN',
  'Procurement Officer': 'Purchase requisitions, approvals & PO tracking',
};

const SCREENSHOT_ACK_PREFIX = 'cmms_screenshot_ack_v1_';

function hasTakenScreenshotForCompany(companyCode: string): boolean {
  try {
    return localStorage.getItem(`${SCREENSHOT_ACK_PREFIX}${companyCode}`) === '1';
  } catch {
    return false;
  }
}

function markScreenshotTakenForCompany(companyCode: string) {
  try {
    localStorage.setItem(`${SCREENSHOT_ACK_PREFIX}${companyCode}`, '1');
  } catch {
    // ignore
  }
}

function FactoryMaintenanceShell() {
  const {
    user,
    loading,
    authError,
    knownGmailAccounts,
    workspaceProfile,
    savedCompanies,
    updateWorkspaceProfile,
    removeSavedCompanyProfile,
    signInWithGoogleAccountSelector,
    signInDirectWithGmail,
    switchGmailAccount,
    logout,
    authedFetch,
  } = useAuth();

  const [activeNav, setActiveNav] = useState<NavSectionId>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('cmms_ui_theme_v1');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    try {
      localStorage.setItem('cmms_ui_theme_v1', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [plantData, setPlantData] = useState<PlantStateData>(INITIAL_EMPTY_STATE);
  const [syncing, setSyncing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showLoginGuideModal, setShowLoginGuideModal] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [screenshotTarget, setScreenshotTarget] = useState<{
    companyName: string;
    companyCode: string;
  } | null>(null);
  const [customGmailHint, setCustomGmailHint] = useState('');

  // Login Screen form states for Company Profile + Role Selection
  const [loginCompanyName, setLoginCompanyName] = useState(workspaceProfile.companyName);
  const [loginCompanyCode, setLoginCompanyCode] = useState(workspaceProfile.companyCode);
  const [loginRole, setLoginRole] = useState(workspaceProfile.selectedRole || PLANT_ROLES[0]);
  const [loginShift, setLoginShift] = useState(workspaceProfile.selectedShift || PLANT_SHIFTS[0]);
  const [loginValidationMsg, setLoginValidationMsg] = useState<string | null>(null);

  // Switch Company Modal form state
  const [modalCompanyName, setModalCompanyName] = useState(workspaceProfile.companyName);
  const [modalCompanyCode, setModalCompanyCode] = useState(workspaceProfile.companyCode);
  const [modalRole, setModalRole] = useState(workspaceProfile.selectedRole || PLANT_ROLES[0]);
  const [modalShift, setModalShift] = useState(workspaceProfile.selectedShift || PLANT_SHIFTS[0]);

  const isWebsiteSuperAdmin = Boolean(
    user?.email &&
      SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === user.email!.toLowerCase())
  );

  useEffect(() => {
    if (!isWebsiteSuperAdmin && activeNav === 'companies') {
      setActiveNav('dashboard');
    }
  }, [isWebsiteSuperAdmin, activeNav]);

  // Only merge all companies across the platform when the logged-in user is Website Super Admin
  const allKnownCompanies: CompanyDirectoryItem[] = useMemo(() => {
    if (!isWebsiteSuperAdmin) {
      if (
        !workspaceProfile.companyCode ||
        isRetiredOrDeletedCompany(workspaceProfile.companyCode, workspaceProfile.companyName)
      ) {
        return [];
      }
      return [
        {
          companyCode: workspaceProfile.companyCode,
          companyName: workspaceProfile.companyName,
          plantAdmins: user?.email ? [user.email] : [],
          userCount: plantData.users.length || 1,
          departmentCount: plantData.departments.length,
          machineCount: plantData.machines.length,
          openBreakdowns: plantData.breakdownLogs.filter(
            (b) => b.status !== 'Resolved' && b.status !== 'Closed'
          ).length,
          sparePartCount: plantData.spareParts.length,
          lastActiveAt: plantData.syncedAt || new Date().toISOString(),
        },
      ];
    }

    const map = new Map<string, CompanyDirectoryItem>();
    const serverList = plantData.companyDirectory || [];
    const localList = buildLocalCompaniesDirectory();

    for (const item of serverList) {
      if (
        item.companyCode &&
        !isRetiredOrDeletedCompany(item.companyCode, item.companyName)
      ) {
        map.set(item.companyCode, item);
      }
    }
    for (const item of localList) {
      if (
        item.companyCode &&
        !map.has(item.companyCode) &&
        !isRetiredOrDeletedCompany(item.companyCode, item.companyName)
      ) {
        map.set(item.companyCode, item);
      }
    }
    for (const sc of savedCompanies) {
      if (
        sc.companyCode &&
        !map.has(sc.companyCode) &&
        !isRetiredOrDeletedCompany(sc.companyCode, sc.companyName)
      ) {
        map.set(sc.companyCode, {
          companyCode: sc.companyCode,
          companyName: sc.companyName,
          plantAdmins: [],
          userCount: 1,
          departmentCount: 0,
          machineCount: 0,
          openBreakdowns: 0,
          sparePartCount: 0,
          lastActiveAt: new Date().toISOString(),
        });
      }
    }
    if (
      workspaceProfile.companyCode &&
      !map.has(workspaceProfile.companyCode) &&
      !isRetiredOrDeletedCompany(workspaceProfile.companyCode, workspaceProfile.companyName)
    ) {
      map.set(workspaceProfile.companyCode, {
        companyCode: workspaceProfile.companyCode,
        companyName: workspaceProfile.companyName,
        plantAdmins: user?.email ? [user.email] : [],
        userCount: plantData.users.length || 1,
        departmentCount: plantData.departments.length,
        machineCount: plantData.machines.length,
        openBreakdowns: plantData.breakdownLogs.filter(
          (b) => b.status !== 'Resolved' && b.status !== 'Closed'
        ).length,
        sparePartCount: plantData.spareParts.length,
        lastActiveAt: plantData.syncedAt || new Date().toISOString(),
      });
    }
    return Array.from(map.values());
  }, [isWebsiteSuperAdmin, plantData, savedCompanies, workspaceProfile, user]);

  // Prompt Plant Admin to take a screenshot when they first log into or create a company profile
  useEffect(() => {
    if (!user) return;
    if (
      !workspaceProfile.companyCode ||
      isRetiredOrDeletedCompany(workspaceProfile.companyCode, workspaceProfile.companyName)
    ) {
      return;
    }
    const activeRole =
      plantData.currentUser?.role || workspaceProfile.selectedRole || PLANT_ROLES[0];
    if (
      activeRole.toLowerCase().includes('admin') &&
      !hasTakenScreenshotForCompany(workspaceProfile.companyCode)
    ) {
      setScreenshotTarget({
        companyName: workspaceProfile.companyName,
        companyCode: workspaceProfile.companyCode,
      });
      setShowScreenshotModal(true);
    }
  }, [user, workspaceProfile.companyCode, workspaceProfile.companyName, workspaceProfile.selectedRole, plantData.currentUser?.role]);

  const fetchPlantState = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    setApiError(null);
    try {
      const res = await authedFetch('/api/plant-state');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const localData = loadLocalPlantState(
          {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          },
          workspaceProfile
        );
        setPlantData(localData);
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to synchronize plant data');
      }
      const data: PlantStateData = await res.json();
      setPlantData(data);
      saveLocalPlantState(data, workspaceProfile.companyCode);
    } catch {
      const localData = loadLocalPlantState(
        {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        },
        workspaceProfile
      );
      setPlantData(localData);
    } finally {
      setSyncing(false);
    }
  }, [user, authedFetch, workspaceProfile]);

  useEffect(() => {
    if (user) {
      fetchPlantState();
      const interval = setInterval(fetchPlantState, 15000);
      return () => clearInterval(interval);
    }
  }, [user, fetchPlantState]);

  const handleSwitchProfileAndRole = async (updates: {
    companyName?: string;
    companyCode?: string;
    role?: string;
    shift?: string;
  }) => {
    const nextWorkspace = updateWorkspaceProfile({
      companyName: updates.companyName ?? workspaceProfile.companyName,
      companyCode: updates.companyCode ?? workspaceProfile.companyCode,
      selectedRole: updates.role ?? workspaceProfile.selectedRole,
      selectedShift: updates.shift ?? workspaceProfile.selectedShift,
    });

    // Optimistic UI update so Quick Role Switch feels instantaneous
    setPlantData((prev) => {
      const rlsScope =
        nextWorkspace.selectedRole === 'Plant Admin'
          ? 'FULL_RLS_SUPERUSER'
          : 'COMPANY_RLS_SCOPED';
      const updatedCurrentUser = prev.currentUser
        ? {
            ...prev.currentUser,
            companyCode: nextWorkspace.companyCode,
            companyName: nextWorkspace.companyName,
            role: nextWorkspace.selectedRole,
            shift: nextWorkspace.selectedShift,
            rlsPolicyLevel: rlsScope,
          }
        : undefined;
      const updatedUsers = prev.users.map((u) =>
        u.uid === user?.uid || u.email.toLowerCase() === user?.email?.toLowerCase()
          ? {
              ...u,
              companyCode: nextWorkspace.companyCode,
              companyName: nextWorkspace.companyName,
              role: nextWorkspace.selectedRole,
              shift: nextWorkspace.selectedShift,
              rlsPolicyLevel: rlsScope,
            }
          : u
      );
      return {
        ...prev,
        currentUser: updatedCurrentUser,
        users: updatedUsers,
      };
    });

    if (!user) return;
    setSyncing(true);
    setApiError(null);
    const payload = {
      uid: user.uid,
      companyCode: nextWorkspace.companyCode,
      companyName: nextWorkspace.companyName,
      role: nextWorkspace.selectedRole,
      shift: nextWorkspace.selectedShift,
    };
    try {
      const res = await authedFetch('/api/users/switch-profile', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json') || !res.ok) {
        const localUpdated = applyLocalMutation(
          '/api/users/switch-profile',
          'POST',
          payload,
          user.email || 'operator@factory.io',
          nextWorkspace.companyCode
        );
        setPlantData(localUpdated);
        return;
      }
      const freshState = await res.json();
      setPlantData(freshState);
      saveLocalPlantState(freshState, nextWorkspace.companyCode);
    } catch {
      const localUpdated = applyLocalMutation(
        '/api/users/switch-profile',
        'POST',
        payload,
        user.email || 'operator@factory.io',
        nextWorkspace.companyCode
      );
      setPlantData(localUpdated);
    } finally {
      setSyncing(false);
    }
  };

  const handleManualBackupSync = async () => {
    setSyncing(true);
    setApiError(null);
    const payload = {
      deviceLabel: navigator.userAgent.includes('Mobile')
        ? 'Mobile Phone Gmail Terminal'
        : 'Industrial Control Workstation',
    };
    try {
      const res = await authedFetch('/api/sync-backup', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json') || !res.ok) {
        const updatedLocal = applyLocalMutation(
          '/api/sync-backup',
          'POST',
          payload,
          user?.email || 'operator@factory.io',
          workspaceProfile.companyCode
        );
        setPlantData(updatedLocal);
        return;
      }
      const updated = await res.json();
      setPlantData(updated);
      saveLocalPlantState(updated, workspaceProfile.companyCode);
    } catch {
      const updatedLocal = applyLocalMutation(
        '/api/sync-backup',
        'POST',
        payload,
        user?.email || 'operator@factory.io',
        workspaceProfile.companyCode
      );
      setPlantData(updatedLocal);
    } finally {
      setSyncing(false);
    }
  };

  const mutateAndRefresh = async (url: string, method: string, payload: any) => {
    setSyncing(true);
    setApiError(null);
    try {
      const res = await authedFetch(url, {
        method,
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const updatedLocal = applyLocalMutation(
          url,
          method,
          payload,
          user?.email || 'operator@factory.io',
          workspaceProfile.companyCode
        );
        setPlantData(updatedLocal);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Operation failed');
      }
      await fetchPlantState();
    } catch {
      const updatedLocal = applyLocalMutation(
        url,
        method,
        payload,
        user?.email || 'operator@factory.io',
        workspaceProfile.companyCode
      );
      setPlantData(updatedLocal);
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteCompanyProfile = async (companyCode: string, _companyName: string) => {
    setSyncing(true);
    setApiError(null);
    try {
      removeSavedCompanyProfile(companyCode);
      const res = await authedFetch(`/api/companies/${encodeURIComponent(companyCode)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const result = await res.json().catch(() => null);
        if (result?.companyDirectory) {
          setPlantData((prev) => ({
            ...prev,
            companyDirectory: result.companyDirectory,
          }));
        }
      }
      await fetchPlantState();
    } catch {
      await fetchPlantState();
    } finally {
      setSyncing(false);
    }
  };

  const handleStartLoginWithProfile = async (emailHint?: string) => {
    const trimmedName = loginCompanyName.trim();
    const trimmedCode = formatCompanyCode(loginCompanyCode || trimmedName);
    if (!trimmedName || !trimmedCode) {
      setLoginValidationMsg('অনুগ্রহ করে প্রথমে আপনার নিজস্ব কোম্পানি বা ফ্যাক্টরির নাম ও কোড লিখুন (Please enter your Company / Factory Name & Code).');
      return;
    }
    if (isRetiredOrDeletedCompany(trimmedCode, trimmedName)) {
      setLoginValidationMsg(
        '"Default Factory" এবং "Main Industrial Factory" ডিলিট করা হয়েছে। অনুগ্রহ করে আপনার নিজস্ব ফ্যাক্টরি বা কোম্পানির আসল নাম ও কোড লিখুন।'
      );
      return;
    }
    setLoginValidationMsg(null);
    const effectiveEmail = emailHint || customGmailHint.trim() || undefined;
    await signInWithGoogleAccountSelector(effectiveEmail, {
      companyName: trimmedName,
      companyCode: trimmedCode,
      selectedRole: loginRole,
      selectedShift: loginShift,
    });
  };

  const handleDirectGmailLogin = async (emailToUse?: string) => {
    const trimmedName = loginCompanyName.trim();
    const trimmedCode = formatCompanyCode(loginCompanyCode || trimmedName);
    if (!trimmedName || !trimmedCode) {
      setLoginValidationMsg('অনুগ্রহ করে প্রথমে আপনার নিজস্ব কোম্পানি বা ফ্যাক্টরির নাম ও কোড লিখুন (Please enter your Company / Factory Name & Code).');
      return;
    }
    if (isRetiredOrDeletedCompany(trimmedCode, trimmedName)) {
      setLoginValidationMsg(
        '"Default Factory" এবং "Main Industrial Factory" ডিলিট করা হয়েছে। অনুগ্রহ করে আপনার নিজস্ব ফ্যাক্টরি বা কোম্পানির আসল নাম ও কোড লিখুন।'
      );
      return;
    }
    const targetEmail = (emailToUse || customGmailHint).trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setLoginValidationMsg('অনুগ্রহ করে নিচের Gmail বক্সে আপনার পূর্ণ Gmail ঠিকানা লিখুন (যেমন: yourname@gmail.com)।');
      return;
    }
    setLoginValidationMsg(null);
    await signInDirectWithGmail(targetEmail, {
      companyName: trimmedName,
      companyCode: trimmedCode,
      selectedRole: loginRole,
      selectedShift: loginShift,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1014] text-[#F1F5F9] flex items-center justify-center">
        <div className="bg-[#151A21] border border-[#262F3D] rounded-md p-6 flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-[#0070F3] animate-spin" />
          <span className="text-xs font-mono-tech uppercase tracking-wider">
            Initializing Industrial Maintenance Terminal...
          </span>
        </div>
      </div>
    );
  }

  // Dedicated Multi-Company Profile, Role Selector & Gmail Login Screen
  if (!user) {
    return (
      <div className="min-h-screen cmms-canvas flex flex-col justify-center items-center p-4">
        <div className="max-w-xl w-full cmms-card rounded-md p-6 space-y-5">
          <div className="border-b border-[var(--border-color)] pb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded cmms-badge-info flex items-center justify-center">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  MAINTEX
                </h1>
                <p className="text-xs text-[var(--text-secondary)] font-mono-tech">
                  MULTI-COMPANY ISOLATED WORKSPACE &bull; ROLE-BASED LOGIN
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
                title="Switch between Light Mode and Dark Mode"
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-700" />
                    <span>Dark Mode</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light Mode</span>
                  </>
                )}
              </button>
              <span className="font-mono-tech text-[10px] px-2 py-1 rounded cmms-badge-success flex items-center gap-1">
                <Lock className="w-3 h-3" /> COMPANY ISOLATED
              </span>
            </div>
          </div>

          {/* Step 1: Company / Factory Workspace Profile */}
          <div className="bg-[#0D1014] border border-[#262F3D] rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#38BDF8]">
                <Building2 className="w-4 h-4" />
                <span>১. কোম্পানি / ফ্যাক্টরি প্রোফাইল (Company Profile)</span>
              </div>
              <span className="text-[10px] font-mono-tech text-[#94A3B8]">
                PRIVATE TENANT WORKSPACE
              </span>
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              প্রতিটি কোম্পানির জন্য আলাদা প্রোফাইল থাকবে। আপনার কোম্পানির নাম ও কোড দিন—এক কোম্পানির লোক অন্য কোম্পানির কোনো তথ্য দেখতে পাবে না।
            </p>

            {savedCompanies.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono-tech uppercase text-[#94A3B8]">
                  Saved Company Profiles on This Device:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {savedCompanies.map((sc) => {
                    const isCurrent = sc.companyCode === loginCompanyCode;
                    return (
                      <button
                        key={sc.companyCode}
                        type="button"
                        onClick={() => {
                          setLoginCompanyName(sc.companyName);
                          setLoginCompanyCode(sc.companyCode);
                          if (sc.selectedRole) setLoginRole(sc.selectedRole);
                          if (sc.selectedShift) setLoginShift(sc.selectedShift);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-mono-tech border transition-colors ${
                          isCurrent
                            ? 'bg-[#0070F3]/20 border-[#0070F3] text-[#38BDF8]'
                            : 'bg-[#151A21] border-[#262F3D] text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {sc.companyName} ({sc.companyCode})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-[#94A3B8] mb-1">
                  Company / Factory Name (কোম্পানির নাম) *
                </label>
                <input
                  type="text"
                  required
                  value={loginCompanyName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLoginCompanyName(val);
                    setLoginCompanyCode(formatCompanyCode(val));
                  }}
                  placeholder="e.g. Square Textiles Ltd"
                  className="w-full bg-[#151A21] border border-[#262F3D] focus:border-[#0070F3] rounded px-3 py-2 text-xs text-[#F1F5F9]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#94A3B8] mb-1">
                  Company Access Code (কোম্পানি কোড) *
                </label>
                <input
                  type="text"
                  required
                  value={loginCompanyCode}
                  onChange={(e) => setLoginCompanyCode(formatCompanyCode(e.target.value))}
                  placeholder="e.g. SQUARE-TEXTILES"
                  className="w-full bg-[#151A21] border border-[#262F3D] focus:border-[#0070F3] rounded px-3 py-2 text-xs text-[#38BDF8] font-mono-tech"
                />
              </div>
            </div>

            {/* Duplicate Spelling Mistake Warning if similar company exists */}
            {(() => {
              const similar = findSimilarCompanies(
                loginCompanyName,
                loginCompanyCode,
                allKnownCompanies
              ).filter((m) => !m.exactMatch);
              if (similar.length === 0) return null;
              return (
                <div className="p-3 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/40 text-xs space-y-2">
                  <div className="font-bold text-[#F59E0B] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      বানান সতর্কতা (Spelling Mistake Check): কাছাকাছি নামের কোম্পানি ইতিমধ্যে রয়েছে!
                    </span>
                  </div>
                  <p className="text-[11px] text-[#E2E8F0]">
                    আপনি কি নিচের বিদ্যমান কোম্পানিতে লগইন করতে চাচ্ছেন? ভুলবশত নতুন কোম্পানি তৈরি এড়াতে নিচের সঠিক প্রোফাইলটিতে ক্লিক করুন:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {similar.map((sim) => (
                      <button
                        key={sim.companyCode}
                        type="button"
                        onClick={() => {
                          setLoginCompanyName(sim.companyName);
                          setLoginCompanyCode(sim.companyCode);
                        }}
                        className="px-2.5 py-1 rounded bg-[#151A21] hover:bg-[#0070F3]/20 border border-[#F59E0B] text-xs font-mono-tech text-[#38BDF8]"
                      >
                        Use Existing: {sim.companyName} ({sim.companyCode})
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Plant Admin Screenshot Instruction & Official Card Download */}
            <div className="p-3 rounded bg-[#0070F3]/10 border border-[#0070F3]/40 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#38BDF8]">
                  <Camera className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span>
                    প্লান্ট এডমিনের জন্য নির্দেশনা: স্ক্রিনশট (Screenshot) তুলে রাখুন!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCompanyCardPng({
                      companyName: loginCompanyName.trim() || loginCompanyCode,
                      companyCode: formatCompanyCode(loginCompanyCode || loginCompanyName),
                      adminEmail: customGmailHint.trim() || 'Plant Admin',
                      role: loginRole,
                      shift: loginShift,
                    })
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#151A21] hover:bg-[#1C222B] border border-[#262F3D] text-[11px] font-semibold text-[#10B981]"
                >
                  <Download className="w-3 h-3" />
                  <span>কার্ড ডাউনলোড (.PNG)</span>
                </button>
              </div>
              <p className="text-[11px] text-[#E2E8F0] leading-relaxed">
                কোম্পানি প্লান্ট এডমিন যখন নতুন কোম্পানি প্রোফাইল খুলবেন, তখন উপরের{' '}
                <span className="font-mono-tech font-bold text-[#38BDF8]">
                  {formatCompanyCode(loginCompanyCode || loginCompanyName)}
                </span>{' '}
                কোড ও নামের একটি <strong>স্ক্রিনশট (Screenshot)</strong> তুলে রাখুন এবং আপনার কোম্পানির সবাইকে দিন—যাতে অন্য কেউ লগইন করার সময় স্পেলিং মিস্টেক (বানান ভুল) করে একই নামের কোম্পানি বারবার তৈরি করে না ফেলে।
              </p>
            </div>
          </div>

          {/* Step 2: Select Role & Shift Before Login */}
          <div className="bg-[#0D1014] border border-[#262F3D] rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#10B981]">
                <UserCheck className="w-4 h-4" />
                <span>২. আপনার পদবী / Role নির্বাচন করুন (Select Role to Login)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PLANT_ROLES.map((roleOption) => {
                const selected = loginRole === roleOption;
                return (
                  <button
                    key={roleOption}
                    type="button"
                    onClick={() => setLoginRole(roleOption)}
                    className={`p-2.5 rounded border text-left transition-all ${
                      selected
                        ? 'bg-[#0070F3]/20 border-[#0070F3] text-[#F1F5F9]'
                        : 'bg-[#151A21] border-[#262F3D] text-[#94A3B8] hover:border-[#38BDF8]/50 hover:text-[#F1F5F9]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{roleOption}</span>
                      {selected && (
                        <span className="text-[10px] font-mono-tech px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981]">
                          SELECTED
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#94A3B8] mt-1">
                      {ROLE_DESCRIPTIONS[roleOption]}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-1">
              <label className="block text-[11px] text-[#94A3B8] mb-1">
                Duty Shift (আপনার ডিউটি শিফট)
              </label>
              <select
                value={loginShift}
                onChange={(e) => setLoginShift(e.target.value)}
                className="w-full bg-[#151A21] border border-[#262F3D] rounded px-3 py-2 text-xs text-[#F1F5F9] font-mono-tech"
              >
                {PLANT_SHIFTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loginValidationMsg && (
            <div className="p-3 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-xs text-[#F59E0B]">
              {loginValidationMsg}
            </div>
          )}

          {/* Step 3: Google Account Authentication */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              <Smartphone className="w-4 h-4 text-[#38BDF8]" />
              <span>৩. Google / Gmail দিয়ে লগইন করুন</span>
            </div>

            {knownGmailAccounts.length > 0 && (
              <div className="space-y-2">
                {knownGmailAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    onClick={() => handleStartLoginWithProfile(acc.email)}
                    className="w-full text-left p-3 rounded bg-[#0D1014] hover:bg-[#1C222B] border border-[#262F3D] hover:border-[#0070F3] transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[#0070F3]/20 border border-[#0070F3]/40 flex items-center justify-center text-[#38BDF8] font-mono-tech text-xs font-bold">
                        G
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#F1F5F9] group-hover:text-[#38BDF8]">
                          {acc.email}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          Login as {loginRole} &bull; {loginCompanyCode}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono-tech text-[#38BDF8]">Connect &rarr;</span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => handleStartLoginWithProfile()}
              className="w-full py-2.5 px-4 rounded bg-[#0070F3] hover:bg-[#005FCC] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Mail className="w-4 h-4" />
              <span>
                Sign In with Gmail as [{loginRole}] &bull; {loginCompanyCode}
              </span>
            </button>

            <div className="space-y-1.5">
              <label className="block text-[11px] text-[#94A3B8]">
                কাস্টম ডোমেইন (`maintex.ai.studio`) বা পপ-আপ ছাড়া সরাসরি লগইন করতে আপনার Gmail লিখুন:
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={customGmailHint}
                  onChange={(e) => setCustomGmailHint(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleDirectGmailLogin();
                    }
                  }}
                  placeholder="আপনার Gmail লিখুন (যেমন: user@gmail.com)..."
                  className="flex-1 bg-[#0D1014] border border-[#262F3D] rounded px-3 py-2 text-xs text-[#F1F5F9] font-mono-tech"
                />
                <button
                  type="button"
                  onClick={() => handleDirectGmailLogin()}
                  className="px-3.5 py-2 rounded bg-[#10B981] hover:bg-[#059669] text-[#0D1014] text-xs font-bold shrink-0"
                >
                  Direct Gmail Login &rarr;
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowLoginGuideModal(true)}
              className="w-full py-2 px-3 rounded bg-[#1C222B] hover:bg-[#262F3D] border border-[#262F3D] text-xs font-semibold text-[#38BDF8] flex items-center justify-center gap-2 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>Instructions Book (ব্যবহারবিধি দেখুন)</span>
            </button>
          </div>

          {authError && (
            <div className="p-3 rounded bg-[#EF4444]/15 border border-[#EF4444]/30 text-xs text-[#EF4444]">
              {authError}
            </div>
          )}
        </div>

        {showLoginGuideModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#0D1014] border border-[#262F3D] rounded-md max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
              <div className="px-6 py-4 bg-[#151A21] border-b border-[#262F3D] flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-[#F1F5F9]">
                  <BookOpen className="w-4 h-4 text-[#38BDF8]" />
                  <span>Instructions Book — ব্যবহারবিধি ও নির্দেশিকা</span>
                </div>
                <button
                  onClick={() => setShowLoginGuideModal(false)}
                  className="px-3 py-1 rounded bg-[#1C222B] hover:bg-[#262F3D] border border-[#262F3D] text-xs text-[#F1F5F9]"
                >
                  Close
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <InstructionsBookScreen />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentActiveRole =
    plantData.currentUser?.role || workspaceProfile.selectedRole || PLANT_ROLES[0];
  const currentActiveShift = normalizeShiftLabel(
    plantData.currentUser?.shift || workspaceProfile.selectedShift || PLANT_SHIFTS[0]
  );

  return (
    <div className="min-h-screen cmms-canvas flex flex-col lg:flex-row">
      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden no-print"
        />
      )}

      {/* Left Industrial Navigation Sidebar (Collapsible Desktop + Mobile Drawer) */}
      <aside
        className={`no-print bg-[var(--bg-surface)] border-r border-[var(--border-color)] shrink-0 flex flex-col justify-between transition-all duration-200 ${
          mobileMenuOpen
            ? 'fixed inset-y-0 left-0 z-50 w-72 shadow-2xl'
            : 'hidden lg:flex'
        } ${sidebarCollapsed ? 'lg:w-18' : 'lg:w-64'}`}
      >
        <div>
          {/* Brand Header */}
          <div className="h-16 px-4 border-b border-[var(--border-color)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded bg-[var(--accent-color)] flex items-center justify-center text-white font-bold shrink-0">
                <Wrench className="w-4 h-4" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-sm font-bold tracking-wider uppercase text-[var(--text-primary)] truncate">
                    MAINTEX
                  </div>
                  <div className="text-[10px] font-mono-tech text-[var(--accent-text)] truncate">
                    {workspaceProfile.companyCode || 'SELECT-COMPANY'}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              {!sidebarCollapsed && (
                <button
                  onClick={() => {
                    setModalCompanyName(workspaceProfile.companyName);
                    setModalCompanyCode(workspaceProfile.companyCode);
                    setModalRole(currentActiveRole);
                    setModalShift(workspaceProfile.selectedShift);
                    setShowCompanyModal(true);
                  }}
                  title="Switch Company / Factory Profile"
                  className="px-2 py-1 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-[10px] font-mono-tech text-[var(--accent-text)]"
                >
                  Company
                </button>
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                className="hidden lg:inline-flex p-1.5 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelLeftClose className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="lg:hidden p-1.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Company Profile Banner inside Sidebar */}
          {!sidebarCollapsed && (
            <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono-tech uppercase text-[var(--text-secondary)] flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-[var(--accent-text)]" /> Company Profile
                </span>
                <button
                  onClick={() => {
                    setModalCompanyName(workspaceProfile.companyName);
                    setModalCompanyCode(workspaceProfile.companyCode);
                    setModalRole(currentActiveRole);
                    setModalShift(workspaceProfile.selectedShift);
                    setShowCompanyModal(true);
                  }}
                  className="text-[10px] font-mono-tech text-[var(--accent-text)] hover:underline"
                >
                  Switch
                </button>
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {workspaceProfile.companyName || 'নতুন কোম্পানি প্রোফাইল নির্বাচন করুন'}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] font-mono-tech text-[var(--text-secondary)]">Role:</span>
                <select
                  value={currentActiveRole}
                  onChange={(e) => handleSwitchProfileAndRole({ role: e.target.value })}
                  className="flex-1 cmms-input rounded px-2 py-1 text-[11px] font-semibold cursor-pointer"
                >
                  {PLANT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] font-mono-tech text-[var(--text-secondary)]">
                  Shift:
                </span>
                <select
                  value={currentActiveShift}
                  onChange={(e) => handleSwitchProfileAndRole({ shift: e.target.value })}
                  className="flex-1 cmms-input rounded px-2 py-1 text-[11px] font-mono-tech font-semibold cursor-pointer"
                >
                  {PLANT_SHIFTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Core Navigation Items (Super Admin Panel visible strictly to Website Super Admin) */}
          <nav className="p-2.5 flex flex-col gap-1 overflow-y-auto">
            {NAV_ITEMS.filter((item) => item.id !== 'companies' || isWebsiteSuperAdmin).map(
              (item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`flex items-center ${
                      sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3.5 py-2.5'
                    } rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                      isActive
                        ? 'cmms-badge-info border-l-2 border-l-[var(--accent-color)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'
                      }`}
                    />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                );
              }
            )}
          </nav>
        </div>

        {/* Bottom Authenticated Gmail & RLS Card */}
        <div className="p-3.5 border-t border-[var(--border-color)] bg-[var(--bg-primary)] space-y-2.5">
          {!sidebarCollapsed ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono-tech uppercase text-[var(--text-secondary)]">
                  Active Gmail Session
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono-tech text-emerald-500">
                  <CheckCircle2 className="w-3 h-3" /> SYNCED
                </span>
              </div>
              <div className="text-xs font-mono-tech text-[var(--accent-text)] truncate">
                {user.email}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAccountModal(true)}
                  className="flex-1 py-1.5 px-2.5 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-primary)] flex items-center justify-center gap-1"
                >
                  <UserPlus className="w-3 h-3 text-[var(--accent-text)]" /> Switch Gmail
                </button>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-1.5 rounded bg-[var(--bg-secondary)] hover:bg-red-500/15 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-red-500"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => setShowAccountModal(true)}
                title={user.email || 'Switch Gmail'}
                className="p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--accent-text)]"
              >
                <Mail className="w-4 h-4" />
              </button>
              <button
                onClick={logout}
                title="Sign Out"
                className="p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-red-500"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Control Bar (Enterprise SaaS Layout: Logo + Factory Switcher, Navigation Tabs, Theme Switcher) */}
        <header className="no-print bg-[var(--bg-surface)] border-b border-[var(--border-color)] shadow-2xs">
          {/* Upper Control Row: Brand / Factory Profile Switcher + Right Action Toolbar */}
          <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile Hamburger Trigger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Sleek App Logo Badge & Factory Profile Switcher */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center text-white shadow-xs shrink-0">
                  <Wrench className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold tracking-tight text-[var(--text-heading)]">
                      MAINTEX
                    </span>
                    <span className="text-[var(--text-muted)]">&bull;</span>
                    <h1 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {NAV_ITEMS.find((n) => n.id === activeNav)?.label}
                    </h1>
                    <button
                      type="button"
                      onClick={() => {
                        setModalCompanyName(workspaceProfile.companyName);
                        setModalCompanyCode(workspaceProfile.companyCode);
                        setModalRole(currentActiveRole);
                        setModalShift(workspaceProfile.selectedShift);
                        setShowCompanyModal(true);
                      }}
                      title="Click to switch factory / company profile"
                      className="font-mono-tech text-[11px] font-semibold px-2.5 py-0.5 rounded-md cmms-badge-info hover:opacity-90 flex items-center gap-1.5 transition-opacity"
                    >
                      <Building2 className="w-3 h-3" />
                      <span>
                        {workspaceProfile.companyName} ({workspaceProfile.companyCode})
                      </span>
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] font-mono-tech hidden md:block mt-0.5">
                    Role: <strong className="text-[var(--text-primary)]">{currentActiveRole}</strong>{' '}
                    &bull; {currentActiveShift} &bull; Synced{' '}
                    {new Date(plantData.syncedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Action Toolbar + Integrated Theme Switcher (Sun/Moon Toggle) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick Role Switcher */}
              <div className="hidden sm:flex items-center gap-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <select
                  value={currentActiveRole}
                  onChange={(e) => handleSwitchProfileAndRole({ role: e.target.value })}
                  aria-label="Quick Role Switch"
                  className="bg-transparent text-xs font-semibold text-[var(--text-primary)] focus:outline-none cursor-pointer"
                >
                  {PLANT_ROLES.map((r) => (
                    <option
                      key={r}
                      value={r}
                      className="bg-[var(--bg-surface)] text-[var(--text-primary)]"
                    >
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Official Company Screenshot Card Button */}
              <button
                onClick={() => {
                  setScreenshotTarget({
                    companyName: workspaceProfile.companyName,
                    companyCode: workspaceProfile.companyCode,
                  });
                  setShowScreenshotModal(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cmms-badge-warning hover:opacity-90 text-xs font-semibold"
                title="প্লান্ট এডমিনের স্ক্রিনশট কার্ড দেখুন"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">স্ক্রিনশট কার্ড</span>
              </button>

              {/* Request For An Update Button */}
              <button
                onClick={() => setActiveNav('update-requests')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeNav === 'update-requests'
                    ? 'bg-emerald-600 text-white border border-emerald-600'
                    : 'cmms-badge-success hover:opacity-90'
                }`}
                title="ওয়েবসাইটের অসুবিধা বা নতুন ফিচার যুক্ত করার জন্য Request For An Update পাঠান"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Request Update</span>
              </button>

              {/* Instructions Book */}
              <button
                onClick={() => setActiveNav('instructions')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  activeNav === 'instructions'
                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                    : 'bg-[var(--bg-secondary)] hover:opacity-90 border-[var(--border-color)] text-[var(--accent-text)]'
                }`}
                title="Instructions Book (ব্যবহারবিধি)"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden 2xl:inline">Guide</span>
              </button>

              {/* Print Current View / PDF */}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)]"
                title="Print Current Page / Save as PDF"
              >
                <Printer className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                <span className="hidden 2xl:inline">Print</span>
              </button>

              {/* Realtime Cloud Sync */}
              <button
                onClick={handleManualBackupSync}
                disabled={syncing}
                title="Realtime Cloud & PostgreSQL Sync"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-xs font-mono-tech text-[var(--accent-text)] transition-colors"
              >
                <CloudUpload className={`w-3.5 h-3.5 ${syncing ? 'animate-bounce' : ''}`} />
                <span className="hidden lg:inline">{syncing ? 'Syncing...' : 'Sync'}</span>
              </button>

              {/* Active Gmail Account Switcher */}
              <button
                onClick={() => setShowAccountModal(true)}
                title={`Logged in as ${user.email}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs"
              >
                <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
                <span className="font-mono-tech hidden xl:inline text-[var(--text-primary)] max-w-[140px] truncate">
                  {user.email}
                </span>
              </button>

              {/* Integrated Theme Switcher (Sun/Moon Icon Toggle on Top-Right) */}
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] transition-colors"
                title="Switch between Light Mode (#F8FAFC) and Dark Mode (#0B0F17)"
                aria-label="Toggle Theme"
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Light</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Lower Control Row: Segmented Navigation Tab Bar (Deep Cobalt #2563EB Active State) */}
          <div className="px-4 sm:px-6 py-2 border-t border-[var(--border-color)] bg-[var(--bg-primary)]/60 flex items-center gap-1.5 overflow-x-auto">
            {NAV_ITEMS.filter(
              (item) =>
                TOP_NAV_TAB_IDS.includes(item.id) &&
                (item.id !== 'companies' || isWebsiteSuperAdmin)
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNav(item.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                    isActive
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-white' : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <span>{item.topLabel || item.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        {apiError && (
          <div className="mx-6 mt-4 p-3 rounded cmms-badge-critical text-xs flex items-center justify-between no-print">
            <span>{apiError}</span>
            <button onClick={() => setApiError(null)} className="underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Global Broadcast Banner System from Super Admin Panel */}
        {(plantData.globalAnnouncements || []).length > 0 && (
          <div className="mx-6 mt-4 space-y-2 no-print">
            {(plantData.globalAnnouncements || []).map((notice) => (
              <div
                key={notice.id}
                className={`px-4 py-2.5 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs ${
                  notice.severity === 'Critical'
                    ? 'cmms-badge-critical'
                    : notice.severity === 'Warning'
                    ? 'cmms-badge-warning'
                    : 'cmms-badge-info'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 shrink-0" />
                  <span>
                    <strong className="font-bold">{notice.title}:</strong> {notice.message}
                  </span>
                </div>
                <span className="text-[10px] font-mono-tech opacity-80">
                  Broadcast &bull; {notice.targetCompanyCode}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Active Screen Viewport */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {/* Official Print Header (Shown automatically when printing any page) */}
          <div className="print-only mb-6 pb-4 border-b-2 border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold uppercase tracking-wider text-slate-900">
                  {workspaceProfile.companyName} ({workspaceProfile.companyCode})
                </div>
                <div className="text-xs text-slate-600 font-mono-tech">
                  MAINTEX Industrial CMMS &bull; Module:{' '}
                  {NAV_ITEMS.find((n) => n.id === activeNav)?.label} &bull; Role:{' '}
                  {currentActiveRole} ({currentActiveShift})
                </div>
              </div>
              <div className="text-right text-xs font-mono-tech text-slate-600">
                <div>Printed: {new Date().toLocaleString()}</div>
                <div>User: {user.email}</div>
              </div>
            </div>
          </div>
          {activeNav === 'dashboard' && (
            <DashboardScreen data={plantData} onNavigate={(sec) => setActiveNav(sec)} />
          )}

          {activeNav === 'companies' && isWebsiteSuperAdmin && (
            <SuperAdminPanel
              knownCompanies={allKnownCompanies}
              activeCompanyCode={workspaceProfile.companyCode}
              superAdminEmail={user.email || 'mdmahfuj0987@gmail.com'}
              currentPlantData={plantData}
              authedFetch={authedFetch}
              onSelectCompanyWorkspace={async (companyCode, companyName) => {
                await handleSwitchProfileAndRole({
                  companyCode,
                  companyName,
                  role: currentActiveRole,
                  shift: workspaceProfile.selectedShift,
                });
                setActiveNav('dashboard');
              }}
              onDeleteCompanyProfile={handleDeleteCompanyProfile}
              onOpenCreateCompanyModal={() => {
                setModalCompanyName('');
                setModalCompanyCode('');
                setModalRole('Plant Admin');
                setModalShift(workspaceProfile.selectedShift);
                setShowCompanyModal(true);
              }}
              onOpenScreenshotCard={(companyCode, companyName) => {
                setScreenshotTarget({ companyCode, companyName });
                setShowScreenshotModal(true);
              }}
              onRespondToUpdateRequest={(id, status, superAdminReply) =>
                mutateAndRefresh(`/api/update-requests/${id}`, 'PATCH', {
                  status,
                  superAdminReply,
                })
              }
              onRefreshGlobalState={fetchPlantState}
            />
          )}

          {activeNav === 'assets' && (
            <AssetsScreen
              data={plantData}
              onCreateSection={(p) => mutateAndRefresh('/api/sections', 'POST', p)}
              onCreateMachine={(p) => mutateAndRefresh('/api/machines', 'POST', p)}
              onCreateComponent={(p) => mutateAndRefresh('/api/components', 'POST', p)}
              onCreateSparePart={(p) => mutateAndRefresh('/api/spare-parts', 'POST', p)}
            />
          )}

          {activeNav === 'maintenance' && (
            <MaintenanceScreen
              data={plantData}
              onLogBreakdown={(p) => mutateAndRefresh('/api/breakdowns', 'POST', p)}
              onUpdateBreakdownStatus={(id, status, actionTaken) =>
                mutateAndRefresh(`/api/breakdowns/${id}`, 'PATCH', { status, actionTaken })
              }
              onLogDailyMaintenance={(p) => mutateAndRefresh('/api/daily-maintenance', 'POST', p)}
              onCreatePreventiveSchedule={(p) =>
                mutateAndRefresh('/api/preventive-schedules', 'POST', p)
              }
            />
          )}

          {activeNav === 'complaints' && (
            <ComplaintsScreen
              data={plantData}
              onCreateComplaint={(p) => mutateAndRefresh('/api/complaints', 'POST', p)}
              onAdvanceWorkflow={(id, workflowStage, assignedTo, workNotes, verifiedByProduction) =>
                mutateAndRefresh(`/api/complaints/${id}/stage`, 'PATCH', {
                  workflowStage,
                  assignedTo,
                  workNotes,
                  verifiedByProduction,
                })
              }
            />
          )}

          {activeNav === 'store' && (
            <StoreScreen
              data={plantData}
              onIssueStock={(p) => mutateAndRefresh('/api/store/issue', 'POST', p)}
              onReceiveStock={(p) => mutateAndRefresh('/api/store/receive', 'POST', p)}
            />
          )}

          {activeNav === 'procurement' && (
            <ProcurementScreen
              data={plantData}
              onCreateRequisition={(p) =>
                mutateAndRefresh('/api/procurement/requisitions', 'POST', p)
              }
              onApproveRequisition={(p) =>
                mutateAndRefresh('/api/procurement/approvals', 'POST', p)
              }
            />
          )}

          {activeNav === 'users' && (
            <UsersScreen
              data={plantData}
              currentCompanyName={workspaceProfile.companyName}
              currentCompanyCode={workspaceProfile.companyCode}
              currentRole={currentActiveRole}
              onUpdateUserRole={(userId, role, departmentId, shift, rlsPolicyLevel) =>
                mutateAndRefresh(`/api/users/${userId}/role`, 'PATCH', {
                  role,
                  departmentId,
                  shift,
                  rlsPolicyLevel,
                })
              }
              onSwitchOwnRole={(role, shift) => handleSwitchProfileAndRole({ role, shift })}
              onCreateDepartment={(p) => mutateAndRefresh('/api/departments', 'POST', p)}
            />
          )}

          {activeNav === 'activity' && <ActivityLogScreen data={plantData} />}

          {activeNav === 'reports' && <ReportsScreen data={plantData} />}

          {activeNav === 'documents' && (
            <DocumentsScreen
              data={plantData}
              onCreateDocument={(p) => mutateAndRefresh('/api/documents', 'POST', p)}
            />
          )}

          {activeNav === 'update-requests' && (
            <UpdateRequestsScreen
              requests={plantData.updateRequests || []}
              currentCompanyCode={workspaceProfile.companyCode}
              currentCompanyName={workspaceProfile.companyName}
              currentUserEmail={user.email || 'operator@factory.io'}
              currentUserName={
                plantData.currentUser?.displayName ||
                user.displayName ||
                (user.email ? user.email.split('@')[0] : 'Plant Operator')
              }
              currentUserRole={currentActiveRole}
              isWebsiteSuperAdmin={isWebsiteSuperAdmin}
              onSubmitUpdateRequest={(payload) =>
                mutateAndRefresh('/api/update-requests', 'POST', payload)
              }
              onRespondToUpdateRequest={(id, status, superAdminReply) =>
                mutateAndRefresh(`/api/update-requests/${id}`, 'PATCH', {
                  status,
                  superAdminReply,
                })
              }
            />
          )}

          {activeNav === 'instructions' && (
            <InstructionsBookScreen onNavigate={(sec) => setActiveNav(sec)} />
          )}
        </main>
      </div>

      {/* Multi-Company Workspace & Role Switcher Modal */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#151A21] border border-[#262F3D] rounded-md max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#262F3D] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#F1F5F9] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#38BDF8]" />
                Multi-Factory Company Profile & Role Switcher
              </h3>
              <button
                onClick={() => setShowCompanyModal(false)}
                className="text-xs text-[#94A3B8] hover:text-white"
              >
                ESC
              </button>
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              এক কোম্পানির প্রোফাইলের তথ্য অন্য কোম্পানি দেখতে পাবে না। নতুন কোম্পানি প্রোফাইল তৈরি করতে বা অন্য কোম্পানিতে সুইচ করতে নিচে কোম্পানির নাম ও কোড দিন:
            </p>

            {savedCompanies.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono-tech uppercase text-[#94A3B8]">
                  Saved Company Profiles on Device:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {savedCompanies.map((sc) => {
                    const isCurrent = sc.companyCode === workspaceProfile.companyCode;
                    return (
                      <button
                        key={sc.companyCode}
                        type="button"
                        onClick={async () => {
                          setModalCompanyName(sc.companyName);
                          setModalCompanyCode(sc.companyCode);
                          await handleSwitchProfileAndRole({
                            companyName: sc.companyName,
                            companyCode: sc.companyCode,
                            role: sc.selectedRole || modalRole,
                            shift: sc.selectedShift || modalShift,
                          });
                          setShowCompanyModal(false);
                        }}
                        className={`p-2.5 rounded border text-left flex items-center justify-between ${
                          isCurrent
                            ? 'bg-[#0070F3]/20 border-[#0070F3] text-[#F1F5F9]'
                            : 'bg-[#0D1014] border-[#262F3D] text-[#94A3B8] hover:border-[#38BDF8]'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="text-xs font-semibold text-[#F1F5F9] truncate">
                            {sc.companyName}
                          </div>
                          <div className="text-[10px] font-mono-tech text-[#38BDF8]">
                            {sc.companyCode}
                          </div>
                        </div>
                        {isCurrent && (
                          <span className="text-[9px] font-mono-tech px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981]">
                            ACTIVE
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2 border-t border-[#262F3D] text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#94A3B8] mb-1">Company / Factory Name</label>
                  <input
                    type="text"
                    value={modalCompanyName}
                    onChange={(e) => {
                      setModalCompanyName(e.target.value);
                      setModalCompanyCode(formatCompanyCode(e.target.value));
                    }}
                    placeholder="e.g. Akij Plastics Ltd"
                    className="w-full bg-[#0D1014] border border-[#262F3D] rounded px-3 py-2 text-[#F1F5F9]"
                  />
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-1">Company Unique Code</label>
                  <input
                    type="text"
                    value={modalCompanyCode}
                    onChange={(e) => setModalCompanyCode(formatCompanyCode(e.target.value))}
                    placeholder="e.g. AKIJ-PLASTICS"
                    className="w-full bg-[#0D1014] border border-[#262F3D] rounded px-3 py-2 text-[#38BDF8] font-mono-tech"
                  />
                </div>
              </div>

              {/* Duplicate Spelling Mistake Warning inside Switch/Create Modal */}
              {(() => {
                const similar = findSimilarCompanies(
                  modalCompanyName,
                  modalCompanyCode,
                  allKnownCompanies
                ).filter((m) => !m.exactMatch);
                if (similar.length === 0) return null;
                return (
                  <div className="p-3 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/40 text-xs space-y-2">
                    <div className="font-bold text-[#F59E0B] flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        বানান সতর্কতা: কাছাকাছি নামের কোম্পানি ইতিমধ্যে নিবন্ধিত রয়েছে!
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {similar.map((sim) => (
                        <button
                          key={sim.companyCode}
                          type="button"
                          onClick={() => {
                            setModalCompanyName(sim.companyName);
                            setModalCompanyCode(sim.companyCode);
                          }}
                          className="px-2.5 py-1 rounded bg-[#151A21] hover:bg-[#0070F3]/20 border border-[#F59E0B] text-xs font-mono-tech text-[#38BDF8]"
                        >
                          Select Existing: {sim.companyName} ({sim.companyCode})
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#94A3B8] mb-1">Your Role in This Company</label>
                  <select
                    value={modalRole}
                    onChange={(e) => setModalRole(e.target.value)}
                    className="w-full bg-[#0D1014] border border-[#262F3D] rounded px-3 py-2 text-[#F1F5F9]"
                  >
                    {PLANT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-1">Shift</label>
                  <select
                    value={modalShift}
                    onChange={(e) => setModalShift(e.target.value)}
                    className="w-full bg-[#0D1014] border border-[#262F3D] rounded px-3 py-2 text-[#F1F5F9] font-mono-tech"
                  >
                    {PLANT_SHIFTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#262F3D]">
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
                  className="px-4 py-2 rounded bg-[#1C222B] text-[#94A3B8] hover:text-white"
                >
                  Cancel
                </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const finalName = modalCompanyName.trim() || modalCompanyCode.trim();
                      const finalCode = formatCompanyCode(modalCompanyCode || modalCompanyName);
                      if (!finalName || !finalCode || isRetiredOrDeletedCompany(finalCode, finalName)) {
                        setApiError(
                          '"Default Factory" এবং "Main Industrial Factory" ডিলিট করা হয়েছে। অনুগ্রহ করে আপনার নিজস্ব কোম্পানি বা ফ্যাক্টরির আসল নাম ও কোড লিখুন।'
                        );
                        return;
                      }
                      await handleSwitchProfileAndRole({
                        companyName: finalName,
                        companyCode: finalCode,
                        role: modalRole,
                        shift: modalShift,
                      });
                      setShowCompanyModal(false);
                      if (modalRole.toLowerCase().includes('admin')) {
                        setScreenshotTarget({
                          companyName: finalName,
                          companyCode: finalCode,
                        });
                        setShowScreenshotModal(true);
                      }
                    }}
                    className="px-4 py-2 rounded bg-[#0070F3] hover:bg-[#005FCC] text-white font-semibold"
                  >
                    Apply Company & Show Screenshot Card
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official Company Profile Screenshot Modal for Plant Admins */}
      <CompanyScreenshotModal
        isOpen={showScreenshotModal}
        companyName={screenshotTarget?.companyName || workspaceProfile.companyName}
        companyCode={screenshotTarget?.companyCode || workspaceProfile.companyCode}
        adminEmail={user.email || 'admin@factory.io'}
        role={currentActiveRole}
        shift={workspaceProfile.selectedShift}
        onConfirmScreenshotTaken={() => {
          const codeToAck = screenshotTarget?.companyCode || workspaceProfile.companyCode;
          markScreenshotTakenForCompany(codeToAck);
          setShowScreenshotModal(false);
        }}
        onClose={() => setShowScreenshotModal(false)}
      />

      {/* Multi-Account Gmail Switcher Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#151A21] border border-[#262F3D] rounded-md max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#262F3D] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#F1F5F9] flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#38BDF8]" />
                Multi-Account Gmail & Device Sync
              </h3>
              <button
                onClick={() => setShowAccountModal(false)}
                className="text-xs text-[#94A3B8] hover:text-white"
              >
                ESC
              </button>
            </div>

            <p className="text-xs text-[#94A3B8]">
              Select a known Gmail account from your phone/device or open the Google multi-account
              selector to switch operators with automatic real-time backup sync.
            </p>

            <div className="space-y-2">
              {knownGmailAccounts.map((acc) => {
                const isCurrent = acc.email.toLowerCase() === user.email?.toLowerCase();
                return (
                  <div
                    key={acc.email}
                    className={`p-3 rounded border flex items-center justify-between ${
                      isCurrent
                        ? 'bg-[#0070F3]/15 border-[#0070F3]'
                        : 'bg-[#0D1014] border-[#262F3D]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-mono-tech font-semibold text-[#F1F5F9]">
                        {acc.email}
                      </div>
                      <div className="text-[11px] text-[#94A3B8]">{acc.deviceSource}</div>
                    </div>
                    {isCurrent ? (
                      <span className="text-[10px] font-mono-tech px-2 py-0.5 rounded bg-[#10B981]/20 text-[#10B981]">
                        ACTIVE
                      </span>
                    ) : (
                      <button
                        onClick={async () => {
                          await switchGmailAccount(acc.email);
                          setShowAccountModal(false);
                        }}
                        className="text-xs font-mono-tech text-[#38BDF8] hover:underline"
                      >
                        Switch
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[#262F3D] flex flex-col gap-2">
              <button
                onClick={async () => {
                  await switchGmailAccount();
                  setShowAccountModal(false);
                }}
                className="w-full py-2 px-4 rounded bg-[#0070F3] hover:bg-[#005FCC] text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Choose Another Gmail Account from Device</span>
              </button>
              <button
                onClick={() => setShowAccountModal(false)}
                className="w-full py-2 px-4 rounded bg-[#1C222B] text-[#94A3B8] hover:text-white text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FactoryMaintenanceShell />
    </AuthProvider>
  );
}
