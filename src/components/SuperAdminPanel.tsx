import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  HardDriveDownload,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  MessageSquarePlus,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  UserX,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  ActivityLogItem,
  CompanyDirectoryItem,
  CompanySubscriptionConfig,
  EmailBroadcastAttachment,
  EmailBroadcastLogItem,
  GlobalAnnouncementItem,
  OFFICIAL_SENDER_EMAIL,
  OFFICIAL_SENDER_NAME,
  PLANT_ROLES,
  PLANT_SHIFTS,
  PlantStateData,
  PlantUser,
  SubscriptionPlanTier,
  SuperAdminOverviewData,
} from '../types.ts';
import {
  buildMergedSuperAdminOverview,
  createLocalAnnouncement,
  deleteLocalAnnouncement,
  loadLocalPlantState,
  recordLocalBackupTimestamp,
  recordLocalEmailBroadcast,
  toggleLocalAnnouncement,
  updateLocalCompanySubscription,
  updateLocalSuperAdminUser,
} from '../lib/clientFallbackStore.ts';
import {
  getAccessToken,
  getConnectedSenderEmail,
  googleSignIn,
  initAuth,
  sendMassEmailWithGmailApi,
} from '../lib/firebase.ts';

export type SuperAdminTabId =
  | 'overview'
  | 'email-broadcast'
  | 'users'
  | 'companies'
  | 'subscriptions'
  | 'health'
  | 'audit'
  | 'announcements';

const SUPER_ADMIN_ROLE_OPTIONS = [
  'System Admin',
  'Plant Manager',
  ...PLANT_ROLES,
  'Operator',
] as const;

const PLAN_PRESETS: Record<
  SubscriptionPlanTier,
  { maxMachines: number; maxUsers: number; maxStoreItems: number; description: string }
> = {
  Free: {
    maxMachines: 15,
    maxUsers: 10,
    maxStoreItems: 150,
    description: 'For single-floor pilot workshops & small teams',
  },
  Pro: {
    maxMachines: 75,
    maxUsers: 40,
    maxStoreItems: 750,
    description: 'For mid-sized manufacturing plants & multi-shift teams',
  },
  Enterprise: {
    maxMachines: 250,
    maxUsers: 100,
    maxStoreItems: 2000,
    description: 'For large-scale industrial complexes with full RBAC & audit',
  },
};

function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

interface SuperAdminPanelProps {
  knownCompanies: CompanyDirectoryItem[];
  activeCompanyCode: string;
  superAdminEmail: string;
  currentPlantData: PlantStateData;
  authedFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onSelectCompanyWorkspace: (companyCode: string, companyName: string) => void;
  onDeleteCompanyProfile: (companyCode: string, companyName: string) => Promise<void> | void;
  onOpenCreateCompanyModal: () => void;
  onOpenScreenshotCard: (companyCode: string, companyName: string) => void;
  onRespondToUpdateRequest: (id: number, status: string, superAdminReply: string) => Promise<void> | void;
  onRefreshGlobalState: () => Promise<void> | void;
}

export const SuperAdminPanel: React.FC<SuperAdminPanelProps> = ({
  knownCompanies,
  activeCompanyCode,
  superAdminEmail,
  currentPlantData,
  authedFetch,
  onSelectCompanyWorkspace,
  onDeleteCompanyProfile,
  onOpenCreateCompanyModal,
  onOpenScreenshotCard,
  onRespondToUpdateRequest,
  onRefreshGlobalState,
}) => {
  const [activeTab, setActiveTab] = useState<SuperAdminTabId>('overview');
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'info' | 'warning';
    text: string;
  } | null>(null);

  const [serverOverview, setServerOverview] = useState<SuperAdminOverviewData | null>(null);
  const [liveUptimeOffset, setLiveUptimeOffset] = useState(0);

  // Filters & search states
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState('ALL');

  const [companySearch, setCompanySearch] = useState('');
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  // Inspect Workspace Modal state
  const [inspectTarget, setInspectTarget] = useState<{
    companyCode: string;
    companyName: string;
    data: PlantStateData | null;
    loading: boolean;
  } | null>(null);

  // Edit User Modal state
  const [editingUser, setEditingUser] = useState<PlantUser | null>(null);
  const [editUserRole, setEditUserRole] = useState('');
  const [editUserShift, setEditUserShift] = useState('');
  const [editUserStatus, setEditUserStatus] = useState<'Active' | 'Suspended'>('Active');
  const [savingUser, setSavingUser] = useState(false);

  // Edit Subscription Modal / Inline state
  const [editingSub, setEditingSub] = useState<CompanySubscriptionConfig | null>(null);
  const [savingSub, setSavingSub] = useState(false);

  // Backup state
  const [backupTargetCompany, setBackupTargetCompany] = useState('ALL');
  const [runningBackup, setRunningBackup] = useState(false);

  // Audit Log filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCompanyFilter, setAuditCompanyFilter] = useState('ALL');
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');

  // Announcements & Update Requests state
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeSeverity, setNoticeSeverity] = useState<'Info' | 'Warning' | 'Critical'>('Info');
  const [noticeTargetCompany, setNoticeTargetCompany] = useState('ALL');
  const [publishingNotice, setPublishingNotice] = useState(false);

  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});

  // Mass Email Broadcast state
  const [emailTargetMode, setEmailTargetMode] = useState<
    'ALL_USERS' | 'BY_COMPANY' | 'BY_ROLE' | 'MANUAL'
  >('ALL_USERS');
  const [emailCompanyFilter, setEmailCompanyFilter] = useState('ALL');
  const [emailRoleFilter, setEmailRoleFilter] = useState('Plant Admin');
  const [excludeSuspendedUsers, setExcludeSuspendedUsers] = useState(true);
  const [manualSelectedEmails, setManualSelectedEmails] = useState<string[]>([]);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState('');
  const [extraRecipientEmails, setExtraRecipientEmails] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBodyText, setEmailBodyText] = useState('');
  const [emailAttachments, setEmailAttachments] = useState<EmailBroadcastAttachment[]>([]);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [confirmSendModalOpen, setConfirmSendModalOpen] = useState(false);
  const [sendingEmailBroadcast, setSendingEmailBroadcast] = useState(false);
  const [lastDispatchedRecord, setLastDispatchedRecord] = useState<{
    record: EmailBroadcastLogItem;
    attachments: EmailBroadcastAttachment[];
  } | null>(null);
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(null);
  const [connectedSenderEmail, setConnectedSenderEmail] = useState<string | null>(null);
  const [needsGmailAuth, setNeedsGmailAuth] = useState<boolean>(true);
  const [isConnectingGmail, setIsConnectingGmail] = useState<boolean>(false);
  const [gmailSendError, setGmailSendError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (u, token) => {
        setGmailAccessToken(token);
        setConnectedSenderEmail(u.email || getConnectedSenderEmail() || OFFICIAL_SENDER_EMAIL);
        setNeedsGmailAuth(false);
      },
      () => {
        getAccessToken().then((tok) => {
          if (tok) {
            setGmailAccessToken(tok);
            setConnectedSenderEmail(getConnectedSenderEmail() || OFFICIAL_SENDER_EMAIL);
            setNeedsGmailAuth(false);
          } else {
            setGmailAccessToken(null);
            setNeedsGmailAuth(true);
          }
        });
      }
    );
    return () => unsubscribe();
  }, []);

  const handleConnectGmailSender = async (loginHint = OFFICIAL_SENDER_EMAIL) => {
    setIsConnectingGmail(true);
    setGmailSendError(null);
    try {
      const result = await googleSignIn(loginHint);
      if (result) {
        setGmailAccessToken(result.accessToken);
        setConnectedSenderEmail(result.user.email || loginHint);
        setNeedsGmailAuth(false);
        setStatusBanner({
          type: 'success',
          text: `Gmail API Sender Connected: "${OFFICIAL_SENDER_NAME}" <${result.user.email || loginHint}> — Ready to send real emails & attachments!`,
        });
      }
    } catch (err: any) {
      console.error('Failed to connect Gmail sender:', err);
      setGmailSendError(
        err?.message ||
          'Google Sign-In popup was closed or blocked. Please click "Sign in with Google" and allow Gmail send permission.'
      );
    } finally {
      setIsConnectingGmail(false);
    }
  };

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await authedFetch('/api/super-admin/overview');
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') && res.ok) {
        const data: SuperAdminOverviewData = await res.json();
        setServerOverview(data);
        setLiveUptimeOffset(0);
      }
    } catch {
      // Fallback handled by buildMergedSuperAdminOverview
    } finally {
      setLoadingOverview(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveUptimeOffset((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const overview: SuperAdminOverviewData = useMemo(
    () => buildMergedSuperAdminOverview(serverOverview, knownCompanies, currentPlantData),
    [serverOverview, knownCompanies, currentPlantData]
  );

  // Filtered Users
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return overview.allUsers.filter((u) => {
      const matchSearch =
        !q ||
        u.email.toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.companyName || '').toLowerCase().includes(q) ||
        (u.companyCode || '').toLowerCase().includes(q);
      const matchRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
      const uStatus = u.status || (u.rlsPolicyLevel === 'SUSPENDED_ACCOUNT' ? 'Suspended' : 'Active');
      const matchStatus = userStatusFilter === 'ALL' || uStatus === userStatusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [overview.allUsers, userSearch, userRoleFilter, userStatusFilter]);

  // Filtered Companies
  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return overview.companies;
    return overview.companies.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.companyCode.toLowerCase().includes(q) ||
        (c.plantLocation || '').toLowerCase().includes(q) ||
        c.plantAdmins.some((em) => em.toLowerCase().includes(q))
    );
  }, [overview.companies, companySearch]);

  // Filtered Audit Logs
  const filteredLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return overview.globalLogs.filter((l) => {
      const matchSearch =
        !q ||
        l.actorEmail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.entityCode.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        (l.companyCode || '').toLowerCase().includes(q);
      const matchCompany =
        auditCompanyFilter === 'ALL' || (l.companyCode || '') === auditCompanyFilter;
      const matchModule = auditModuleFilter === 'ALL' || l.module === auditModuleFilter;
      return matchSearch && matchCompany && matchModule;
    });
  }, [overview.globalLogs, auditSearch, auditCompanyFilter, auditModuleFilter]);

  const auditModules = useMemo(() => {
    const set = new Set<string>();
    for (const l of overview.globalLogs) {
      if (l.module) set.add(l.module);
    }
    return Array.from(set);
  }, [overview.globalLogs]);

  // Handlers
  const handleInspectWorkspace = async (company: CompanyDirectoryItem) => {
    setInspectTarget({
      companyCode: company.companyCode,
      companyName: company.companyName,
      data: null,
      loading: true,
    });
    try {
      const res = await authedFetch(
        `/api/super-admin/inspect/${encodeURIComponent(company.companyCode)}`
      );
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') && res.ok) {
        const state: PlantStateData = await res.json();
        setInspectTarget({
          companyCode: company.companyCode,
          companyName: company.companyName,
          data: state,
          loading: false,
        });
        return;
      }
    } catch {
      // fallback to local
    }
    const localState = loadLocalPlantState(undefined, {
      companyCode: company.companyCode,
      companyName: company.companyName,
    });
    setInspectTarget({
      companyCode: company.companyCode,
      companyName: company.companyName,
      data: localState,
      loading: false,
    });
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    try {
      updateLocalSuperAdminUser(
        editingUser.id,
        editingUser.email,
        editingUser.companyCode || activeCompanyCode,
        {
          role: editUserRole,
          shift: editUserShift,
          status: editUserStatus,
        }
      );
      await authedFetch(`/api/super-admin/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editUserRole,
          shift: editUserShift,
          status: editUserStatus,
          companyCode: editingUser.companyCode,
          companyName: editingUser.companyName,
        }),
      }).catch(() => null);

      setStatusBanner({
        type: 'success',
        text: `Updated user ${editingUser.email} — Role: ${editUserRole}, Status: ${editUserStatus}`,
      });
      setEditingUser(null);
      await fetchOverview();
      await onRefreshGlobalState();
    } finally {
      setSavingUser(false);
    }
  };

  const handleQuickToggleUserSuspend = async (u: PlantUser) => {
    const currentStatus =
      u.status || (u.rlsPolicyLevel === 'SUSPENDED_ACCOUNT' ? 'Suspended' : 'Active');
    const nextStatus: 'Active' | 'Suspended' =
      currentStatus === 'Suspended' ? 'Active' : 'Suspended';

    updateLocalSuperAdminUser(u.id, u.email, u.companyCode || activeCompanyCode, {
      role: u.role,
      shift: u.shift,
      status: nextStatus,
    });
    await authedFetch(`/api/super-admin/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        role: u.role,
        shift: u.shift,
        status: nextStatus,
        companyCode: u.companyCode,
        companyName: u.companyName,
      }),
    }).catch(() => null);

    setStatusBanner({
      type: nextStatus === 'Suspended' ? 'warning' : 'success',
      text: `User account ${u.email} is now marked as [${nextStatus}].`,
    });
    await fetchOverview();
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    setSavingSub(true);
    try {
      updateLocalCompanySubscription(editingSub.companyCode, editingSub);
      await authedFetch(
        `/api/super-admin/subscriptions/${encodeURIComponent(editingSub.companyCode)}`,
        {
          method: 'PUT',
          body: JSON.stringify(editingSub),
        }
      ).catch(() => null);

      setStatusBanner({
        type: 'success',
        text: `Saved [${editingSub.plan}] subscription & usage limits for ${editingSub.companyName} (${editingSub.companyCode}).`,
      });
      setEditingSub(null);
      await fetchOverview();
    } finally {
      setSavingSub(false);
    }
  };

  const handleTriggerManualBackup = async (targetCode: string) => {
    setRunningBackup(true);
    try {
      recordLocalBackupTimestamp();
      let backupPayload: any = null;
      try {
        const res = await authedFetch('/api/super-admin/backup', {
          method: 'POST',
          body: JSON.stringify({ companyCode: targetCode }),
        });
        if (res.ok) {
          backupPayload = await res.json();
        }
      } catch {
        // fallback below
      }

      if (!backupPayload) {
        backupPayload = {
          backupTimestamp: new Date().toISOString(),
          scope: targetCode,
          triggeredBy: superAdminEmail,
          data:
            targetCode === 'ALL'
              ? overview
              : loadLocalPlantState(undefined, { companyCode: targetCode }),
        };
      }

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `MAINTEX-BACKUP-${targetCode}-${dateStamp}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setStatusBanner({
        type: 'success',
        text: `Manual database backup completed & downloaded for [${targetCode === 'ALL' ? 'All Registered Companies' : targetCode}].`,
      });
      await fetchOverview();
    } finally {
      setRunningBackup(false);
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeMessage.trim()) return;
    setPublishingNotice(true);
    try {
      createLocalAnnouncement(
        {
          title: noticeTitle,
          message: noticeMessage,
          severity: noticeSeverity,
          targetCompanyCode: noticeTargetCompany,
        },
        superAdminEmail
      );
      await authedFetch('/api/super-admin/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: noticeTitle,
          message: noticeMessage,
          severity: noticeSeverity,
          targetCompanyCode: noticeTargetCompany,
        }),
      }).catch(() => null);

      setNoticeTitle('');
      setNoticeMessage('');
      setStatusBanner({
        type: 'success',
        text: `Global broadcast notice published to [${noticeTargetCompany === 'ALL' ? 'All Active Users' : noticeTargetCompany}].`,
      });
      await fetchOverview();
      await onRefreshGlobalState();
    } finally {
      setPublishingNotice(false);
    }
  };

  const handleToggleAnnouncement = async (item: GlobalAnnouncementItem) => {
    const nextActive = !item.active;
    toggleLocalAnnouncement(item.id, nextActive);
    await authedFetch(`/api/super-admin/announcements/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: nextActive }),
    }).catch(() => null);
    await fetchOverview();
    await onRefreshGlobalState();
  };

  const handleDeleteAnnouncement = async (id: number) => {
    deleteLocalAnnouncement(id);
    await authedFetch(`/api/super-admin/announcements/${id}`, {
      method: 'DELETE',
    }).catch(() => null);
    await fetchOverview();
    await onRefreshGlobalState();
  };

  const handleExportAuditLogsCsv = () => {
    const headers = [
      'ID',
      'Timestamp',
      'CompanyCode',
      'ActorEmail',
      'ActorRole',
      'Module',
      'Action',
      'EntityCode',
      'Details',
      'IP/Session',
    ];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.createdAt,
      l.companyCode || 'GLOBAL',
      l.actorEmail,
      l.actorRole,
      l.module,
      l.action,
      l.entityCode,
      `"${(l.details || '').replace(/"/g, '""')}"`,
      l.ipAddress || 'Verified Token',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MAINTEX-GLOBAL-AUDIT-LOG-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingUpdateCount = overview.updateRequests.filter(
    (r) => r.status === 'Pending Review' || r.status === 'In Progress'
  ).length;

  const activeBroadcastCount = overview.announcements.filter((a) => a.active).length;

  // Deduplicated unique user emails across all companies for Mass Email Broadcast
  const uniqueDirectoryUsers = useMemo(() => {
    const map = new Map<string, PlantUser>();
    for (const u of overview.allUsers) {
      const cleanEmail = (u.email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) continue;
      if (!map.has(cleanEmail)) {
        map.set(cleanEmail, u);
      }
    }
    return Array.from(map.values());
  }, [overview.allUsers]);

  const eligibleRecipientUsers = useMemo(() => {
    return uniqueDirectoryUsers.filter((u) => {
      const isSusp = u.status === 'Suspended' || u.rlsPolicyLevel === 'SUSPENDED_ACCOUNT';
      if (excludeSuspendedUsers && isSusp) return false;
      if (emailTargetMode === 'BY_COMPANY') {
        if (emailCompanyFilter !== 'ALL' && u.companyCode !== emailCompanyFilter) return false;
      } else if (emailTargetMode === 'BY_ROLE') {
        if (u.role !== emailRoleFilter) return false;
      }
      return true;
    });
  }, [
    uniqueDirectoryUsers,
    excludeSuspendedUsers,
    emailTargetMode,
    emailCompanyFilter,
    emailRoleFilter,
  ]);

  const finalRecipientEmails = useMemo(() => {
    const baseEmails =
      emailTargetMode === 'MANUAL'
        ? manualSelectedEmails
        : eligibleRecipientUsers.map((u) => u.email.trim().toLowerCase());
    const extraList = extraRecipientEmails
      .split(/[,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes('@'));
    return Array.from(new Set([...baseEmails, ...extraList]));
  }, [emailTargetMode, manualSelectedEmails, eligibleRecipientUsers, extraRecipientEmails]);

  const targetAudienceSummaryLabel = useMemo(() => {
    if (emailTargetMode === 'ALL_USERS') return 'All Active Registered Users';
    if (emailTargetMode === 'BY_COMPANY')
      return emailCompanyFilter === 'ALL'
        ? 'All Companies'
        : `Company: ${emailCompanyFilter}`;
    if (emailTargetMode === 'BY_ROLE') return `Role: ${emailRoleFilter}`;
    return `Manual Selection (${finalRecipientEmails.length} Users)`;
  }, [emailTargetMode, emailCompanyFilter, emailRoleFilter, finalRecipientEmails.length]);

  const handleAttachmentFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const filesArray = Array.from(fileList);
    const readPromises = filesArray.map(
      (file) =>
        new Promise<EmailBroadcastAttachment>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            const base64Data = result.includes(',') ? result.split(',')[1] : result;
            resolve({
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              base64Data,
            });
          };
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsDataURL(file);
        })
    );
    try {
      const loaded = await Promise.all(readPromises);
      setEmailAttachments((prev) => [...prev, ...loaded]);
    } catch {
      setStatusBanner({
        type: 'warning',
        text: 'Could not read one or more attached files. Please try again.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadEmlFile = (
    record: EmailBroadcastLogItem,
    attachmentsToEmbed: EmailBroadcastAttachment[] = []
  ) => {
    const boundary = `----=_MaintexBoundary_${Date.now()}`;
    const lines: string[] = [
      `From: "${record.senderName}" <${record.senderEmail}>`,
      `To: "${record.senderName}" <${record.senderEmail}>`,
      `Bcc: ${record.recipientEmails.join(', ')}`,
      `Subject: ${record.subject}`,
      `Date: ${new Date(record.sentAt).toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      record.bodyText,
      '',
      '---',
      `${record.senderName}`,
      `Official Email: ${record.senderEmail}`,
      '',
    ];

    for (const att of attachmentsToEmbed) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${att.mimeType}; name="${att.name}"`);
      lines.push(`Content-Disposition: attachment; filename="${att.name}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push('');
      lines.push(att.base64Data);
      lines.push('');
    }

    lines.push(`--${boundary}--`);
    const blob = new Blob([lines.join('\r\n')], { type: 'message/rfc822;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.broadcastCode}-MAINTEX-ADMINISTRATION.eml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildGmailComposeUrl = (
    recipients: string[],
    subject: string,
    bodyText: string,
    attachmentNames: string[] = []
  ) => {
    const attachmentNote =
      attachmentNames.length > 0
        ? `\n\n[সংযুক্ত ফাইল / Attached Files: ${attachmentNames.join(', ')}]`
        : '';
    const fullFooter = `\n\n---\n${OFFICIAL_SENDER_NAME}\nOfficial Email: ${OFFICIAL_SENDER_EMAIL}`;
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      tf: '1',
      authuser: OFFICIAL_SENDER_EMAIL,
      to: OFFICIAL_SENDER_EMAIL,
      bcc: recipients.join(','),
      su: subject,
      body: `${bodyText}${attachmentNote}${fullFooter}`,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  };

  const handleConfirmAndSendMassEmail = async () => {
    if (!emailSubject.trim() || !emailBodyText.trim() || finalRecipientEmails.length === 0) {
      return;
    }
    setSendingEmailBroadcast(true);
    setGmailSendError(null);
    const currentAttachments = [...emailAttachments];
    try {
      let activeToken = gmailAccessToken || (await getAccessToken());
      let activeSenderEmail =
        connectedSenderEmail || getConnectedSenderEmail() || OFFICIAL_SENDER_EMAIL;

      if (!activeToken) {
        try {
          const signInResult = await googleSignIn(OFFICIAL_SENDER_EMAIL);
          if (signInResult?.accessToken) {
            activeToken = signInResult.accessToken;
            activeSenderEmail = signInResult.user.email || OFFICIAL_SENDER_EMAIL;
            setGmailAccessToken(activeToken);
            setConnectedSenderEmail(activeSenderEmail);
            setNeedsGmailAuth(false);
          }
        } catch (authErr: any) {
          setGmailSendError(
            authErr?.message ||
              'Gmail permission is required to send emails directly. Please click "Sign in with Google" and check the "Send email on your behalf" permission box.'
          );
          setSendingEmailBroadcast(false);
          return;
        }
      }

      if (!activeToken) {
        setGmailSendError(
          'Gmail OAuth access token unavailable. Please click "Sign in with Google" first to authorize sending.'
        );
        setSendingEmailBroadcast(false);
        return;
      }

      // Send real email with attachments via Official Gmail API (users.messages.send)
      let gmailMessageId = '';
      try {
        const gmailRes = await sendMassEmailWithGmailApi({
          accessToken: activeToken,
          senderName: OFFICIAL_SENDER_NAME,
          senderEmail: activeSenderEmail,
          recipientEmails: finalRecipientEmails,
          subject: emailSubject.trim(),
          bodyText: emailBodyText.trim(),
          attachments: currentAttachments,
        });
        gmailMessageId = gmailRes.id;
      } catch (apiErr: any) {
        const msg = apiErr?.message || 'Gmail API request failed';
        // If token expired (401/403), clear token so user can re-authorize cleanly
        if (
          msg.includes('401') ||
          msg.includes('403') ||
          msg.toLowerCase().includes('insufficient') ||
          msg.toLowerCase().includes('unauthenticated')
        ) {
          setGmailAccessToken(null);
          setNeedsGmailAuth(true);
        }
        setGmailSendError(
          `Gmail API Delivery Failed: ${msg}. Please click "Sign in with Google" to grant Gmail Send permission and try again.`
        );
        setSendingEmailBroadcast(false);
        return;
      }

      let serverRecord: EmailBroadcastLogItem | null = null;
      try {
        const res = await authedFetch('/api/super-admin/email-broadcast', {
          method: 'POST',
          body: JSON.stringify({
            subject: emailSubject.trim(),
            bodyText: emailBodyText.trim(),
            targetAudienceLabel: targetAudienceSummaryLabel,
            recipientEmails: finalRecipientEmails,
            attachments: currentAttachments,
            gmailMessageId,
            senderEmailOverride: activeSenderEmail,
          }),
        });
        if (res.ok) {
          serverRecord = await res.json();
        }
      } catch {
        // fallback handled below
      }

      const localRec = recordLocalEmailBroadcast(
        {
          subject: emailSubject.trim(),
          bodyText: emailBodyText.trim(),
          targetAudienceLabel: targetAudienceSummaryLabel,
          recipientEmails: finalRecipientEmails,
          attachments: currentAttachments.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
          })),
          deliveryMode: 'GMAIL_API_SENT',
          gmailMessageId,
          senderEmailOverride: activeSenderEmail,
          broadcastCode: serverRecord?.broadcastCode,
        },
        superAdminEmail
      );

      const finalRecord = serverRecord || localRec;
      setLastDispatchedRecord({
        record: finalRecord,
        attachments: currentAttachments,
      });
      setConfirmSendModalOpen(false);
      setStatusBanner({
        type: 'success',
        text: `ইমেইল সফলভাবে পাঠানো হয়েছে! Sent via Gmail API from "${OFFICIAL_SENDER_NAME} <${activeSenderEmail}>" to ${finalRecord.recipientCount} user(s) in BCC (Message ID: ${gmailMessageId}).`,
      });
      setEmailSubject('');
      setEmailBodyText('');
      setEmailAttachments([]);
      await fetchOverview();
      await onRefreshGlobalState();
    } finally {
      setSendingEmailBroadcast(false);
    }
  };

  const SIDEBAR_TABS: {
    id: SuperAdminTabId;
    label: string;
    subtitle: string;
    icon: React.FC<any>;
    badge?: number | string;
  }[] = [
    {
      id: 'overview',
      label: 'Super Admin Dashboard',
      subtitle: 'Executive KPIs & Controls',
      icon: LayoutDashboard,
    },
    {
      id: 'email-broadcast',
      label: 'Mass Email Broadcast',
      subtitle: 'MAINTEX ADMINISTRATION Mail',
      icon: Mail,
      badge: uniqueDirectoryUsers.length,
    },
    {
      id: 'users',
      label: 'All User Email List',
      subtitle: 'Roles, Status & Suspension',
      icon: Users,
      badge: overview.allUsers.length,
    },
    {
      id: 'companies',
      label: 'All Company List',
      subtitle: 'Full Info & Workspace Bypass',
      icon: Building2,
      badge: overview.companies.length,
    },
    {
      id: 'subscriptions',
      label: 'Subscription & Usage',
      subtitle: 'Plans, Expiry & Quotas',
      icon: CreditCard,
    },
    {
      id: 'health',
      label: 'System Health & DB',
      subtitle: 'Cloud SQL, Uptime & Backups',
      icon: Database,
      badge: overview.systemHealth.totalRecordsCount,
    },
    {
      id: 'audit',
      label: 'Global Audit Trail',
      subtitle: 'Cross-Company Action Logs',
      icon: Activity,
      badge: overview.globalLogs.length,
    },
    {
      id: 'announcements',
      label: 'Announcements & Approvals',
      subtitle: 'Broadcasts & Update Requests',
      icon: Megaphone,
      badge: pendingUpdateCount > 0 ? pendingUpdateCount : activeBroadcastCount,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Top Executive Super Admin Header Bar */}
      <div className="cmms-card rounded-md p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-tech uppercase px-2.5 py-0.5 rounded cmms-badge-info font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              MAINTEX SUPER ADMIN PANEL
            </span>
            <span className="text-xs font-mono-tech text-[var(--text-secondary)]">
              Root Account: <strong className="text-[var(--text-primary)]">{superAdminEmail}</strong>
            </span>
            <span aria-hidden="true" className="text-[var(--text-muted)]">
              &bull;
            </span>
            <span className="text-xs font-mono-tech text-[var(--text-secondary)]">
              DB Status:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {overview.systemHealth.dbStatus}
              </strong>
            </span>
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Multi-Company Command Center, Access Control &amp; Cloud SQL Governance
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('email-broadcast')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Send Mass Email ({uniqueDirectoryUsers.length})</span>
          </button>
          <button
            type="button"
            onClick={fetchOverview}
            disabled={loadingOverview}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
            <span>Refresh Telemetry</span>
          </button>
          <button
            type="button"
            onClick={() => handleTriggerManualBackup('ALL')}
            disabled={runningBackup}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-xs font-semibold text-[var(--accent-text)] transition-colors whitespace-nowrap"
          >
            <HardDriveDownload className="w-3.5 h-3.5" />
            <span>{runningBackup ? 'Backing Up...' : 'Backup All Companies (.JSON)'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateCompanyModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-[var(--accent-color)] hover:opacity-95 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Company Workspace</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-3.5 rounded-md flex items-center justify-between gap-3 text-xs font-medium ${
            statusBanner.type === 'warning'
              ? 'cmms-badge-warning'
              : statusBanner.type === 'info'
              ? 'cmms-badge-info'
              : 'cmms-badge-success'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs underline font-mono-tech"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dedicated Responsive Super Admin Sidebar + Main Viewport Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Dedicated Super Admin Sidebar (3 Columns on Desktop) */}
        <aside className="lg:col-span-3 cmms-card rounded-md p-3 space-y-1.5">
          <div className="px-2.5 py-2 border-b border-[var(--border-color)] flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Admin Controls
            </span>
            <span className="text-[11px] font-mono-tech text-[var(--text-muted)]">8 Modules</span>
          </div>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto pt-1">
            {SIDEBAR_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2.5 rounded transition-colors flex items-center justify-between gap-2 whitespace-nowrap lg:whitespace-normal ${
                    isSelected
                      ? 'cmms-badge-info border-l-2 border-l-[var(--accent-color)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{tab.label}</div>
                      <div className="text-[10px] text-[var(--text-muted)] hidden xl:block truncate">
                        {tab.subtitle}
                      </div>
                    </div>
                  </div>
                  {tab.badge !== undefined && (
                    <span className="text-[11px] font-mono-tech font-semibold text-[var(--text-secondary)] shrink-0">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Super Admin Viewport (9 Columns on Desktop) */}
        <section className="lg:col-span-9 space-y-5 min-w-0">
          {/* =================================================================
              TAB 1: OVERVIEW DASHBOARD
              ================================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Top 6 KPI Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <div className="cmms-card rounded-md p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>Registered Companies</span>
                    <Building2 className="w-4 h-4 text-[var(--accent-color)]" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono-tech text-[var(--text-primary)]">
                      {overview.companies.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('companies')}
                      className="text-xs font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      Inspect All &rarr;
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Isolated workspaces via companyCode
                  </div>
                </div>

                <div className="cmms-card rounded-md p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>Total User Emails</span>
                    <Users className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono-tech text-[var(--text-primary)]">
                      {overview.allUsers.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('users')}
                      className="text-xs font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      Manage Users &rarr;
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                    {
                      overview.allUsers.filter(
                        (u) =>
                          u.status !== 'Suspended' && u.rlsPolicyLevel !== 'SUSPENDED_ACCOUNT'
                      ).length
                    }{' '}
                    Active &middot;{' '}
                    {
                      overview.allUsers.filter(
                        (u) =>
                          u.status === 'Suspended' || u.rlsPolicyLevel === 'SUSPENDED_ACCOUNT'
                      ).length
                    }{' '}
                    Suspended
                  </div>
                </div>

                <div className="cmms-card rounded-md p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>PostgreSQL Total Records</span>
                    <Database className="w-4 h-4 text-[var(--accent-color)]" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono-tech text-[var(--text-primary)]">
                      {overview.systemHealth.totalRecordsCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('health')}
                      className="text-xs font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      DB Health &rarr;
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-muted)] font-mono-tech">
                    Uptime:{' '}
                    {formatUptime(overview.systemHealth.serverUptimeSeconds + liveUptimeOffset)}
                  </div>
                </div>

                <div className="cmms-card rounded-md p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>Active Subscriptions</span>
                    <CreditCard className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono-tech text-[var(--text-primary)]">
                      {overview.subscriptions.filter((s) => s.status === 'Active').length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('subscriptions')}
                      className="text-xs font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      Configure Plans &rarr;
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Free / Pro / Enterprise quota enforcement
                  </div>
                </div>

                <div className="cmms-card rounded-md p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>Global Audit Trail Events</span>
                    <Activity className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono-tech text-[var(--text-primary)]">
                      {overview.globalLogs.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('audit')}
                      className="text-xs font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      Audit Trail &rarr;
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Cross-company mutations &amp; security logs
                  </div>
                </div>

                <div className="cmms-card rounded-md p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>Pending Update Approvals</span>
                    <MessageSquarePlus className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono-tech text-[var(--text-primary)]">
                      {pendingUpdateCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('announcements')}
                      className="text-xs font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      Review Queue &rarr;
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                    {activeBroadcastCount} active broadcast banner(s)
                  </div>
                </div>
              </div>

              {/* Quick Company Directory Preview & Recent Audit Activity */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="cmms-card rounded-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      Registered Company Workspaces
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('companies')}
                      className="text-xs font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      View All ({overview.companies.length})
                    </button>
                  </div>
                  <div className="divide-y divide-[var(--border-color)]">
                    {overview.companies.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                        No registered companies yet. Click &ldquo;New Company Workspace&rdquo; to
                        create one.
                      </div>
                    ) : (
                      overview.companies.slice(0, 5).map((comp) => (
                        <div
                          key={comp.companyCode}
                          className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                              {comp.companyName}
                            </div>
                            <div className="text-[11px] font-mono-tech text-[var(--text-secondary)]">
                              {comp.companyCode} &middot; {comp.userCount} Users &middot;{' '}
                              {comp.machineCount} Machines
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleInspectWorkspace(comp)}
                              className="px-2.5 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-color)]"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onSelectCompanyWorkspace(comp.companyCode, comp.companyName)
                              }
                              className="px-2.5 py-1 rounded bg-[var(--accent-color)] text-white text-[11px] font-semibold"
                            >
                              Bypass &rarr;
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="cmms-card rounded-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      Latest Cross-Company Audit Events
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('audit')}
                      className="text-xs font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      Full Audit Log
                    </button>
                  </div>
                  <div className="divide-y divide-[var(--border-color)]">
                    {overview.globalLogs.slice(0, 5).map((log) => (
                      <div key={`${log.id}-${log.createdAt}`} className="px-4 py-2.5 space-y-0.5">
                        <div className="flex items-center justify-between text-[11px] font-mono-tech">
                          <span className="font-semibold text-[var(--accent-text)]">
                            [{log.companyCode || 'GLOBAL'}] {log.action}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-primary)] truncate">
                          {log.details}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono-tech">
                          {log.actorEmail} &middot; {log.actorRole}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 1B: MASS EMAIL BROADCAST SYSTEM (MAINTEX ADMINISTRATION)
              ================================================================= */}
          {activeTab === 'email-broadcast' && (
            <div className="space-y-5">
              {/* Official Sender Identity Card */}
              <div className="cmms-card rounded-md p-5 border-l-4 border-l-[var(--accent-color)] space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono-tech font-bold uppercase cmms-badge-info">
                        <Mail className="w-3.5 h-3.5" />
                        OFFICIAL SENDER IDENTITY CONFIGURED
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-mono-tech font-semibold cmms-badge-success">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        BCC Multi-Company Privacy Active
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                      Mass Email Broadcast &amp; File Attachment System
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      সব ইউজারের কাছে এক ক্লিকে অফিশিয়াল ইমেইল এবং ফাইল অ্যাটাচমেন্ট (PDF, Excel, Image, Word) পাঠান। প্রতিটি ইমেইল{' '}
                      <strong className="text-[var(--text-primary)]">BCC (Blind Carbon Copy)</strong>{' '}
                      হিসেবে পাঠানো হয়, তাই এক কোম্পানির ইউজার অন্য কারো ইমেইল দেখতে পাবে না।
                    </p>
                  </div>

                  <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs space-y-2 min-w-[300px]">
                    <div className="text-[10px] font-mono-tech uppercase text-[var(--text-muted)]">
                      Standard Official From Header
                    </div>
                    <div className="font-bold text-sm text-[var(--text-primary)]">
                      {OFFICIAL_SENDER_NAME}
                    </div>
                    <div className="font-mono-tech text-xs text-[var(--accent-text)]">
                      &lt;{connectedSenderEmail || OFFICIAL_SENDER_EMAIL}&gt;
                    </div>

                    <div className="pt-2 border-t border-[var(--border-color)] flex flex-col gap-2">
                      {!needsGmailAuth && gmailAccessToken ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Gmail API Connected ({connectedSenderEmail || OFFICIAL_SENDER_EMAIL})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleConnectGmailSender(OFFICIAL_SENDER_EMAIL)}
                            disabled={isConnectingGmail}
                            className="text-[11px] underline text-[var(--accent-text)]"
                          >
                            Switch Account
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="text-[11px] text-amber-500 font-medium">
                            সরাসরি অ্যাপ থেকে ইমেইল ও ফাইল পাঠাতে নিচের বাটনে ক্লিক করে{' '}
                            <strong>{OFFICIAL_SENDER_EMAIL}</strong> কানেক্ট করুন:
                          </div>
                          <button
                            type="button"
                            onClick={() => handleConnectGmailSender(OFFICIAL_SENDER_EMAIL)}
                            disabled={isConnectingGmail}
                            className="gsi-material-button w-full px-3 py-2 rounded bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs flex items-center justify-center gap-2.5 shadow-xs transition-colors"
                          >
                            <div className="gsi-material-button-state"></div>
                            <div className="gsi-material-button-content-wrapper flex items-center gap-2">
                              <div className="gsi-material-button-icon w-4 h-4 shrink-0">
                                <svg
                                  version="1.1"
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 48 48"
                                  xmlnsXlink="http://www.w3.org/1999/xlink"
                                  className="block w-4 h-4"
                                >
                                  <path
                                    fill="#EA4335"
                                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                                  ></path>
                                  <path
                                    fill="#4285F4"
                                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                                  ></path>
                                  <path
                                    fill="#FBBC05"
                                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                                  ></path>
                                  <path
                                    fill="#34A853"
                                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                                  ></path>
                                  <path fill="none" d="M0 0h48v48H0z"></path>
                                </svg>
                              </div>
                              <span className="gsi-material-button-contents">
                                {isConnectingGmail
                                  ? 'Connecting Gmail...'
                                  : 'Sign in with Google (Connect Sender)'}
                              </span>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {gmailSendError && (
                  <div className="p-3.5 rounded-md cmms-badge-critical flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{gmailSendError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConnectGmailSender(OFFICIAL_SENDER_EMAIL)}
                      className="px-3 py-1 rounded bg-white text-slate-900 font-bold text-xs shrink-0"
                    >
                      Sign in with Google
                    </button>
                  </div>
                )}

                {/* Action Banner for Last Dispatched Email */}
                {lastDispatchedRecord && (
                  <div className="p-4 rounded-md bg-[var(--bg-primary)] border-2 border-emerald-500/50 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-500">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Delivered [{lastDispatchedRecord.record.broadcastCode}] — &ldquo;
                          {lastDispatchedRecord.record.subject}&rdquo; ({lastDispatchedRecord.record.recipientCount}{' '}
                          BCC Recipients)
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {lastDispatchedRecord.record.deliveryMode === 'GMAIL_API_SENT'
                          ? `ইমেইলটি সরাসরি Gmail API-এর মাধ্যমে "${OFFICIAL_SENDER_NAME} <${lastDispatchedRecord.record.senderEmail}>" থেকে সকল ইউজারের ইনবক্সে পাঠানো হয়েছে! (Gmail Message ID: ${lastDispatchedRecord.record.gmailMessageId || 'Verified'})`
                          : `ইমেইলটি "${OFFICIAL_SENDER_NAME} <${OFFICIAL_SENDER_EMAIL}>" থেকে পাঠানো হয়েছে।`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={buildGmailComposeUrl(
                          lastDispatchedRecord.record.recipientEmails,
                          lastDispatchedRecord.record.subject,
                          lastDispatchedRecord.record.bodyText,
                          lastDispatchedRecord.record.attachments.map((a) => a.name)
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Open in Gmail ({OFFICIAL_SENDER_EMAIL}) &amp; Send</span>
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadEmlFile(
                            lastDispatchedRecord.record,
                            lastDispatchedRecord.attachments
                          )
                        }
                        className="px-3 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                        <span>Download .EML (With Attachments)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Main 2-Column Email Broadcast Workspace */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Left Column (5 Cols): Recipient Audience Selector */}
                <div className="xl:col-span-5 cmms-card rounded-md p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        1. Select Target Recipients (BCC)
                      </h4>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Choose all users, filter by company/role, or pick manually
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded text-xs font-mono-tech font-bold cmms-badge-info">
                      {finalRecipientEmails.length} Selected
                    </span>
                  </div>

                  {/* Audience Mode Radio Buttons */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { id: 'ALL_USERS', label: 'All Users (সব ইউজার)' },
                      { id: 'BY_COMPANY', label: 'By Company (নির্দিষ্ট কোম্পানি)' },
                      { id: 'BY_ROLE', label: 'By Role (নির্দিষ্ট রোল)' },
                      { id: 'MANUAL', label: 'Manual Pick (ম্যানুয়াল সিলেক্ট)' },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setEmailTargetMode(mode.id as any);
                          if (mode.id === 'MANUAL' && manualSelectedEmails.length === 0) {
                            setManualSelectedEmails(
                              eligibleRecipientUsers.map((u) => u.email.trim().toLowerCase())
                            );
                          }
                        }}
                        className={`p-2.5 rounded border text-left font-semibold transition-colors ${
                          emailTargetMode === mode.id
                            ? 'cmms-badge-info border-[var(--accent-color)]'
                            : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {/* Conditional Company / Role Dropdown */}
                  {emailTargetMode === 'BY_COMPANY' && (
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Select Target Company Workspace
                      </label>
                      <select
                        value={emailCompanyFilter}
                        onChange={(e) => setEmailCompanyFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs font-mono-tech text-[var(--text-primary)]"
                      >
                        <option value="ALL">ALL REGISTERED COMPANIES</option>
                        {overview.companies.map((c) => (
                          <option key={c.companyCode} value={c.companyCode}>
                            {c.companyName} ({c.companyCode}) — {c.userCount} Users
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {emailTargetMode === 'BY_ROLE' && (
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Select Target User Role
                      </label>
                      <select
                        value={emailRoleFilter}
                        onChange={(e) => setEmailRoleFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                      >
                        {SUPER_ADMIN_ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Exclude Suspended Checkbox */}
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={excludeSuspendedUsers}
                      onChange={(e) => setExcludeSuspendedUsers(e.target.checked)}
                      className="rounded border-[var(--border-color)]"
                    />
                    <span>Exclude Suspended Accounts automatically</span>
                  </label>

                  {/* Search & Recipient Directory Preview / Checkboxes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2" />
                        <input
                          type="text"
                          value={recipientSearchQuery}
                          onChange={(e) => setRecipientSearchQuery(e.target.value)}
                          placeholder="Filter user email or company..."
                          className="w-full pl-8 pr-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                        />
                      </div>
                      {emailTargetMode === 'MANUAL' && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setManualSelectedEmails(
                                uniqueDirectoryUsers.map((u) => u.email.trim().toLowerCase())
                              )
                            }
                            className="px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-primary)]"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualSelectedEmails([])}
                            className="px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-secondary)]"
                          >
                            None
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="max-h-60 overflow-y-auto border border-[var(--border-color)] rounded divide-y divide-[var(--border-color)] bg-[var(--bg-primary)]">
                      {uniqueDirectoryUsers
                        .filter((u) => {
                          const q = recipientSearchQuery.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            u.email.toLowerCase().includes(q) ||
                            (u.displayName || '').toLowerCase().includes(q) ||
                            (u.companyCode || '').toLowerCase().includes(q)
                          );
                        })
                        .map((u) => {
                          const emailLower = u.email.trim().toLowerCase();
                          const isChecked = finalRecipientEmails.includes(emailLower);
                          return (
                            <label
                              key={`${u.email}-${u.companyCode}`}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-[var(--bg-secondary)]/60 cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (emailTargetMode !== 'MANUAL') {
                                      const startSet = new Set(finalRecipientEmails);
                                      if (e.target.checked) startSet.add(emailLower);
                                      else startSet.delete(emailLower);
                                      setEmailTargetMode('MANUAL');
                                      setManualSelectedEmails(Array.from(startSet));
                                    } else {
                                      setManualSelectedEmails((prev) =>
                                        e.target.checked
                                          ? Array.from(new Set([...prev, emailLower]))
                                          : prev.filter((item) => item !== emailLower)
                                      );
                                    }
                                  }}
                                  className="rounded border-[var(--border-color)]"
                                />
                                <div className="min-w-0">
                                  <div className="font-mono-tech font-semibold text-[var(--text-primary)] truncate">
                                    {u.email}
                                  </div>
                                  <div className="text-[10px] text-[var(--text-secondary)] truncate">
                                    {u.displayName} &middot; {u.companyCode || 'GLOBAL'} &middot;{' '}
                                    {u.role}
                                  </div>
                                </div>
                              </div>
                              {isChecked && (
                                <span className="text-[10px] font-mono-tech text-emerald-500 shrink-0">
                                  BCC
                                </span>
                              )}
                            </label>
                          );
                        })}
                    </div>
                  </div>

                  {/* Additional Custom Emails */}
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      Additional Recipient Emails (Optional, comma-separated)
                    </label>
                    <input
                      type="text"
                      value={extraRecipientEmails}
                      onChange={(e) => setExtraRecipientEmails(e.target.value)}
                      placeholder="e.g. director@company.com, manager@plant.com"
                      className="w-full px-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs font-mono-tech text-[var(--text-primary)]"
                    />
                  </div>
                </div>

                {/* Right Column (7 Cols): Email Composer, Templates & File Attachments */}
                <div className="xl:col-span-7 cmms-card rounded-md p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        2. Compose Official Email &amp; Attach Files
                      </h4>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        From:{' '}
                        <strong className="font-mono-tech text-[var(--accent-text)]">
                          &ldquo;{OFFICIAL_SENDER_NAME}&rdquo; &lt;{OFFICIAL_SENDER_EMAIL}&gt;
                        </strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEmailPreview((prev) => !prev)}
                      className="px-2.5 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                      <span>{showEmailPreview ? 'Hide Preview' : 'Preview Official Email'}</span>
                    </button>
                  </div>

                  {/* Quick Template Presets */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Quick Official Templates (এক ক্লিকে টেমপ্লেট লোড করুন):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        {
                          label: 'সিস্টেম আপডেট নোটিশ',
                          subject: 'Official System Update & New Features — MAINTEX CMMS',
                          body: `প্রিয় প্ল্যান্ট অ্যাডমিন ও ইঞ্জিনিয়ারবৃন্দ,\n\nআপনাদের জানানো যাচ্ছে যে MAINTEX Industrial CMMS প্ল্যাটফর্মে নতুন আপডেট এবং পারফরম্যান্স অপ্টিমাইজেশন যুক্ত করা হয়েছে।\n\nপ্রধান পরিবর্তনসমূহ:\n১. রিয়েল-টাইম মেশিন সার্চ ও ফিল্টারিং\n২. প্রিন্ট-রেডি ওয়ার্ক অর্ডার, গেট পাস ও পারচেজ অর্ডার (PDF/Print)\n৩. উন্নত মাল্টি-কোম্পানি ডেটা সিকিউরিটি\n\nযেকোনো সহযোগিতায় আমাদের সাথে যোগাযোগ করুন।\n\nধন্যবাদান্তে,\n${OFFICIAL_SENDER_NAME}`,
                        },
                        {
                          label: 'মাসিক মেইনটেন্যান্স নির্দেশনা',
                          subject: 'Monthly Preventive Maintenance & Store Audit Directive',
                          body: `Dear Plant Management & Maintenance Team,\n\nPlease ensure that all pending Preventive Maintenance (PM) schedules and Low Stock Spare Part requisitions for this month are updated in your company workspace.\n\nPlease find any attached guidelines or checklists with this email.\n\nBest Regards,\n${OFFICIAL_SENDER_NAME}`,
                        },
                        {
                          label: 'সার্ভার মেইনটেন্যান্স অ্যালার্ট',
                          subject: 'Scheduled Cloud Database Backup & Maintenance Notice',
                          body: `প্রিয় ব্যবহারকারী,\n\nসিস্টেমের নিয়মিত ক্লাউড ডাটাবেস ব্যাকআপ এবং সিকিউরিটি আপগ্রেডের কাজ সফলভাবে সম্পন্ন হয়েছে। আপনাদের সকল প্ল্যান্টের ডেটা সম্পূর্ণ সুরক্ষিত রয়েছে।\n\nধন্যবাদান্তে,\n${OFFICIAL_SENDER_NAME}`,
                        },
                      ].map((tpl) => (
                        <button
                          key={tpl.label}
                          type="button"
                          onClick={() => {
                            setEmailSubject(tpl.subject);
                            setEmailBodyText(tpl.body);
                          }}
                          className="px-2.5 py-1 rounded bg-[var(--bg-secondary)] hover:border-[var(--accent-color)] border border-[var(--border-color)] text-[11px] font-medium text-[var(--text-primary)] transition-colors"
                        >
                          + {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sender Read-Only Field */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Sender Name (প্রেরকের নাম)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={OFFICIAL_SENDER_NAME}
                        className="w-full px-3 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] font-bold text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Official Sender Email (প্রেরকের ইমেইল)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={OFFICIAL_SENDER_EMAIL}
                        className="w-full px-3 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] font-mono-tech text-[var(--accent-text)]"
                      />
                    </div>
                  </div>

                  {/* Subject Input */}
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      Email Subject (ইমেইলের বিষয়) *
                    </label>
                    <input
                      type="text"
                      required
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Write official email subject line..."
                      className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)]"
                    />
                  </div>

                  {/* Email Body Textarea */}
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      Email Message Text (ইমেইলের বিস্তারিত বার্তা — বাংলা বা ইংরেজি) *
                    </label>
                    <textarea
                      rows={7}
                      required
                      value={emailBodyText}
                      onChange={(e) => setEmailBodyText(e.target.value)}
                      placeholder="Write your message to all selected users here..."
                      className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] leading-relaxed"
                    />
                  </div>

                  {/* File Attachment Uploader */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                        <span>
                          File Attachments (PDF, Excel, Word, Images, ZIP) —{' '}
                          {emailAttachments.length} Attached
                        </span>
                      </label>
                      <label className="px-3 py-1.5 rounded bg-[var(--bg-secondary)] hover:border-[var(--accent-color)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer inline-flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                        <span>Attach Files</span>
                        <input
                          type="file"
                          multiple
                          onChange={handleAttachmentFilesChange}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {emailAttachments.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {emailAttachments.map((att, idx) => (
                          <div
                            key={`${att.name}-${idx}`}
                            className="px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0" />
                              <div className="min-w-0">
                                <div className="font-semibold text-[var(--text-primary)] truncate">
                                  {att.name}
                                </div>
                                <div className="text-[10px] font-mono-tech text-[var(--text-muted)]">
                                  {Math.max(1, Math.round(att.sizeBytes / 1024))} KB
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setEmailAttachments((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1 rounded hover:bg-[var(--bg-secondary)] text-red-500"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Live HTML Email Preview Box */}
                  {showEmailPreview && (
                    <div className="p-4 rounded-md bg-[var(--bg-primary)] border border-[var(--border-color)] space-y-3">
                      <div className="text-[11px] font-mono-tech uppercase text-[var(--text-muted)]">
                        Live Recipient Inbox Preview
                      </div>
                      <div className="rounded-md overflow-hidden border border-[var(--border-color)] bg-white text-slate-900">
                        <div className="bg-[#0070F3] text-white px-5 py-3.5">
                          <div className="text-[10px] font-mono-tech uppercase tracking-wider opacity-90">
                            OFFICIAL PLATFORM COMMUNICATION
                          </div>
                          <div className="text-base font-bold mt-0.5">{OFFICIAL_SENDER_NAME}</div>
                          <div className="text-xs opacity-90 font-mono-tech">
                            &lt;{OFFICIAL_SENDER_EMAIL}&gt;
                          </div>
                        </div>
                        <div className="p-5 space-y-3 text-xs leading-relaxed">
                          <div className="font-bold text-sm border-b border-slate-200 pb-2">
                            {emailSubject || '(No Subject Yet)'}
                          </div>
                          <div className="whitespace-pre-wrap text-slate-700">
                            {emailBodyText || '(Write your email body to preview here...)'}
                          </div>
                          {emailAttachments.length > 0 && (
                            <div className="p-3 rounded bg-slate-50 border border-slate-200 text-[11px]">
                              <strong>Attached Files ({emailAttachments.length}):</strong>
                              <ul className="list-disc list-inside mt-1">
                                {emailAttachments.map((a, i) => (
                                  <li key={i}>
                                    {a.name} ({Math.max(1, Math.round(a.sizeBytes / 1024))} KB)
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <div className="bg-slate-100 px-5 py-2.5 text-[11px] text-slate-600 border-t border-slate-200">
                          Sent officially by <strong>{OFFICIAL_SENDER_NAME}</strong> &lt;
                          {OFFICIAL_SENDER_EMAIL}&gt; &bull; BCC Privacy Protected
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit / Dispatch Actions */}
                  <div className="pt-3 border-t border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Sending to{' '}
                      <strong className="text-[var(--text-primary)]">
                        {finalRecipientEmails.length} user(s)
                      </strong>{' '}
                      via BCC with{' '}
                      <strong className="text-[var(--text-primary)]">
                        {emailAttachments.length} file(s)
                      </strong>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        disabled={
                          !emailSubject.trim() ||
                          !emailBodyText.trim() ||
                          finalRecipientEmails.length === 0
                        }
                        onClick={() => setConfirmSendModalOpen(true)}
                        className="px-4 py-2 rounded bg-[var(--accent-color)] hover:opacity-95 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2 transition-opacity"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          Review &amp; Send Mass Email ({finalRecipientEmails.length} Users)
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sent Email Broadcast History Table */}
              <div className="cmms-card rounded-md overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      Sent Mass Email Broadcast History ({(overview.emailBroadcasts || []).length})
                    </h4>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Audit log of all mass emails sent from {OFFICIAL_SENDER_NAME} &lt;
                      {OFFICIAL_SENDER_EMAIL}&gt;
                    </p>
                  </div>
                </div>

                {(overview.emailBroadcasts || []).length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                    No mass email broadcasts have been sent yet. Compose your first broadcast above.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-mono-tech uppercase text-[var(--text-secondary)]">
                          <th className="py-2.5 px-4">Code &amp; Date</th>
                          <th className="py-2.5 px-3">Official Sender</th>
                          <th className="py-2.5 px-3">Subject &amp; Message</th>
                          <th className="py-2.5 px-3">Audience &amp; BCC Count</th>
                          <th className="py-2.5 px-3">Attachments</th>
                          <th className="py-2.5 px-4 text-right">Dispatch Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)]">
                        {(overview.emailBroadcasts || []).map((b) => (
                          <tr
                            key={b.broadcastCode}
                            className="hover:bg-[var(--bg-secondary)]/60 transition-colors"
                          >
                            <td className="py-2.5 px-4 font-mono-tech">
                              <div className="font-bold text-[var(--accent-text)]">
                                {b.broadcastCode}
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)]">
                                {new Date(b.sentAt).toLocaleString()}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-[var(--text-primary)]">
                                {b.senderName}
                              </div>
                              <div className="text-[11px] font-mono-tech text-[var(--text-secondary)]">
                                {b.senderEmail}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 max-w-xs">
                              <div className="font-bold text-[var(--text-primary)] truncate">
                                {b.subject}
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                {b.bodyText}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-[var(--text-primary)]">
                                {b.recipientCount} Users (BCC)
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)]">
                                {b.targetAudienceLabel}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              {b.attachments.length === 0 ? (
                                <span className="text-[11px] text-[var(--text-muted)]">None</span>
                              ) : (
                                <div className="space-y-0.5">
                                  {b.attachments.map((att, idx) => (
                                    <div
                                      key={idx}
                                      className="text-[11px] font-mono-tech text-[var(--text-primary)] truncate max-w-[160px]"
                                    >
                                      📎 {att.name}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <a
                                  href={buildGmailComposeUrl(
                                    b.recipientEmails,
                                    b.subject,
                                    b.bodyText,
                                    b.attachments.map((a) => a.name)
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold"
                                >
                                  Send via Gmail
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadEmlFile(b)}
                                  className="px-2.5 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-primary)]"
                                >
                                  .EML
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 2: ALL USER EMAIL LIST
              ================================================================= */}
          {activeTab === 'users' && (
            <div className="cmms-card rounded-md overflow-hidden">
              <div className="p-4 border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    All Registered User Email Directory ({filteredUsers.length})
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    View user emails across all companies, inspect last login timestamps, edit
                    roles, or suspend/reactivate accounts.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search email, name or company..."
                      className="pl-8 pr-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] w-56"
                    />
                  </div>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="ALL">All Roles</option>
                    {SUPER_ADMIN_ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <select
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="ALL">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-mono-tech uppercase text-[var(--text-secondary)]">
                      <th className="py-2.5 px-4">User Email &amp; Name</th>
                      <th className="py-2.5 px-3">Company Workspace</th>
                      <th className="py-2.5 px-3">Assigned Role &amp; Shift</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Registered</th>
                      <th className="py-2.5 px-3">Last Login</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)] text-xs">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-xs text-[var(--text-secondary)]"
                        >
                          No users match the current search filter.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSuspended =
                          u.status === 'Suspended' || u.rlsPolicyLevel === 'SUSPENDED_ACCOUNT';
                        return (
                          <tr
                            key={`${u.id}-${u.email}-${u.companyCode}`}
                            className="hover:bg-[var(--bg-secondary)]/60 transition-colors"
                          >
                            <td className="py-2.5 px-4">
                              <div className="font-mono-tech font-semibold text-[var(--text-primary)]">
                                {u.email}
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)]">
                                {u.displayName}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-[var(--text-primary)]">
                                {u.companyName || u.companyCode}
                              </div>
                              <div className="text-[11px] font-mono-tech text-[var(--accent-text)]">
                                {u.companyCode}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-[var(--text-primary)]">
                                {u.role}
                              </div>
                              <div className="text-[11px] font-mono-tech text-[var(--text-secondary)]">
                                {u.shift}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-mono-tech font-semibold ${
                                  isSuspended
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                {isSuspended ? 'Suspended' : 'Active'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono-tech text-[11px] text-[var(--text-secondary)]">
                              {u.createdAt
                                ? new Date(u.createdAt).toLocaleDateString()
                                : new Date(u.lastSyncedAt).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-3 font-mono-tech text-[11px] text-[var(--text-secondary)]">
                              {new Date(u.lastSyncedAt).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditUserRole(u.role);
                                    setEditUserShift(u.shift || PLANT_SHIFTS[0]);
                                    setEditUserStatus(isSuspended ? 'Suspended' : 'Active');
                                  }}
                                  className="px-2.5 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-color)] text-[11px] font-semibold text-[var(--text-primary)] inline-flex items-center gap-1"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickToggleUserSuspend(u)}
                                  className={`px-2.5 py-1 rounded border text-[11px] font-semibold inline-flex items-center gap-1 ${
                                    isSuspended
                                      ? 'cmms-badge-success'
                                      : 'cmms-badge-critical'
                                  }`}
                                >
                                  {isSuspended ? (
                                    <>
                                      <UserCheck className="w-3 h-3" />
                                      <span>Activate</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserX className="w-3 h-3" />
                                      <span>Suspend</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 3: ALL COMPANY LIST (FULL INFO & WORKSPACE BYPASS)
              ================================================================= */}
          {activeTab === 'companies' && (
            <div className="space-y-4">
              <div className="cmms-card rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    All Registered Companies ({filteredCompanies.length})
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Inspect plant locations, live asset &amp; breakdown metrics, or execute
                    &ldquo;Bypass / Inspect Workspace&rdquo; for full administrative access.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      placeholder="Filter company, code, location..."
                      className="pl-8 pr-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] w-64"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCompanies.map((comp) => {
                  const isCurrent = comp.companyCode === activeCompanyCode;
                  const sub = overview.subscriptions.find(
                    (s) => s.companyCode === comp.companyCode
                  );
                  return (
                    <div
                      key={comp.companyCode}
                      className={`cmms-card rounded-md p-5 flex flex-col justify-between space-y-4 ${
                        isCurrent ? 'ring-2 ring-[var(--accent-color)]' : ''
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-[var(--text-primary)]">
                              {comp.companyName}
                            </h4>
                            <div className="text-xs font-mono-tech text-[var(--accent-text)] font-semibold">
                              Code: {comp.companyCode} &middot; Plan: {sub?.plan || 'Enterprise'}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono-tech text-[var(--text-secondary)]">
                            {isCurrent ? 'ACTIVE WORKSPACE' : sub?.status || 'Active'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                          <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                          <span>{comp.plantLocation || 'Industrial Zone, Bangladesh'}</span>
                        </div>

                        <div className="text-xs text-[var(--text-secondary)] font-mono-tech truncate">
                          Plant Admins:{' '}
                          {comp.plantAdmins.length > 0
                            ? comp.plantAdmins.join(', ')
                            : superAdminEmail}
                        </div>

                        {/* Usage Telemetry Bar */}
                        <div className="pt-2 border-t border-[var(--border-color)] grid grid-cols-5 gap-2 text-center font-mono-tech">
                          <div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">
                              {comp.userCount}
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">Users</div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">
                              {comp.departmentCount}
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">Depts</div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">
                              {comp.machineCount}
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">Machines</div>
                          </div>
                          <div>
                            <div
                              className={`text-sm font-bold ${
                                comp.openBreakdowns > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {comp.openBreakdowns}
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">Faults</div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">
                              {comp.sparePartCount}
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">Spares</div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[var(--border-color)] space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleInspectWorkspace(comp)}
                            className="flex-1 py-2 px-3 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                            <span>Inspect Data</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onSelectCompanyWorkspace(comp.companyCode, comp.companyName)
                            }
                            className="flex-1 py-2 px-3 rounded bg-[var(--accent-color)] hover:opacity-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Bypass Workspace &rarr;</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenScreenshotCard(comp.companyCode, comp.companyName)
                            }
                            title="Company Screenshot Card"
                            className="p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDeleteCode(
                                confirmDeleteCode === comp.companyCode ? null : comp.companyCode
                              )
                            }
                            title="Delete Company Workspace"
                            className="p-2 rounded cmms-badge-critical"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {confirmDeleteCode === comp.companyCode && (
                          <div className="p-3 rounded cmms-badge-critical space-y-2 text-xs">
                            <div className="font-bold">
                              Confirm permanent deletion of &ldquo;{comp.companyName}&rdquo; (
                              {comp.companyCode})?
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCode(null)}
                                className="px-2.5 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={deletingCode === comp.companyCode}
                                onClick={async () => {
                                  setDeletingCode(comp.companyCode);
                                  try {
                                    await onDeleteCompanyProfile(
                                      comp.companyCode,
                                      comp.companyName
                                    );
                                    setConfirmDeleteCode(null);
                                    await fetchOverview();
                                  } finally {
                                    setDeletingCode(null);
                                  }
                                }}
                                className="px-3 py-1 rounded bg-red-600 text-white font-bold"
                              >
                                {deletingCode === comp.companyCode
                                  ? 'Deleting...'
                                  : 'Confirm Delete'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 4: SUBSCRIPTION & USAGE CONTROL
              ================================================================= */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              <div className="cmms-card rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Subscription Plans, Expiration &amp; Resource Quota Control
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Assign Free, Pro, or Enterprise tiers and enforce maximum machines, users, and
                    store inventory limits per company.
                  </p>
                </div>
              </div>

              <div className="cmms-card rounded-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-mono-tech uppercase text-[var(--text-secondary)]">
                        <th className="py-2.5 px-4">Company &amp; Location</th>
                        <th className="py-2.5 px-3">Plan Tier</th>
                        <th className="py-2.5 px-3">Status &amp; Expiry</th>
                        <th className="py-2.5 px-3">Machines Usage</th>
                        <th className="py-2.5 px-3">Users Usage</th>
                        <th className="py-2.5 px-3">Store Items Limit</th>
                        <th className="py-2.5 px-4 text-right">Manage Quota</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)] text-xs">
                      {overview.subscriptions.map((sub) => {
                        const comp = overview.companies.find(
                          (c) => c.companyCode === sub.companyCode
                        );
                        const usedMachines = comp?.machineCount || 0;
                        const usedUsers = comp?.userCount || 1;
                        const usedStore = comp?.sparePartCount || 0;

                        return (
                          <tr
                            key={sub.companyCode}
                            className="hover:bg-[var(--bg-secondary)]/60 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-[var(--text-primary)]">
                                {sub.companyName}
                              </div>
                              <div className="text-[11px] font-mono-tech text-[var(--text-secondary)]">
                                {sub.companyCode} &middot; {sub.plantLocation}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-mono-tech font-bold text-[var(--accent-text)]">
                                {sub.plan}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono-tech">
                              <div
                                className={`font-semibold ${
                                  sub.status === 'Active'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {sub.status}
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)]">
                                Exp: {sub.expiresAt}
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono-tech">
                              <div>
                                {usedMachines} / {sub.maxMachines}
                              </div>
                              <div className="w-24 h-1.5 bg-[var(--bg-secondary)] rounded overflow-hidden mt-1">
                                <div
                                  className="h-full bg-[var(--accent-color)]"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.round((usedMachines / Math.max(1, sub.maxMachines)) * 100)
                                    )}%`,
                                  }}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono-tech">
                              <div>
                                {usedUsers} / {sub.maxUsers}
                              </div>
                              <div className="w-24 h-1.5 bg-[var(--bg-secondary)] rounded overflow-hidden mt-1">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.round((usedUsers / Math.max(1, sub.maxUsers)) * 100)
                                    )}%`,
                                  }}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono-tech">
                              <div>
                                {usedStore} / {sub.maxStoreItems}
                              </div>
                              <div className="w-24 h-1.5 bg-[var(--bg-secondary)] rounded overflow-hidden mt-1">
                                <div
                                  className="h-full bg-amber-500"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.round((usedStore / Math.max(1, sub.maxStoreItems)) * 100)
                                    )}%`,
                                  }}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setEditingSub({ ...sub })}
                                className="px-3 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-color)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                <span>Configure Plan</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 5: SYSTEM HEALTH & DATABASE
              ================================================================= */}
          {activeTab === 'health' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="cmms-card rounded-md p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>PostgreSQL Connection</span>
                    <Server className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-lg font-bold font-mono-tech text-emerald-600 dark:text-emerald-400">
                    {overview.systemHealth.dbStatus}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {overview.systemHealth.databaseEngine}
                  </div>
                </div>

                <div className="cmms-card rounded-md p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>Total Database Records</span>
                    <Database className="w-4 h-4 text-[var(--accent-color)]" />
                  </div>
                  <div className="text-lg font-bold font-mono-tech text-[var(--text-primary)]">
                    {overview.systemHealth.totalRecordsCount} Rows
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Across 21 Drizzle ORM Relational Tables
                  </div>
                </div>

                <div className="cmms-card rounded-md p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>Server Uptime &amp; Last Backup</span>
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-lg font-bold font-mono-tech text-[var(--text-primary)]">
                    {formatUptime(overview.systemHealth.serverUptimeSeconds + liveUptimeOffset)}
                  </div>
                  <div className="text-[11px] font-mono-tech text-[var(--text-secondary)]">
                    Last Snapshot: {new Date(overview.systemHealth.lastBackupAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Manual Company Data Backup Trigger Box */}
              <div className="cmms-card rounded-md p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <HardDriveDownload className="w-4 h-4 text-[var(--accent-color)]" />
                    <span>Manual Company Data Backup &amp; Snapshot Generator</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Export a complete JSON database snapshot of all 21 CMMS tables for either a
                    specific company workspace or the entire MAINTEX multi-company cluster.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    value={backupTargetCompany}
                    onChange={(e) => setBackupTargetCompany(e.target.value)}
                    className="px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs font-mono-tech text-[var(--text-primary)]"
                  >
                    <option value="ALL">ALL COMPANIES (Full Cluster Backup)</option>
                    {overview.companies.map((c) => (
                      <option key={c.companyCode} value={c.companyCode}>
                        {c.companyName} ({c.companyCode})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleTriggerManualBackup(backupTargetCompany)}
                    disabled={runningBackup}
                    className="px-4 py-2 rounded bg-[var(--accent-color)] hover:opacity-95 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {runningBackup ? 'Generating Backup...' : 'Trigger Manual Backup (.JSON)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Per-Table Record Breakdown Grid */}
              <div className="cmms-card rounded-md overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    PostgreSQL / Drizzle ORM Table Record Breakdown (21 Tables)
                  </h3>
                  <span className="text-xs font-mono-tech text-[var(--text-secondary)]">
                    Total: {overview.systemHealth.totalRecordsCount} Records
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-[var(--border-color)]">
                  {overview.systemHealth.tableBreakdown.map((tbl) => (
                    <div
                      key={tbl.tableName}
                      className="bg-[var(--bg-surface)] p-3.5 flex items-center justify-between"
                    >
                      <span className="text-xs font-mono-tech text-[var(--text-secondary)] truncate">
                        {tbl.tableName}
                      </span>
                      <span className="text-sm font-bold font-mono-tech text-[var(--text-primary)]">
                        {tbl.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 6: GLOBAL AUDIT TRAIL & LOGS
              ================================================================= */}
          {activeTab === 'audit' && (
            <div className="cmms-card rounded-md overflow-hidden">
              <div className="p-4 border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Global Real-Time Audit Trail ({filteredLogs.length})
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Cross-company immutable log of data creations, edits, deletions, role changes,
                    and backups.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Search actor, action, entity..."
                      className="pl-8 pr-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] w-52"
                    />
                  </div>
                  <select
                    value={auditCompanyFilter}
                    onChange={(e) => setAuditCompanyFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs font-mono-tech text-[var(--text-primary)]"
                  >
                    <option value="ALL">All Companies</option>
                    {overview.companies.map((c) => (
                      <option key={c.companyCode} value={c.companyCode}>
                        {c.companyCode}
                      </option>
                    ))}
                  </select>
                  <select
                    value={auditModuleFilter}
                    onChange={(e) => setAuditModuleFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="ALL">All Modules</option>
                    {auditModules.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleExportAuditLogsCsv}
                    className="px-3 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-mono-tech uppercase text-[var(--text-secondary)]">
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-3">Company</th>
                      <th className="py-2.5 px-3">Actor Email &amp; Role</th>
                      <th className="py-2.5 px-3">Module &amp; Action</th>
                      <th className="py-2.5 px-3">Entity</th>
                      <th className="py-2.5 px-3">Details</th>
                      <th className="py-2.5 px-4">Origin / IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)] text-xs">
                    {filteredLogs.map((log) => (
                      <tr
                        key={`${log.id}-${log.createdAt}-${log.entityCode}`}
                        className="hover:bg-[var(--bg-secondary)]/60 transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono-tech text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tech font-semibold text-[var(--accent-text)]">
                          {log.companyCode || 'GLOBAL'}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono-tech font-semibold text-[var(--text-primary)]">
                            {log.actorEmail}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            {log.actorRole}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono-tech font-bold text-[var(--text-primary)]">
                            {log.action}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            {log.module}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-tech text-[var(--accent-text)]">
                          {log.entityCode}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--text-primary)] max-w-md">
                          {log.details}
                        </td>
                        <td className="py-2.5 px-4 font-mono-tech text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                          {log.ipAddress || 'Verified Token'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 7: SYSTEM ANNOUNCEMENTS & APPROVAL REQUESTS
              ================================================================= */}
          {activeTab === 'announcements' && (
            <div className="space-y-6">
              {/* Section A: Global Broadcast Banner Composer & Active List */}
              <div className="cmms-card rounded-md p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-[var(--accent-color)]" />
                    <span>Global Broadcast Banner System (Send Notice to Active Users)</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Broadcast real-time system notices, maintenance windows, or alerts to all
                    companies or a specific company workspace.
                  </p>
                </div>

                <form onSubmit={handlePublishAnnouncement} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-1">
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Announcement Title *
                      </label>
                      <input
                        type="text"
                        required
                        value={noticeTitle}
                        onChange={(e) => setNoticeTitle(e.target.value)}
                        placeholder="e.g. Scheduled Cloud SQL Upgrade"
                        className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Severity Level
                      </label>
                      <select
                        value={noticeSeverity}
                        onChange={(e) =>
                          setNoticeSeverity(e.target.value as 'Info' | 'Warning' | 'Critical')
                        }
                        className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                      >
                        <option value="Info">Info (Blue Notice)</option>
                        <option value="Warning">Warning (Amber Alert)</option>
                        <option value="Critical">Critical (Red Urgent Banner)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Target Audience
                      </label>
                      <select
                        value={noticeTargetCompany}
                        onChange={(e) => setNoticeTargetCompany(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs font-mono-tech text-[var(--text-primary)]"
                      >
                        <option value="ALL">ALL COMPANIES (Global Broadcast)</option>
                        {overview.companies.map((c) => (
                          <option key={c.companyCode} value={c.companyCode}>
                            {c.companyName} ({c.companyCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      required
                      value={noticeMessage}
                      onChange={(e) => setNoticeMessage(e.target.value)}
                      placeholder="Write broadcast banner message visible at the top of user screens..."
                      className="flex-1 px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="submit"
                      disabled={publishingNotice}
                      className="px-4 py-2 rounded bg-[var(--accent-color)] hover:opacity-95 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      {publishingNotice ? 'Broadcasting...' : 'Publish Broadcast Banner'}
                    </button>
                  </div>
                </form>

                {/* Active & Archived Broadcast List */}
                <div className="pt-3 border-t border-[var(--border-color)] space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Configured Broadcast Banners ({overview.announcements.length})
                  </div>
                  {overview.announcements.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded border flex flex-wrap items-center justify-between gap-3 text-xs ${
                        item.severity === 'Critical'
                          ? 'cmms-badge-critical'
                          : item.severity === 'Warning'
                          ? 'cmms-badge-warning'
                          : 'cmms-badge-info'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold flex items-center gap-2">
                          <span>{item.title}</span>
                          <span className="font-mono-tech text-[11px] opacity-80">
                            Target: {item.targetCompanyCode} &middot;{' '}
                            {item.active ? 'LIVE' : 'PAUSED'}
                          </span>
                        </div>
                        <div>{item.message}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleAnnouncement(item)}
                          className="px-2.5 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-primary)]"
                        >
                          {item.active ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(item.id)}
                          className="p-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section B: Cross-Company Update Request Approval Queue */}
              <div className="cmms-card rounded-md p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <MessageSquarePlus className="w-4 h-4 text-emerald-500" />
                    <span>
                      Cross-Company Update &amp; Feature Approval Requests (
                      {overview.updateRequests.length})
                    </span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Review, approve, or reply to pending update requests submitted by Plant Admins
                    and engineers across all registered companies.
                  </p>
                </div>

                {overview.updateRequests.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                    No update requests have been submitted yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {overview.updateRequests.map((req) => {
                      const replyVal =
                        replyDrafts[req.id] !== undefined
                          ? replyDrafts[req.id]
                          : req.superAdminReply || '';
                      const statusVal =
                        statusDrafts[req.id] !== undefined ? statusDrafts[req.id] : req.status;

                      return (
                        <div
                          key={req.id}
                          className="p-4 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] space-y-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-mono-tech text-[var(--accent-text)] font-semibold">
                                {req.requestCode} &middot; {req.companyName} ({req.companyCode})
                                &middot; {req.requestType} &middot; Module: {req.targetModule}
                              </div>
                              <h4 className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                                {req.title}
                              </h4>
                              <p className="text-xs text-[var(--text-secondary)] mt-1">
                                {req.description}
                              </p>
                            </div>
                            <span className="text-xs font-mono-tech font-semibold text-[var(--text-secondary)]">
                              Status: {req.status}
                            </span>
                          </div>

                          <div className="text-[11px] font-mono-tech text-[var(--text-muted)]">
                            Submitted by: {req.senderName} ({req.senderEmail} &bull;{' '}
                            {req.senderRole}) on {new Date(req.createdAt).toLocaleString()}
                          </div>

                          <div className="pt-2 border-t border-[var(--border-color)] grid grid-cols-1 md:grid-cols-4 gap-2.5">
                            <div className="md:col-span-1">
                              <select
                                value={statusVal}
                                onChange={(e) =>
                                  setStatusDrafts((prev) => ({
                                    ...prev,
                                    [req.id]: e.target.value,
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                              >
                                <option value="Pending Review">Pending Review</option>
                                <option value="Approved">Approved</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed / Live">Completed / Live</option>
                                <option value="Rejected">Rejected</option>
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <input
                                type="text"
                                value={replyVal}
                                onChange={(e) =>
                                  setReplyDrafts((prev) => ({
                                    ...prev,
                                    [req.id]: e.target.value,
                                  }))
                                }
                                placeholder="Write Super Admin approval note or response..."
                                className="w-full px-3 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                              />
                            </div>
                            <div className="md:col-span-1 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  await onRespondToUpdateRequest(req.id, statusVal, replyVal);
                                  setStatusBanner({
                                    type: 'success',
                                    text: `Updated request ${req.requestCode} to [${statusVal}].`,
                                  });
                                  await fetchOverview();
                                }}
                                className="w-full py-1.5 px-3 rounded bg-[var(--accent-color)] hover:opacity-95 text-white text-xs font-semibold"
                              >
                                Save Decision
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* =====================================================================
          MODAL 1: EDIT / SUSPEND USER MODAL
          ===================================================================== */}
      {confirmSendModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--accent-color)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Confirm Official Mass Email Broadcast
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSendModalOpen(false)}
                className="text-xs text-[var(--text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Official Sender Name:</span>
                  <strong className="text-[var(--text-primary)]">{OFFICIAL_SENDER_NAME}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Official Sender Email:</span>
                  <strong className="font-mono-tech text-[var(--accent-text)]">
                    {OFFICIAL_SENDER_EMAIL}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Target Audience:</span>
                  <strong className="text-[var(--text-primary)]">
                    {targetAudienceSummaryLabel}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Total BCC Recipients:</span>
                  <strong className="font-mono-tech text-emerald-500">
                    {finalRecipientEmails.length} User Email(s)
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Attached Files:</span>
                  <strong className="font-mono-tech text-[var(--text-primary)]">
                    {emailAttachments.length} File(s)
                  </strong>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--text-secondary)] mb-1">Subject:</div>
                <div className="p-2.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-semibold text-[var(--text-primary)]">
                  {emailSubject}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--text-secondary)] mb-1">
                  BCC Recipient Preview ({finalRecipientEmails.length}):
                </div>
                <div className="p-2.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono-tech text-[11px] text-[var(--text-secondary)] max-h-24 overflow-y-auto">
                  {finalRecipientEmails.join(', ')}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)] text-xs">
              <button
                type="button"
                onClick={() => setConfirmSendModalOpen(false)}
                className="px-4 py-2 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingEmailBroadcast}
                onClick={handleConfirmAndSendMassEmail}
                className="px-4 py-2 rounded bg-[var(--accent-color)] text-white font-bold inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {sendingEmailBroadcast
                    ? 'Dispatching Broadcast...'
                    : `Confirm & Send to ${finalRecipientEmails.length} Users`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: EDIT / SUSPEND USER MODAL
          ===================================================================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Edit User Role &amp; Access Status
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUserEdit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">User Email</label>
                <div className="px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono-tech text-[var(--text-primary)]">
                  {editingUser.email} ({editingUser.companyCode})
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Assigned Role</label>
                <select
                  value={editUserRole}
                  onChange={(e) => setEditUserRole(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                >
                  {SUPER_ADMIN_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Duty Shift</label>
                <select
                  value={editUserShift}
                  onChange={(e) => setEditUserShift(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono-tech text-[var(--text-primary)]"
                >
                  {PLANT_SHIFTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Account Status</label>
                <select
                  value={editUserStatus}
                  onChange={(e) => setEditUserStatus(e.target.value as 'Active' | 'Suspended')}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                >
                  <option value="Active">Active (Full Role Access)</option>
                  <option value="Suspended">Suspended (Block Workspace Access)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 rounded bg-[var(--accent-color)] text-white font-semibold"
                >
                  {savingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: EDIT SUBSCRIPTION & USAGE QUOTAS MODAL
          ===================================================================== */}
      {editingSub && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Configure Plan &amp; Limits — {editingSub.companyName}
                </h3>
                <div className="text-xs font-mono-tech text-[var(--accent-text)]">
                  {editingSub.companyCode}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                className="text-xs text-[var(--text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubscription} className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">
                  Quick Select Plan Preset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Free', 'Pro', 'Enterprise'] as SubscriptionPlanTier[]).map((tier) => {
                    const preset = PLAN_PRESETS[tier];
                    const selected = editingSub.plan === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() =>
                          setEditingSub({
                            ...editingSub,
                            plan: tier,
                            maxMachines: preset.maxMachines,
                            maxUsers: preset.maxUsers,
                            maxStoreItems: preset.maxStoreItems,
                          })
                        }
                        className={`p-2.5 rounded border text-left transition-colors ${
                          selected
                            ? 'cmms-badge-info border-[var(--accent-color)]'
                            : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <div className="font-bold text-[var(--text-primary)]">{tier}</div>
                        <div className="text-[10px] font-mono-tech mt-0.5">
                          {preset.maxMachines} Mach &middot; {preset.maxUsers} Users
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Plant Location</label>
                  <input
                    type="text"
                    value={editingSub.plantLocation}
                    onChange={(e) =>
                      setEditingSub({ ...editingSub, plantLocation: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">
                    Subscription Status
                  </label>
                  <select
                    value={editingSub.status}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        status: e.target.value as CompanySubscriptionConfig['status'],
                      })
                    }
                    className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  >
                    <option value="Active">Active</option>
                    <option value="Trial">Trial</option>
                    <option value="Past Due">Past Due</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Expires On</label>
                  <input
                    type="date"
                    value={editingSub.expiresAt}
                    onChange={(e) => setEditingSub({ ...editingSub, expiresAt: e.target.value })}
                    className="w-full px-2.5 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono-tech text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Max Machines</label>
                  <input
                    type="number"
                    min={1}
                    value={editingSub.maxMachines}
                    onChange={(e) =>
                      setEditingSub({ ...editingSub, maxMachines: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono-tech text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Max Users</label>
                  <input
                    type="number"
                    min={1}
                    value={editingSub.maxUsers}
                    onChange={(e) =>
                      setEditingSub({ ...editingSub, maxUsers: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono-tech text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Max Store Items</label>
                  <input
                    type="number"
                    min={1}
                    value={editingSub.maxStoreItems}
                    onChange={(e) =>
                      setEditingSub({ ...editingSub, maxStoreItems: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono-tech text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setEditingSub(null)}
                  className="px-4 py-2 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSub}
                  className="px-4 py-2 rounded bg-[var(--accent-color)] text-white font-semibold"
                >
                  {savingSub ? 'Saving...' : 'Save Subscription & Quotas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: WORKSPACE INSPECTOR (LIVE DATA PREVIEW + FULL BYPASS)
          ===================================================================== */}
      {inspectTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="cmms-card rounded-md max-w-4xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Workspace Inspector — {inspectTarget.companyName} ({inspectTarget.companyCode})
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Read-only live data inspection or switch into this workspace for full editing.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const code = inspectTarget.companyCode;
                    const name = inspectTarget.companyName;
                    setInspectTarget(null);
                    onSelectCompanyWorkspace(code, name);
                  }}
                  className="px-3 py-1.5 rounded bg-[var(--accent-color)] text-white text-xs font-semibold"
                >
                  Enter Full Workspace &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => setInspectTarget(null)}
                  className="p-1.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {inspectTarget.loading || !inspectTarget.data ? (
              <div className="py-12 text-center text-xs font-mono-tech text-[var(--text-secondary)]">
                Loading isolated workspace records for {inspectTarget.companyCode}...
              </div>
            ) : (
              <div className="overflow-y-auto space-y-4 pr-1 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-tech">
                  <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <div className="text-[var(--text-secondary)]">Users</div>
                    <div className="text-lg font-bold text-[var(--text-primary)]">
                      {inspectTarget.data.users.length}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <div className="text-[var(--text-secondary)]">Machines</div>
                    <div className="text-lg font-bold text-[var(--text-primary)]">
                      {inspectTarget.data.machines.length}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <div className="text-[var(--text-secondary)]">Breakdown Logs</div>
                    <div className="text-lg font-bold text-[var(--text-primary)]">
                      {inspectTarget.data.breakdownLogs.length}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <div className="text-[var(--text-secondary)]">Spare Parts</div>
                    <div className="text-lg font-bold text-[var(--text-primary)]">
                      {inspectTarget.data.spareParts.length}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-bold text-[var(--text-primary)] mb-1.5">
                    Registered Users in {inspectTarget.companyCode}
                  </div>
                  <div className="border border-[var(--border-color)] rounded overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[var(--bg-secondary)] text-[11px] font-mono-tech text-[var(--text-secondary)]">
                          <th className="py-2 px-3">Email</th>
                          <th className="py-2 px-3">Role</th>
                          <th className="py-2 px-3">Shift</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)]">
                        {inspectTarget.data.users.map((u) => (
                          <tr key={u.id}>
                            <td className="py-2 px-3 font-mono-tech">{u.email}</td>
                            <td className="py-2 px-3">{u.role}</td>
                            <td className="py-2 px-3 font-mono-tech">{u.shift}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="font-bold text-[var(--text-primary)] mb-1.5">
                    Machines &amp; Fleet Status ({inspectTarget.data.machines.length})
                  </div>
                  {inspectTarget.data.machines.length === 0 ? (
                    <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-secondary)]">
                      No machines registered in this workspace yet.
                    </div>
                  ) : (
                    <div className="border border-[var(--border-color)] rounded overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[var(--bg-secondary)] text-[11px] font-mono-tech text-[var(--text-secondary)]">
                            <th className="py-2 px-3">Code</th>
                            <th className="py-2 px-3">Machine Name</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">Health</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                          {inspectTarget.data.machines.map((m) => (
                            <tr key={m.id}>
                              <td className="py-2 px-3 font-mono-tech">{m.code}</td>
                              <td className="py-2 px-3">{m.name}</td>
                              <td className="py-2 px-3 font-mono-tech">{m.status}</td>
                              <td className="py-2 px-3 font-mono-tech">{m.healthScore}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
