import {
  ActivityLogItem,
  CompanyDirectoryItem,
  CompanySubscriptionConfig,
  EmailBroadcastLogItem,
  GlobalAnnouncementItem,
  OFFICIAL_SENDER_EMAIL,
  OFFICIAL_SENDER_NAME,
  PLANT_SHIFTS,
  PlantStateData,
  PlantUser,
  SUPER_ADMIN_EMAILS,
  SubscriptionPlanTier,
  SuperAdminOverviewData,
  UpdateRequestItem,
  normalizeShiftLabel,
} from '../types.ts';

const STORAGE_KEY_PREFIX = 'cmms_plant_state_v2_';
const GLOBAL_UPDATE_REQUESTS_KEY = 'cmms_global_update_requests_v1';
const DELETED_COMPANY_CODES_KEY = 'cmms_deleted_company_codes_v1';
const GLOBAL_SUBSCRIPTIONS_KEY = 'cmms_global_subscriptions_v1';
const GLOBAL_ANNOUNCEMENTS_KEY = 'cmms_global_announcements_v1';
const GLOBAL_EMAIL_BROADCASTS_KEY = 'cmms_global_email_broadcasts_v1';
const LAST_MANUAL_BACKUP_KEY = 'cmms_last_manual_backup_v1';
const CLIENT_BOOT_MS = Date.now();

export const RETIRED_COMPANY_CODES = new Set([
  'DEFAULT-FACTORY',
  'FACTORY-01',
  'MAIN-INDUSTRIAL-FACTORY',
  'MAIN-INDUSTRIAL-FACTORY-2',
  'UNASSIGNED-COMPANY',
]);

export const RETIRED_COMPANY_NAMES = new Set([
  'default factory',
  'main industrial factory',
  'default industrial plant',
]);

function loadDeletedCompanyCodes(): Set<string> {
  const set = new Set<string>(RETIRED_COMPANY_CODES);
  try {
    const raw = localStorage.getItem(DELETED_COMPANY_CODES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string' && item.trim()) {
            set.add(item.trim().toUpperCase());
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return set;
}

export function isRetiredOrDeletedCompany(
  rawCode?: string | null,
  rawName?: string | null
): boolean {
  const code = (rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-');
  const name = (rawName || '').trim().toLowerCase();
  const deletedCodes = loadDeletedCompanyCodes();
  if (code && deletedCodes.has(code)) return true;
  if (name && RETIRED_COMPANY_NAMES.has(name)) return true;
  return false;
}

export function purgeRetiredLocalStorageCompanies() {
  try {
    const deletedCodes = loadDeletedCompanyCodes();
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(STORAGE_KEY_PREFIX)) {
        const code = k.slice(STORAGE_KEY_PREFIX.length).toUpperCase();
        const raw = localStorage.getItem(k);
        let companyName = '';
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            companyName = parsed?.users?.[0]?.companyName || '';
          } catch {
            // ignore
          }
        }
        if (deletedCodes.has(code) || isRetiredOrDeletedCompany(code, companyName)) {
          keysToRemove.push(k);
        }
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

export function deleteLocalCompanyProfile(rawCompanyCode: string) {
  const code = normalizeCode(rawCompanyCode);
  if (!code) return;
  try {
    const deletedSet = loadDeletedCompanyCodes();
    deletedSet.add(code);
    localStorage.setItem(DELETED_COMPANY_CODES_KEY, JSON.stringify(Array.from(deletedSet)));
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${code}`);
    localStorage.removeItem(`cmms_screenshot_ack_v1_${code}`);

    const allReqs = loadGlobalUpdateRequests();
    const filteredReqs = allReqs.filter((r) => normalizeCode(r.companyCode) !== code);
    saveGlobalUpdateRequests(filteredReqs);
  } catch {
    // ignore
  }
}

export function unmarkDeletedCompanyCode(rawCompanyCode: string) {
  const code = normalizeCode(rawCompanyCode);
  if (!code || RETIRED_COMPANY_CODES.has(code)) return;
  try {
    const raw = localStorage.getItem(DELETED_COMPANY_CODES_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const next = parsed.filter((c) => String(c).toUpperCase() !== code);
      localStorage.setItem(DELETED_COMPANY_CODES_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore
  }
}

function loadGlobalUpdateRequests(): UpdateRequestItem[] {
  try {
    const raw = localStorage.getItem(GLOBAL_UPDATE_REQUESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function saveGlobalUpdateRequests(list: UpdateRequestItem[]) {
  try {
    localStorage.setItem(GLOBAL_UPDATE_REQUESTS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function normalizeCode(raw?: string | null): string {
  const cleaned = (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-');
  return cleaned;
}

function getStorageKey(companyCode?: string): string {
  return `${STORAGE_KEY_PREFIX}${normalizeCode(companyCode)}`;
}

export function buildLocalCompaniesDirectory(): CompanyDirectoryItem[] {
  purgeRetiredLocalStorageCompanies();
  const list: CompanyDirectoryItem[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEY_PREFIX)) continue;
      const code = k.slice(STORAGE_KEY_PREFIX.length);
      if (!code || isRetiredOrDeletedCompany(code)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed: PlantStateData = JSON.parse(raw);
      const firstUserWithCompany = parsed.users?.find((u) => u.companyName);
      const companyName = firstUserWithCompany?.companyName || code;
      if (isRetiredOrDeletedCompany(code, companyName)) continue;
      const plantAdmins = Array.from(
        new Set(
          (parsed.users || [])
            .filter((u) => u.role?.toLowerCase().includes('admin'))
            .map((u) => u.email)
        )
      );
      const openBreakdowns = (parsed.breakdownLogs || []).filter(
        (b) => b.status !== 'Resolved' && b.status !== 'Closed'
      ).length;
      list.push({
        companyCode: code,
        companyName,
        plantAdmins,
        userCount: parsed.users?.length || 0,
        departmentCount: parsed.departments?.length || 0,
        machineCount: parsed.machines?.length || 0,
        openBreakdowns,
        sparePartCount: parsed.spareParts?.length || 0,
        lastActiveAt: parsed.syncedAt || new Date().toISOString(),
      });
    }
  } catch {
    // ignore storage scan errors
  }
  return list.sort((a, b) => (b.lastActiveAt > a.lastActiveAt ? 1 : -1));
}

const DEFAULT_EMPTY_STATE: PlantStateData = {
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

export function loadLocalPlantState(
  user?: {
    uid: string;
    email: string | null;
    displayName: string | null;
  },
  workspace?: {
    companyCode?: string;
    companyName?: string;
    selectedRole?: string;
    selectedShift?: string;
    forceProfileUpdate?: boolean;
  }
): PlantStateData {
  const companyCode = normalizeCode(workspace?.companyCode);
  const companyName = workspace?.companyName?.trim() || companyCode;
  if (!companyCode || isRetiredOrDeletedCompany(companyCode, companyName)) {
    const emptyState: PlantStateData = {
      ...JSON.parse(JSON.stringify(DEFAULT_EMPTY_STATE)),
      companyDirectory: buildLocalCompaniesDirectory(),
      syncedAt: new Date().toISOString(),
    };
    return emptyState;
  }
  const key = getStorageKey(companyCode);

  try {
    const raw = localStorage.getItem(key);
    const state: PlantStateData = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_EMPTY_STATE));

    if (user && user.email) {
      const existingIdx = state.users.findIndex(
        (u) => u.uid === user.uid || u.email.toLowerCase() === user.email!.toLowerCase()
      );
      const nowIso = new Date().toISOString();
      const chosenRole = workspace?.selectedRole || 'Plant Admin';
      const chosenShift = normalizeShiftLabel(workspace?.selectedShift || PLANT_SHIFTS[0]);
      const rlsLevel = chosenRole === 'Plant Admin' ? 'FULL_RLS_SUPERUSER' : 'COMPANY_RLS_SCOPED';

      if (existingIdx === -1) {
        const newUser = {
          id: state.users.length + 1,
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email.split('@')[0],
          companyCode,
          companyName,
          role: chosenRole,
          departmentId: state.departments[0]?.id ?? null,
          phone: '',
          shift: chosenShift,
          rlsPolicyLevel: rlsLevel,
          lastSyncedAt: nowIso,
        };
        state.users = [newUser, ...state.users];
        state.currentUser = newUser;
      } else {
        state.users[existingIdx].companyCode = companyCode;
        state.users[existingIdx].companyName = companyName;
        state.users[existingIdx].shift = normalizeShiftLabel(state.users[existingIdx].shift);
        state.users[existingIdx].lastSyncedAt = nowIso;
        if (workspace?.forceProfileUpdate) {
          if (workspace.selectedRole) {
            state.users[existingIdx].role = workspace.selectedRole;
            state.users[existingIdx].rlsPolicyLevel = rlsLevel;
          }
          if (workspace.selectedShift) {
            state.users[existingIdx].shift = normalizeShiftLabel(workspace.selectedShift);
          }
        }
        state.currentUser = state.users[existingIdx];
      }
    }

    state.syncedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(state));
    state.companyDirectory = buildLocalCompaniesDirectory();
    const isSuper =
      user?.email &&
      SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === user.email!.toLowerCase());
    const allReqs = loadGlobalUpdateRequests();
    state.updateRequests = isSuper
      ? allReqs
      : allReqs.filter((r) => normalizeCode(r.companyCode) === companyCode);
    const allNotices = loadGlobalAnnouncements();
    state.globalAnnouncements = allNotices.filter(
      (a) =>
        a.active &&
        (a.targetCompanyCode === 'ALL' || normalizeCode(a.targetCompanyCode) === companyCode)
    );
    return state;
  } catch {
    return { ...JSON.parse(JSON.stringify(DEFAULT_EMPTY_STATE)), syncedAt: new Date().toISOString() };
  }
}

export function saveLocalPlantState(state: PlantStateData, companyCode?: string): PlantStateData {
  state.syncedAt = new Date().toISOString();
  const cleanCode = normalizeCode(companyCode);
  try {
    if (cleanCode && !isRetiredOrDeletedCompany(cleanCode)) {
      localStorage.setItem(getStorageKey(cleanCode), JSON.stringify(state));
    }
    if (!state.companyDirectory || state.companyDirectory.length === 0) {
      state.companyDirectory = buildLocalCompaniesDirectory();
    } else {
      const localDir = buildLocalCompaniesDirectory();
      const mergedMap = new Map<string, CompanyDirectoryItem>();
      for (const item of state.companyDirectory) {
        if (!isRetiredOrDeletedCompany(item.companyCode, item.companyName)) {
          mergedMap.set(item.companyCode, item);
        }
      }
      for (const item of localDir) {
        if (!mergedMap.has(item.companyCode) && !isRetiredOrDeletedCompany(item.companyCode, item.companyName)) {
          mergedMap.set(item.companyCode, item);
        }
      }
      state.companyDirectory = Array.from(mergedMap.values());
    }
  } catch {
    // ignore storage quota errors
  }
  return state;
}

function appendLog(
  state: PlantStateData,
  actorEmail: string,
  actorRole: string,
  module: string,
  action: string,
  entityCode: string,
  details: string
) {
  const nextId = (state.activityLogs[0]?.id || 0) + 1;
  state.activityLogs = [
    {
      id: nextId,
      actorEmail,
      actorRole,
      module,
      action,
      entityCode,
      details,
      createdAt: new Date().toISOString(),
    },
    ...state.activityLogs,
  ];
}

export function applyLocalMutation(
  url: string,
  method: string,
  payload: any,
  actorEmail: string,
  companyCode?: string
): PlantStateData {
  const activeCode = normalizeCode(payload?.companyCode || companyCode);
  const state = loadLocalPlantState(undefined, { companyCode: activeCode });
  const nextId = (arr: { id: number }[]) =>
    arr.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;

  if (url === '/api/users/switch-profile' && method === 'POST') {
    const newCode = normalizeCode(payload?.companyCode || activeCode);
    const newName = payload?.companyName || newCode;
    const newRole = payload?.role || 'Plant Admin';
    const newShift = normalizeShiftLabel(payload?.shift || PLANT_SHIFTS[0]);
    const nextState = loadLocalPlantState(
      {
        uid: payload?.uid || actorEmail,
        email: actorEmail,
        displayName: actorEmail.split('@')[0],
      },
      {
        companyCode: newCode,
        companyName: newName,
        selectedRole: newRole,
        selectedShift: newShift,
        forceProfileUpdate: true,
      }
    );
    appendLog(
      nextState,
      actorEmail,
      newRole,
      'RLS Policy',
      'SWITCHED_COMPANY_OR_ROLE',
      newCode,
      `Switched active profile to Company [${newName} (${newCode})] • Role [${newRole}]`
    );
    return saveLocalPlantState(nextState, newCode);
  }

  if (url === '/api/sync-backup' && method === 'POST') {
    appendLog(
      state,
      actorEmail,
      'Authenticated Gmail Operator',
      'Auth/Sync',
      'REALTIME_BACKUP_SYNC',
      'PG-SYNC-OK',
      `Synchronized multi-account Gmail session (${actorEmail}) from ${payload?.deviceLabel || 'Terminal'}`
    );
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/departments' && method === 'POST') {
    const id = nextId(state.departments);
    state.departments.push({ id, companyCode: activeCode, ...payload });
    appendLog(state, actorEmail, 'Plant Admin', 'RLS Policy', 'CREATED_DEPARTMENT', payload.code, `Created department ${payload.name}`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/sections' && method === 'POST') {
    const id = nextId(state.sections);
    state.sections.push({
      id,
      code: payload.code,
      name: payload.name,
      departmentId: payload.departmentId ? Number(payload.departmentId) : null,
      supervisor: payload.supervisor,
      floorZone: payload.floorZone,
      status: payload.status || 'Operational',
    });
    appendLog(state, actorEmail, 'Plant Admin', 'Assets', 'CREATED_SECTION', payload.code, `Created plant section ${payload.name}`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/machines' && method === 'POST') {
    let sectionId = payload.sectionId ? Number(payload.sectionId) : 0;
    if (!sectionId) {
      if (state.sections.length === 0) {
        state.sections.push({
          id: 1,
          code: 'SEC-01',
          name: 'Main Production Floor',
          departmentId: null,
          supervisor: actorEmail,
          floorZone: 'Zone A',
          status: 'Operational',
        });
      }
      sectionId = state.sections[0].id;
    }
    const id = nextId(state.machines);
    state.machines.push({
      id,
      code: payload.code,
      name: payload.name,
      sectionId,
      manufacturer: payload.manufacturer,
      modelNumber: payload.modelNumber,
      serialNumber: payload.serialNumber,
      criticality: payload.criticality || 'High',
      status: payload.status || 'Running',
      operatingHours: 0,
      healthScore: 100,
      installedDate: payload.installedDate || new Date().toISOString().slice(0, 10),
    });
    appendLog(state, actorEmail, 'Plant Engineer', 'Assets', 'REGISTERED_MACHINE', payload.code, `Registered machine ${payload.name}`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/components' && method === 'POST') {
    const id = nextId(state.components);
    state.components.push({
      id,
      code: payload.code,
      name: payload.name,
      machineId: Number(payload.machineId),
      category: payload.category,
      specification: payload.specification,
      condition: payload.condition || 'Optimal',
      installedDate: payload.installedDate || new Date().toISOString().slice(0, 10),
    });
    appendLog(state, actorEmail, 'Maintenance Engineer', 'Assets', 'ADDED_COMPONENT', payload.code, `Attached component ${payload.name}`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/spare-parts' && method === 'POST') {
    const id = nextId(state.spareParts);
    state.spareParts.push({
      id,
      partNumber: payload.partNumber,
      name: payload.name,
      componentId: payload.componentId ? Number(payload.componentId) : null,
      machineId: payload.machineId ? Number(payload.machineId) : null,
      category: payload.category,
      unit: payload.unit || 'PCS',
      unitCost: Number(payload.unitCost) || 0,
      minStockLevel: Number(payload.minStockLevel) || 5,
      leadTimeDays: Number(payload.leadTimeDays) || 7,
    });
    const stockId = nextId(state.spareStock);
    const initialStock = Number(payload.initialStock) || 0;
    const minLevel = Number(payload.minStockLevel) || 5;
    state.spareStock.push({
      id: stockId,
      sparePartId: id,
      binLocation: payload.binLocation || 'BIN-01',
      quantityOnHand: initialStock,
      reservedQty: 0,
      reorderPoint: minLevel,
      maxCapacity: Math.max(minLevel * 4, 25),
      lastCountedAt: new Date().toISOString(),
    });
    if (initialStock <= minLevel) {
      state.lowStockAlerts.unshift({
        id: nextId(state.lowStockAlerts),
        sparePartId: id,
        currentQty: initialStock,
        thresholdQty: minLevel,
        severity: initialStock === 0 ? 'Critical' : 'Warning',
        alertStatus: 'Active',
        triggeredAt: new Date().toISOString(),
      });
    }
    appendLog(state, actorEmail, 'Store Keeper', 'Assets', 'CATALOGED_SPARE_PART', payload.partNumber, `Cataloged spare part ${payload.name}`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/breakdowns' && method === 'POST') {
    const id = nextId(state.breakdownLogs);
    state.breakdownLogs.unshift({
      id,
      ticketCode: payload.ticketCode,
      machineId: Number(payload.machineId),
      sectionId: payload.sectionId ? Number(payload.sectionId) : null,
      severity: payload.severity || 'Critical',
      failureMode: payload.failureMode,
      rootCause: payload.rootCause || 'Pending Investigation',
      actionTaken: 'Logged for maintenance intervention.',
      reportedBy: actorEmail,
      assignedTechnician: payload.assignedTechnician || actorEmail,
      downtimeMinutes: Number(payload.downtimeMinutes) || 0,
      status: 'Open',
      reportedAt: new Date().toISOString(),
      resolvedAt: null,
    });
    const mch = state.machines.find((m) => m.id === Number(payload.machineId));
    if (mch) {
      mch.status = 'Breakdown';
      mch.healthScore = 65;
    }
    appendLog(state, actorEmail, 'Maintenance Engineer', 'Maintenance', 'LOGGED_BREAKDOWN', payload.ticketCode, `Logged breakdown: ${payload.failureMode}`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url.startsWith('/api/breakdowns/') && method === 'PATCH') {
    const id = Number(url.split('/').pop());
    const bd = state.breakdownLogs.find((b) => b.id === id);
    if (bd) {
      bd.status = payload.status;
      bd.actionTaken = payload.actionTaken || bd.actionTaken;
      if (payload.status === 'Resolved') {
        bd.resolvedAt = new Date().toISOString();
        const mch = state.machines.find((m) => m.id === bd.machineId);
        if (mch) {
          mch.status = 'Running';
          mch.healthScore = 95;
        }
        state.machineHistory.unshift({
          id: nextId(state.machineHistory),
          machineId: bd.machineId,
          eventType: 'Breakdown Repair',
          summary: `Resolved ${bd.ticketCode}: ${bd.actionTaken}`,
          partsReplaced: 'See Stock Issues',
          technician: bd.assignedTechnician || actorEmail,
          costIncurred: 0,
          eventDate: new Date().toISOString().slice(0, 10),
        });
      }
      appendLog(state, actorEmail, 'Maintenance Engineer', 'Maintenance', 'UPDATED_BREAKDOWN', bd.ticketCode, `Updated status to ${payload.status}`);
    }
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/daily-maintenance' && method === 'POST') {
    const id = nextId(state.dailyMaintenance);
    state.dailyMaintenance.unshift({
      id,
      machineId: Number(payload.machineId),
      checklistTitle: payload.checklistTitle,
      shift: normalizeShiftLabel(payload.shift),
      operatorName: payload.operatorName || actorEmail,
      lubricationOk: Boolean(payload.lubricationOk),
      pressureBar: payload.pressureBar || '6.2 BAR',
      temperatureCelsius: payload.temperatureCelsius || '44°C',
      vibrationMmS: payload.vibrationMmS || '1.4 mm/s',
      remarks: payload.remarks || 'Nominal parameters',
      status: payload.status || 'Completed',
      checkedAt: new Date().toISOString(),
    });
    appendLog(state, actorEmail, 'Maintenance Operator', 'Maintenance', 'DAILY_CHECKLIST', `DM-${id}`, `Completed daily checklist "${payload.checklistTitle}"`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/preventive-schedules' && method === 'POST') {
    const id = nextId(state.preventiveSchedules);
    state.preventiveSchedules.push({
      id,
      scheduleCode: payload.scheduleCode,
      machineId: Number(payload.machineId),
      title: payload.title,
      frequency: payload.frequency,
      assignedEngineer: payload.assignedEngineer || actorEmail,
      nextDueDate: payload.nextDueDate,
      estimatedHours: Number(payload.estimatedHours) || 4,
      complianceStatus: 'Scheduled',
    });
    appendLog(state, actorEmail, 'Reliability Engineer', 'Maintenance', 'CREATED_PM_SCHEDULE', payload.scheduleCode, `Scheduled PM "${payload.title}"`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/complaints' && method === 'POST') {
    const id = nextId(state.complaints);
    state.complaints.unshift({
      id,
      complaintCode: payload.complaintCode,
      machineId: Number(payload.machineId),
      sectionId: payload.sectionId ? Number(payload.sectionId) : null,
      title: payload.title,
      description: payload.description,
      priority: payload.priority || 'High',
      workflowStage: payload.assignedTo && payload.assignedTo !== 'Unassigned' ? 'Assigned' : 'New',
      raisedBy: actorEmail,
      assignedTo: payload.assignedTo || 'Unassigned',
      workNotes: '',
      verifiedByProduction: 'Pending Verification',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    appendLog(state, actorEmail, 'Production Supervisor', 'Complaints', 'RAISED_COMPLAINT', payload.complaintCode, `Raised complaint "${payload.title}"`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url.endsWith('/workflow') && method === 'PATCH') {
    const parts = url.split('/');
    const id = Number(parts[parts.length - 2]);
    const item = state.complaints.find((c) => c.id === id);
    if (item) {
      item.workflowStage = payload.nextStage;
      item.assignedTo = payload.assignedTo || actorEmail;
      item.workNotes = payload.workNotes || item.workNotes;
      item.verifiedByProduction = payload.verifiedByProduction || item.verifiedByProduction;
      item.updatedAt = new Date().toISOString();
      appendLog(state, actorEmail, 'Plant Engineer', 'Complaints', 'WORKFLOW_TRANSITION', item.complaintCode, `Moved complaint to [${payload.nextStage}]`);
    }
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/store/issue' && method === 'POST') {
    const id = nextId(state.stockIssues);
    state.stockIssues.unshift({
      id,
      issueCode: payload.issueCode,
      sparePartId: Number(payload.sparePartId),
      machineId: payload.machineId ? Number(payload.machineId) : null,
      quantityIssued: Number(payload.quantityIssued),
      issuedTo: payload.issuedTo || actorEmail,
      workOrderRef: payload.workOrderRef,
      issuedBy: actorEmail,
      issuedAt: new Date().toISOString(),
    });
    const st = state.spareStock.find((s) => s.sparePartId === Number(payload.sparePartId));
    if (st) {
      st.quantityOnHand = Math.max(0, st.quantityOnHand - Number(payload.quantityIssued));
      st.lastCountedAt = new Date().toISOString();
      if (st.quantityOnHand <= st.reorderPoint) {
        state.lowStockAlerts.unshift({
          id: nextId(state.lowStockAlerts),
          sparePartId: st.sparePartId,
          currentQty: st.quantityOnHand,
          thresholdQty: st.reorderPoint,
          severity: st.quantityOnHand <= 1 ? 'Critical' : 'Warning',
          alertStatus: 'Active',
          triggeredAt: new Date().toISOString(),
        });
      }
    }
    appendLog(state, actorEmail, 'Store Keeper', 'Store', 'ISSUED_STOCK', payload.issueCode, `Issued ${payload.quantityIssued} units`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/store/receive' && method === 'POST') {
    const id = nextId(state.stockReceives);
    state.stockReceives.unshift({
      id,
      grnCode: payload.grnCode,
      sparePartId: Number(payload.sparePartId),
      supplierName: payload.supplierName,
      quantityReceived: Number(payload.quantityReceived),
      unitPrice: Number(payload.unitPrice) || 0,
      invoiceNumber: payload.invoiceNumber,
      receivedBy: actorEmail,
      receivedAt: new Date().toISOString(),
    });
    const st = state.spareStock.find((s) => s.sparePartId === Number(payload.sparePartId));
    if (st) {
      st.quantityOnHand += Number(payload.quantityReceived);
      st.lastCountedAt = new Date().toISOString();
      if (st.quantityOnHand > st.reorderPoint) {
        state.lowStockAlerts.forEach((a) => {
          if (a.sparePartId === st.sparePartId) {
            a.alertStatus = 'Resolved';
            a.currentQty = st.quantityOnHand;
          }
        });
      }
    }
    appendLog(state, actorEmail, 'Store Keeper', 'Store', 'RECEIVED_GRN', payload.grnCode, `Received ${payload.quantityReceived} units`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/procurement/requisitions' && method === 'POST') {
    const id = nextId(state.requisitions);
    state.requisitions.unshift({
      id,
      reqNumber: payload.reqNumber,
      sparePartId: payload.sparePartId ? Number(payload.sparePartId) : null,
      itemDescription: payload.itemDescription,
      requestedQty: Number(payload.requestedQty),
      estimatedTotalCost: Number(payload.estimatedTotalCost),
      departmentId: payload.departmentId ? Number(payload.departmentId) : null,
      requestedBy: actorEmail,
      urgency: payload.urgency || 'High',
      status: 'Pending Approval',
      createdAt: new Date().toISOString(),
    });
    appendLog(state, actorEmail, 'Procurement', 'Procurement', 'CREATED_REQUISITION', payload.reqNumber, `Raised requisition ${payload.reqNumber}`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/procurement/approvals' && method === 'POST') {
    const reqItem = state.requisitions.find((r) => r.id === Number(payload.requisitionId));
    const newStatus =
      payload.decision === 'Approved'
        ? payload.vendorName
          ? 'PO Issued'
          : 'Approved'
        : 'Rejected';
    if (reqItem) {
      reqItem.status = newStatus;
    }
    state.approvals.unshift({
      id: nextId(state.approvals),
      requisitionId: Number(payload.requisitionId),
      approverName: actorEmail,
      approverRole: 'Procurement Approver',
      decision: payload.decision,
      comments: payload.comments || 'Approved',
      decidedAt: new Date().toISOString(),
    });
    if (reqItem && payload.decision === 'Approved' && payload.vendorName) {
      state.purchaseHistory.unshift({
        id: nextId(state.purchaseHistory),
        poNumber: `PO-${new Date().getFullYear()}-${String(reqItem.id).padStart(3, '0')}`,
        requisitionId: reqItem.id,
        vendorName: payload.vendorName,
        itemsSummary: `${reqItem.requestedQty}x ${reqItem.itemDescription}`,
        totalAmount: reqItem.estimatedTotalCost,
        deliveryStatus: 'In Transit',
        orderDate: new Date().toISOString().slice(0, 10),
      });
    }
    appendLog(state, actorEmail, 'Procurement Approver', 'Procurement', 'REQUISITION_DECISION', reqItem?.reqNumber || 'REQ', `Marked as ${newStatus}`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url.startsWith('/api/users/') && url.endsWith('/role') && method === 'PATCH') {
    const parts = url.split('/');
    const userId = Number(parts[parts.length - 2]);
    const u = state.users.find((usr) => usr.id === userId);
    if (u) {
      u.role = payload.role;
      u.departmentId = payload.departmentId ? Number(payload.departmentId) : null;
      u.shift = payload.shift;
      u.rlsPolicyLevel = payload.rlsPolicyLevel;
      u.lastSyncedAt = new Date().toISOString();
      if (state.currentUser && state.currentUser.id === u.id) {
        state.currentUser = { ...u };
      }
      appendLog(state, actorEmail, 'Plant Admin', 'RLS Policy', 'UPDATED_USER_RLS_ROLE', u.email, `Assigned role [${payload.role}]`);
    }
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/documents' && method === 'POST') {
    const id = nextId(state.documents);
    state.documents.unshift({
      id,
      docCode: payload.docCode,
      title: payload.title,
      category: payload.category,
      machineId: payload.machineId ? Number(payload.machineId) : null,
      fileFormat: payload.fileFormat || 'PDF',
      fileSizeKb: Number(payload.fileSizeKb) || 500,
      version: payload.version || 'v1.0',
      uploadedBy: actorEmail,
      rlsAccessRole: payload.rlsAccessRole || 'All Authenticated Staff',
      uploadedAt: new Date().toISOString(),
    });
    appendLog(state, actorEmail, 'Documentation Engineer', 'Assets', 'UPLOADED_DOCUMENT', payload.docCode, `Registered document "${payload.title}"`);
    return saveLocalPlantState(state, activeCode);
  }

  if (url === '/api/update-requests' && method === 'POST') {
    const allReqs = loadGlobalUpdateRequests();
    const id = nextId(allReqs);
    const reqCode = payload.requestCode || `UPD-${Date.now().toString().slice(-5)}`;
    const nowIso = new Date().toISOString();
    const newItem: UpdateRequestItem = {
      id,
      requestCode: reqCode,
      companyCode: activeCode,
      companyName: payload.companyName || activeCode,
      senderEmail: actorEmail,
      senderName: payload.senderName || actorEmail.split('@')[0],
      senderRole: payload.senderRole || 'Plant User',
      requestType: payload.requestType || 'New Feature Request',
      targetModule: payload.targetModule || 'Whole Webapp',
      priority: payload.priority || 'Normal',
      title: payload.title,
      description: payload.description,
      status: 'Pending Review',
      superAdminReply: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const updatedReqs = [newItem, ...allReqs];
    saveGlobalUpdateRequests(updatedReqs);
    const isSuper = SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === actorEmail.toLowerCase());
    state.updateRequests = isSuper
      ? updatedReqs
      : updatedReqs.filter((r) => normalizeCode(r.companyCode) === activeCode);
    appendLog(
      state,
      actorEmail,
      newItem.senderRole,
      'Update Request',
      'SUBMITTED_UPDATE_REQUEST',
      reqCode,
      `Submitted Request For An Update: "${payload.title}"`
    );
    return saveLocalPlantState(state, activeCode);
  }

  if (url.startsWith('/api/update-requests/') && method === 'PATCH') {
    const parts = url.split('/');
    const reqId = Number(parts[parts.length - 1]);
    const allReqs = loadGlobalUpdateRequests();
    const target = allReqs.find((r) => r.id === reqId);
    if (target) {
      target.status = payload.status || target.status;
      target.superAdminReply =
        payload.superAdminReply !== undefined ? payload.superAdminReply : target.superAdminReply;
      target.updatedAt = new Date().toISOString();
      saveGlobalUpdateRequests(allReqs);
    }
    const isSuper = SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === actorEmail.toLowerCase());
    state.updateRequests = isSuper
      ? allReqs
      : allReqs.filter((r) => normalizeCode(r.companyCode) === activeCode);
    return saveLocalPlantState(state, activeCode);
  }

  return saveLocalPlantState(state, activeCode);
}

export function loadGlobalSubscriptions(): Record<string, CompanySubscriptionConfig> {
  try {
    const raw = localStorage.getItem(GLOBAL_SUBSCRIPTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveGlobalSubscriptions(map: Record<string, CompanySubscriptionConfig>) {
  try {
    localStorage.setItem(GLOBAL_SUBSCRIPTIONS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function loadGlobalAnnouncements(): GlobalAnnouncementItem[] {
  try {
    const raw = localStorage.getItem(GLOBAL_ANNOUNCEMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  const initial: GlobalAnnouncementItem[] = [
    {
      id: 1,
      title: 'MAINTEX Multi-Company Workspace Isolation Active',
      message:
        'Every registered company operates in an isolated workspace with Role-Based Access Control (RBAC).',
      severity: 'Info',
      targetCompanyCode: 'ALL',
      active: true,
      createdBy: 'mdmahfuj0987@gmail.com',
      createdAt: new Date().toISOString(),
    },
  ];
  return initial;
}

export function saveGlobalAnnouncements(list: GlobalAnnouncementItem[]) {
  try {
    localStorage.setItem(GLOBAL_ANNOUNCEMENTS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function buildMergedSuperAdminOverview(
  serverOverview: SuperAdminOverviewData | null,
  knownCompanies: CompanyDirectoryItem[],
  currentPlantData: PlantStateData
): SuperAdminOverviewData {
  const subMap = loadGlobalSubscriptions();
  const defaultExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // 1. Merge companies
  const companyMap = new Map<string, CompanyDirectoryItem>();
  for (const c of serverOverview?.companies || []) {
    if (c.companyCode && !isRetiredOrDeletedCompany(c.companyCode, c.companyName)) {
      companyMap.set(c.companyCode, c);
    }
  }
  for (const c of knownCompanies) {
    if (c.companyCode && !isRetiredOrDeletedCompany(c.companyCode, c.companyName)) {
      const existing = companyMap.get(c.companyCode);
      if (!existing) {
        companyMap.set(c.companyCode, c);
      } else {
        companyMap.set(c.companyCode, {
          ...existing,
          userCount: Math.max(existing.userCount, c.userCount),
          departmentCount: Math.max(existing.departmentCount, c.departmentCount),
          machineCount: Math.max(existing.machineCount, c.machineCount),
          openBreakdowns: Math.max(existing.openBreakdowns, c.openBreakdowns),
          sparePartCount: Math.max(existing.sparePartCount, c.sparePartCount),
        });
      }
    }
  }

  // 2. Scan all local storage company states for users, logs, and table counts
  const userMap = new Map<string, PlantUser>();
  for (const u of serverOverview?.allUsers || []) {
    if (!isRetiredOrDeletedCompany(u.companyCode, u.companyName)) {
      userMap.set(`${u.email.toLowerCase()}::${u.companyCode || ''}`, u);
    }
  }

  const logList: ActivityLogItem[] = [...(serverOverview?.globalLogs || [])];
  const seenLogKeys = new Set(
    logList.map((l) => `${l.companyCode || ''}-${l.action}-${l.entityCode}-${l.createdAt}`)
  );

  const localCounts: Record<string, number> = {
    users: 0,
    departments: 0,
    sections: 0,
    machines: 0,
    components: 0,
    spare_parts: 0,
    breakdown_logs: 0,
    daily_maintenance: 0,
    preventive_schedules: 0,
    machine_history: 0,
    complaints: 0,
    spare_stock: 0,
    stock_issues: 0,
    stock_receives: 0,
    low_stock_alerts: 0,
    requisitions: 0,
    approvals: 0,
    purchase_history: 0,
    activity_logs: 0,
    documents: 0,
    update_requests: 0,
  };

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEY_PREFIX)) continue;
      const code = k.slice(STORAGE_KEY_PREFIX.length);
      if (!code || isRetiredOrDeletedCompany(code)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed: PlantStateData = JSON.parse(raw);

      localCounts.users += parsed.users?.length || 0;
      localCounts.departments += parsed.departments?.length || 0;
      localCounts.sections += parsed.sections?.length || 0;
      localCounts.machines += parsed.machines?.length || 0;
      localCounts.components += parsed.components?.length || 0;
      localCounts.spare_parts += parsed.spareParts?.length || 0;
      localCounts.breakdown_logs += parsed.breakdownLogs?.length || 0;
      localCounts.daily_maintenance += parsed.dailyMaintenance?.length || 0;
      localCounts.preventive_schedules += parsed.preventiveSchedules?.length || 0;
      localCounts.machine_history += parsed.machineHistory?.length || 0;
      localCounts.complaints += parsed.complaints?.length || 0;
      localCounts.spare_stock += parsed.spareStock?.length || 0;
      localCounts.stock_issues += parsed.stockIssues?.length || 0;
      localCounts.stock_receives += parsed.stockReceives?.length || 0;
      localCounts.low_stock_alerts += parsed.lowStockAlerts?.length || 0;
      localCounts.requisitions += parsed.requisitions?.length || 0;
      localCounts.approvals += parsed.approvals?.length || 0;
      localCounts.purchase_history += parsed.purchaseHistory?.length || 0;
      localCounts.activity_logs += parsed.activityLogs?.length || 0;
      localCounts.documents += parsed.documents?.length || 0;

      for (const u of parsed.users || []) {
        const cCode = normalizeCode(u.companyCode || code);
        if (isRetiredOrDeletedCompany(cCode, u.companyName)) continue;
        const mapKey = `${u.email.toLowerCase()}::${cCode}`;
        if (!userMap.has(mapKey)) {
          userMap.set(mapKey, {
            ...u,
            companyCode: cCode,
            companyName: u.companyName || cCode,
            shift: normalizeShiftLabel(u.shift),
            status: u.rlsPolicyLevel === 'SUSPENDED_ACCOUNT' ? 'Suspended' : u.status || 'Active',
            createdAt: u.createdAt || u.lastSyncedAt || new Date().toISOString(),
          });
        }
      }

      for (const l of parsed.activityLogs || []) {
        const lKey = `${code}-${l.action}-${l.entityCode}-${l.createdAt}`;
        if (!seenLogKeys.has(lKey)) {
          seenLogKeys.add(lKey);
          logList.push({
            ...l,
            companyCode: l.companyCode || code,
            ipAddress: l.ipAddress || 'Browser Session / Local Sync',
          });
        }
      }
    }
  } catch {
    // ignore
  }

  for (const serverSub of serverOverview?.subscriptions || []) {
    if (!subMap[serverSub.companyCode]) {
      subMap[serverSub.companyCode] = serverSub;
    }
  }

  const companies = Array.from(companyMap.values()).map((c) => {
    const savedSub = subMap[c.companyCode];
    return {
      ...c,
      plantLocation: savedSub?.plantLocation || c.plantLocation || 'Industrial Zone, Bangladesh',
    };
  });

  const subscriptions: CompanySubscriptionConfig[] = companies.map((c) => {
    const existing = subMap[c.companyCode];
    if (existing) {
      return {
        ...existing,
        companyName: c.companyName || existing.companyName,
      };
    }
    const created: CompanySubscriptionConfig = {
      companyCode: c.companyCode,
      companyName: c.companyName,
      plantLocation: c.plantLocation || 'Industrial Zone, Bangladesh',
      plan: 'Enterprise',
      status: 'Active',
      expiresAt: defaultExpiry,
      maxMachines: 250,
      maxUsers: 100,
      maxStoreItems: 2000,
      updatedAt: new Date().toISOString(),
    };
    subMap[c.companyCode] = created;
    return created;
  });
  saveGlobalSubscriptions(subMap);

  const localAnnouncements = loadGlobalAnnouncements();
  const announcements =
    serverOverview?.announcements && serverOverview.announcements.length > 0
      ? serverOverview.announcements
      : localAnnouncements;

  const localReqs = loadGlobalUpdateRequests();
  localCounts.update_requests = localReqs.length;
  const reqMap = new Map<string, UpdateRequestItem>();
  for (const r of serverOverview?.updateRequests || []) {
    reqMap.set(r.requestCode, r);
  }
  for (const r of currentPlantData.updateRequests || []) {
    if (!reqMap.has(r.requestCode)) reqMap.set(r.requestCode, r);
  }
  for (const r of localReqs) {
    if (!reqMap.has(r.requestCode)) reqMap.set(r.requestCode, r);
  }

  const localBroadcasts = loadGlobalEmailBroadcasts();
  const broadcastMap = new Map<string, EmailBroadcastLogItem>();
  for (const b of serverOverview?.emailBroadcasts || []) {
    broadcastMap.set(b.broadcastCode, b);
  }
  for (const b of localBroadcasts) {
    if (!broadcastMap.has(b.broadcastCode)) {
      broadcastMap.set(b.broadcastCode, b);
    }
  }
  const emailBroadcasts = Array.from(broadcastMap.values()).sort((a, b) =>
    b.sentAt > a.sentAt ? 1 : -1
  );

  const allUsers = Array.from(userMap.values()).sort((a, b) =>
    (b.lastSyncedAt || '') > (a.lastSyncedAt || '') ? 1 : -1
  );

  const sortedLogs = logList
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, 250);

  const tableBreakdown =
    serverOverview?.systemHealth?.tableBreakdown ||
    Object.entries(localCounts).map(([tableName, count]) => ({ tableName, count }));

  const totalRecordsCount = tableBreakdown.reduce((sum, item) => sum + item.count, 0);
  let lastBackupAt = serverOverview?.systemHealth?.lastBackupAt || new Date().toISOString();
  try {
    const savedBackup = localStorage.getItem(LAST_MANUAL_BACKUP_KEY);
    if (savedBackup && savedBackup > lastBackupAt) {
      lastBackupAt = savedBackup;
    }
  } catch {
    // ignore
  }

  return {
    allUsers,
    companies,
    subscriptions,
    globalLogs: sortedLogs,
    announcements,
    updateRequests: Array.from(reqMap.values()),
    emailBroadcasts,
    smtpConfigured: Boolean(serverOverview?.smtpConfigured),
    systemHealth: {
      dbStatus: serverOverview ? 'Connected' : 'Local Fallback',
      databaseEngine: serverOverview
        ? serverOverview.systemHealth.databaseEngine
        : 'PostgreSQL 16 (Cloud SQL + Local Storage Sync)',
      serverUptimeSeconds:
        serverOverview?.systemHealth?.serverUptimeSeconds ||
        Math.max(1, Math.floor((Date.now() - CLIENT_BOOT_MS) / 1000)),
      totalRecordsCount,
      tableBreakdown,
      lastBackupAt,
    },
  };
}

export function updateLocalSuperAdminUser(
  userId: number,
  userEmail: string,
  companyCode: string,
  updates: {
    role?: string;
    status?: 'Active' | 'Suspended';
    shift?: string;
  }
) {
  const cleanCode = normalizeCode(companyCode);
  if (!cleanCode) return;
  try {
    const key = getStorageKey(cleanCode);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const state: PlantStateData = JSON.parse(raw);
    state.users = (state.users || []).map((u) => {
      if (u.id === userId || u.email.toLowerCase() === userEmail.toLowerCase()) {
        const nextRole = updates.role || u.role;
        const nextStatus = updates.status || u.status || 'Active';
        const nextRls =
          nextStatus === 'Suspended'
            ? 'SUSPENDED_ACCOUNT'
            : nextRole.toLowerCase().includes('admin')
            ? 'FULL_RLS_SUPERUSER'
            : 'COMPANY_RLS_SCOPED';
        return {
          ...u,
          role: nextRole,
          status: nextStatus,
          shift: updates.shift ? normalizeShiftLabel(updates.shift) : u.shift,
          rlsPolicyLevel: nextRls,
          lastSyncedAt: new Date().toISOString(),
        };
      }
      return u;
    });
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function updateLocalCompanySubscription(
  companyCode: string,
  updates: Partial<CompanySubscriptionConfig>
): CompanySubscriptionConfig {
  const cleanCode = normalizeCode(companyCode);
  const map = loadGlobalSubscriptions();
  const current: CompanySubscriptionConfig = map[cleanCode] || {
    companyCode: cleanCode,
    companyName: updates.companyName || cleanCode,
    plantLocation: updates.plantLocation || 'Industrial Zone, Bangladesh',
    plan: 'Enterprise',
    status: 'Active',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    maxMachines: 250,
    maxUsers: 100,
    maxStoreItems: 2000,
    updatedAt: new Date().toISOString(),
  };
  const next: CompanySubscriptionConfig = {
    ...current,
    ...updates,
    companyCode: cleanCode,
    updatedAt: new Date().toISOString(),
  };
  map[cleanCode] = next;
  saveGlobalSubscriptions(map);
  return next;
}

export function createLocalAnnouncement(
  payload: {
    title: string;
    message: string;
    severity: 'Info' | 'Warning' | 'Critical';
    targetCompanyCode: string;
  },
  actorEmail: string
): GlobalAnnouncementItem {
  const list = loadGlobalAnnouncements();
  const nextId = list.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;
  const created: GlobalAnnouncementItem = {
    id: nextId,
    title: payload.title.trim(),
    message: payload.message.trim(),
    severity: payload.severity || 'Info',
    targetCompanyCode: payload.targetCompanyCode || 'ALL',
    active: true,
    createdBy: actorEmail,
    createdAt: new Date().toISOString(),
  };
  saveGlobalAnnouncements([created, ...list]);
  return created;
}

export function toggleLocalAnnouncement(id: number, active: boolean) {
  const list = loadGlobalAnnouncements().map((a) => (a.id === id ? { ...a, active } : a));
  saveGlobalAnnouncements(list);
}

export function deleteLocalAnnouncement(id: number) {
  const list = loadGlobalAnnouncements().filter((a) => a.id !== id);
  saveGlobalAnnouncements(list);
}

export function recordLocalBackupTimestamp(): string {
  const iso = new Date().toISOString();
  try {
    localStorage.setItem(LAST_MANUAL_BACKUP_KEY, iso);
  } catch {
    // ignore
  }
  return iso;
}

export function loadGlobalEmailBroadcasts(): EmailBroadcastLogItem[] {
  try {
    const raw = localStorage.getItem(GLOBAL_EMAIL_BROADCASTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function recordLocalEmailBroadcast(
  payload: {
    subject: string;
    bodyText: string;
    targetAudienceLabel: string;
    recipientEmails: string[];
    attachments: { name: string; mimeType: string; sizeBytes: number }[];
    deliveryMode?: 'GMAIL_API_SENT' | 'SMTP_VERIFIED' | 'QUEUED_GMAIL_DISPATCH';
    gmailMessageId?: string;
    senderEmailOverride?: string;
    broadcastCode?: string;
  },
  actorEmail: string
): EmailBroadcastLogItem {
  const list = loadGlobalEmailBroadcasts();
  const nextId = list.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;
  const code = payload.broadcastCode || `MAIL-${String(1000 + nextId)}`;
  const item: EmailBroadcastLogItem = {
    id: nextId,
    broadcastCode: code,
    senderName: OFFICIAL_SENDER_NAME,
    senderEmail: payload.senderEmailOverride || OFFICIAL_SENDER_EMAIL,
    subject: payload.subject.trim(),
    bodyText: payload.bodyText.trim(),
    targetAudienceLabel: payload.targetAudienceLabel || 'All Active Users',
    recipientEmails: payload.recipientEmails,
    recipientCount: payload.recipientEmails.length,
    attachments: payload.attachments || [],
    deliveryMode: payload.deliveryMode || 'GMAIL_API_SENT',
    gmailMessageId: payload.gmailMessageId,
    sentBy: actorEmail,
    sentAt: new Date().toISOString(),
  };
  const nextList = [item, ...list.filter((x) => x.broadcastCode !== code)].slice(0, 100);
  try {
    localStorage.setItem(GLOBAL_EMAIL_BROADCASTS_KEY, JSON.stringify(nextList));
  } catch {
    // ignore
  }
  return item;
}

