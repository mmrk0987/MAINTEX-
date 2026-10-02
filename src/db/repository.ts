import { and, desc, eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { db } from './index.ts';
import {
  activityLogs,
  approvals,
  breakdownLogs,
  complaints,
  components,
  dailyMaintenance,
  departments,
  documents,
  lowStockAlerts,
  machineHistory,
  machines,
  preventiveSchedules,
  purchaseHistory,
  requisitions,
  sections,
  spareParts,
  spareStock,
  stockIssues,
  stockReceives,
  updateRequests,
  users,
} from './schema.ts';
import {
  type CompanySubscriptionConfig,
  type EmailBroadcastAttachment,
  type EmailBroadcastLogItem,
  type GlobalAnnouncementItem,
  OFFICIAL_SENDER_EMAIL,
  OFFICIAL_SENDER_NAME,
  type SubscriptionPlanTier,
  type SuperAdminOverviewData,
  normalizeShiftLabel,
} from '../types.ts';

const SERVER_BOOT_TIME_MS = Date.now();
let lastManualBackupIso = new Date().toISOString();
const subscriptionStore = new Map<string, CompanySubscriptionConfig>();
let emailBroadcastsStore: EmailBroadcastLogItem[] = [];
let globalAnnouncementsStore: GlobalAnnouncementItem[] = [
  {
    id: 1,
    title: 'MAINTEX Enterprise Multi-Company Isolation Active',
    message:
      'All company workspaces are strictly isolated via companyCode & Role-Based Access Control (RBAC).',
    severity: 'Info',
    targetCompanyCode: 'ALL',
    active: true,
    createdBy: 'mdmahfuj0987@gmail.com',
    createdAt: new Date().toISOString(),
  },
];

export const BLOCKED_COMPANY_CODES = new Set([
  'DEFAULT-FACTORY',
  'FACTORY-01',
  'MAIN-INDUSTRIAL-FACTORY',
  'MAIN-INDUSTRIAL-FACTORY-2',
]);

export const BLOCKED_COMPANY_NAMES = new Set([
  'default factory',
  'main industrial factory',
  'default industrial plant',
]);

export function isBlockedPlaceholderCompany(
  rawCode?: string | null,
  rawName?: string | null
): boolean {
  const code = (rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-');
  const name = (rawName || '').trim().toLowerCase();
  if (code && BLOCKED_COMPANY_CODES.has(code)) return true;
  if (name && BLOCKED_COMPANY_NAMES.has(name)) return true;
  return false;
}

export function normalizeCompanyCode(raw?: string | null): string {
  const cleaned = (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-');
  return cleaned.length > 0 ? cleaned : 'UNASSIGNED-COMPANY';
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  rawCompanyCode?: string,
  rawCompanyName?: string,
  preferredRole?: string,
  preferredShift?: string,
  forceProfileUpdate = false
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const companyName =
      rawCompanyName && rawCompanyName.trim().length > 0
        ? rawCompanyName.trim()
        : companyCode;

    const cleanName =
      displayName && displayName.trim().length > 0
        ? displayName.trim()
        : email.split('@')[0].replace(/[._]/g, ' ');

    if (
      companyCode === 'UNASSIGNED-COMPANY' ||
      isBlockedPlaceholderCompany(companyCode, companyName)
    ) {
      return {
        id: 0,
        uid,
        email,
        displayName: cleanName,
        companyCode: '',
        companyName: '',
        role: preferredRole || 'Plant Admin',
        departmentId: null,
        phone: '',
        shift: normalizeShiftLabel(preferredShift),
        rlsPolicyLevel: 'COMPANY_RLS_SCOPED',
        lastSyncedAt: new Date(),
        createdAt: new Date(),
      };
    }

    const existingDepts = await db
      .select()
      .from(departments)
      .where(eq(departments.companyCode, companyCode))
      .orderBy(departments.id)
      .limit(1);
    const defaultDeptId = existingDepts.length > 0 ? existingDepts[0].id : null;

    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);
    const existingUser = existingUsers[0];

    const roleToUse =
      preferredRole && preferredRole.trim().length > 0
        ? preferredRole.trim()
        : existingUser?.role || 'Plant Admin';
    const shiftToUse = normalizeShiftLabel(
      preferredShift && preferredShift.trim().length > 0
        ? preferredShift.trim()
        : existingUser?.shift
    );
    const rlsLevel =
      roleToUse === 'Plant Admin' ? 'FULL_RLS_SUPERUSER' : 'COMPANY_RLS_SCOPED';

    if (!existingUser) {
      const inserted = await db
        .insert(users)
        .values({
          uid,
          email,
          displayName: cleanName,
          companyCode,
          companyName,
          role: roleToUse,
          departmentId: defaultDeptId,
          shift: shiftToUse,
          rlsPolicyLevel: rlsLevel,
          lastSyncedAt: new Date(),
        })
        .returning();
      return inserted[0];
    }

    const companyChanged = existingUser.companyCode !== companyCode;
    const updateSet: Record<string, any> = {
      email,
      companyCode,
      companyName,
      lastSyncedAt: new Date(),
    };

    if (companyChanged) {
      updateSet.departmentId = defaultDeptId;
    }

    if (forceProfileUpdate || companyChanged) {
      if (preferredRole && preferredRole.trim().length > 0) {
        updateSet.role = roleToUse;
        updateSet.rlsPolicyLevel = rlsLevel;
      }
      if (preferredShift && preferredShift.trim().length > 0) {
        updateSet.shift = shiftToUse;
      }
    }

    const updated = await db
      .update(users)
      .set(updateSet)
      .where(eq(users.uid, uid))
      .returning();

    return updated[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function switchUserCompanyAndRoleRecord(
  uid: string,
  email: string,
  displayName: string,
  rawCompanyCode: string,
  rawCompanyName: string,
  role: string,
  shift: string
) {
  const companyCode = normalizeCompanyCode(rawCompanyCode);
  const companyName =
    rawCompanyName && rawCompanyName.trim().length > 0
      ? rawCompanyName.trim()
      : companyCode;
  const updatedUser = await getOrCreateUser(
    uid,
    email,
    displayName,
    companyCode,
    companyName,
    role,
    shift,
    true
  );
  await logActivity(
    email,
    role,
    'RLS Policy',
    'SWITCHED_COMPANY_OR_ROLE',
    companyCode,
    `Active profile set to Company [${companyName} (${companyCode})] with Role [${role}] (${shift})`,
    companyCode
  );
  return updatedUser;
}

const WEBSITE_SUPER_ADMIN_EMAILS = [
  'mdmahfuj0987@gmail.com',
  'administration.maintex.com@gmail.com',
];

export function isWebsiteSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return WEBSITE_SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export async function getFullPlantState(rawCompanyCode?: string, requesterEmail?: string) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);

    const [
      deptList,
      userList,
      sectionList,
      machineList,
      componentList,
      sparePartList,
      breakdownList,
      dailyMaintList,
      pmScheduleList,
      historyList,
      complaintList,
      stockList,
      issueList,
      receiveList,
      alertList,
      requisitionList,
      approvalList,
      purchaseList,
      logList,
      documentList,
    ] = await Promise.all([
      db
        .select()
        .from(departments)
        .where(eq(departments.companyCode, companyCode))
        .orderBy(departments.id),
      db
        .select()
        .from(users)
        .where(eq(users.companyCode, companyCode))
        .orderBy(desc(users.lastSyncedAt)),
      db
        .select()
        .from(sections)
        .where(eq(sections.companyCode, companyCode))
        .orderBy(sections.id),
      db
        .select()
        .from(machines)
        .where(eq(machines.companyCode, companyCode))
        .orderBy(machines.id),
      db
        .select()
        .from(components)
        .where(eq(components.companyCode, companyCode))
        .orderBy(components.id),
      db
        .select()
        .from(spareParts)
        .where(eq(spareParts.companyCode, companyCode))
        .orderBy(spareParts.id),
      db
        .select()
        .from(breakdownLogs)
        .where(eq(breakdownLogs.companyCode, companyCode))
        .orderBy(desc(breakdownLogs.id)),
      db
        .select()
        .from(dailyMaintenance)
        .where(eq(dailyMaintenance.companyCode, companyCode))
        .orderBy(desc(dailyMaintenance.id)),
      db
        .select()
        .from(preventiveSchedules)
        .where(eq(preventiveSchedules.companyCode, companyCode))
        .orderBy(preventiveSchedules.id),
      db
        .select()
        .from(machineHistory)
        .where(eq(machineHistory.companyCode, companyCode))
        .orderBy(desc(machineHistory.id)),
      db
        .select()
        .from(complaints)
        .where(eq(complaints.companyCode, companyCode))
        .orderBy(desc(complaints.id)),
      db
        .select()
        .from(spareStock)
        .where(eq(spareStock.companyCode, companyCode))
        .orderBy(spareStock.id),
      db
        .select()
        .from(stockIssues)
        .where(eq(stockIssues.companyCode, companyCode))
        .orderBy(desc(stockIssues.id)),
      db
        .select()
        .from(stockReceives)
        .where(eq(stockReceives.companyCode, companyCode))
        .orderBy(desc(stockReceives.id)),
      db
        .select()
        .from(lowStockAlerts)
        .where(eq(lowStockAlerts.companyCode, companyCode))
        .orderBy(desc(lowStockAlerts.id)),
      db
        .select()
        .from(requisitions)
        .where(eq(requisitions.companyCode, companyCode))
        .orderBy(desc(requisitions.id)),
      db
        .select()
        .from(approvals)
        .where(eq(approvals.companyCode, companyCode))
        .orderBy(desc(approvals.id)),
      db
        .select()
        .from(purchaseHistory)
        .where(eq(purchaseHistory.companyCode, companyCode))
        .orderBy(desc(purchaseHistory.id)),
      db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.companyCode, companyCode))
        .orderBy(desc(activityLogs.id)),
      db
        .select()
        .from(documents)
        .where(eq(documents.companyCode, companyCode))
        .orderBy(desc(documents.id)),
    ]);

    const companyDirectory = isWebsiteSuperAdminEmail(requesterEmail)
      ? await getAllCompaniesDirectory()
      : [];

    const updateRequestList = isWebsiteSuperAdminEmail(requesterEmail)
      ? await db.select().from(updateRequests).orderBy(desc(updateRequests.id))
      : await db
          .select()
          .from(updateRequests)
          .where(eq(updateRequests.companyCode, companyCode))
          .orderBy(desc(updateRequests.id));

    const activeAnnouncements = globalAnnouncementsStore.filter(
      (a) =>
        a.active &&
        (a.targetCompanyCode === 'ALL' ||
          normalizeCompanyCode(a.targetCompanyCode) === companyCode)
    );

    return {
      companyDirectory,
      updateRequests: updateRequestList,
      globalAnnouncements: activeAnnouncements,
      departments: deptList,
      users: userList,
      sections: sectionList,
      machines: machineList,
      components: componentList,
      spareParts: sparePartList,
      breakdownLogs: breakdownList,
      dailyMaintenance: dailyMaintList,
      preventiveSchedules: pmScheduleList,
      machineHistory: historyList,
      complaints: complaintList,
      spareStock: stockList,
      stockIssues: issueList,
      stockReceives: receiveList,
      lowStockAlerts: alertList,
      requisitions: requisitionList,
      approvals: approvalList,
      purchaseHistory: purchaseList,
      activityLogs: logList,
      documents: documentList,
      syncedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Database query failed in getFullPlantState:', error);
    throw new Error('Failed to load plant maintenance state.', { cause: error });
  }
}

export async function getAllCompaniesDirectory() {
  try {
    const [allUsers, allDepts, allMachines, allBreakdowns, allParts] = await Promise.all([
      db.select().from(users).orderBy(desc(users.lastSyncedAt)),
      db.select().from(departments),
      db.select().from(machines),
      db.select().from(breakdownLogs),
      db.select().from(spareParts),
    ]);

    const map = new Map<
      string,
      {
        companyCode: string;
        companyName: string;
        plantAdmins: Set<string>;
        userCount: number;
        departmentCount: number;
        machineCount: number;
        openBreakdowns: number;
        sparePartCount: number;
        lastActiveAt: string;
      }
    >();

    const ensureEntry = (rawCode?: string | null, rawName?: string | null) => {
      const code = normalizeCompanyCode(rawCode);
      if (code === 'UNASSIGNED-COMPANY' || isBlockedPlaceholderCompany(code, rawName)) {
        return null;
      }
      if (!map.has(code)) {
        map.set(code, {
          companyCode: code,
          companyName: rawName && rawName.trim().length > 0 ? rawName.trim() : code,
          plantAdmins: new Set<string>(),
          userCount: 0,
          departmentCount: 0,
          machineCount: 0,
          openBreakdowns: 0,
          sparePartCount: 0,
          lastActiveAt: new Date().toISOString(),
        });
      } else if (rawName && rawName.trim().length > 0) {
        const current = map.get(code)!;
        if (current.companyName === current.companyCode) {
          current.companyName = rawName.trim();
        }
      }
      return map.get(code)!;
    };

    for (const u of allUsers) {
      const entry = ensureEntry(u.companyCode, u.companyName);
      if (!entry) continue;
      entry.userCount += 1;
      if (u.role?.toLowerCase().includes('admin')) {
        entry.plantAdmins.add(u.email);
      }
      if (u.lastSyncedAt) {
        const iso = new Date(u.lastSyncedAt).toISOString();
        if (iso > entry.lastActiveAt || entry.userCount === 1) {
          entry.lastActiveAt = iso;
        }
      }
    }

    for (const d of allDepts) {
      const entry = ensureEntry(d.companyCode);
      if (!entry) continue;
      entry.departmentCount += 1;
    }

    for (const m of allMachines) {
      const entry = ensureEntry(m.companyCode);
      if (!entry) continue;
      entry.machineCount += 1;
    }

    for (const b of allBreakdowns) {
      const entry = ensureEntry(b.companyCode);
      if (!entry) continue;
      if (b.status !== 'Resolved' && b.status !== 'Closed') {
        entry.openBreakdowns += 1;
      }
    }

    for (const sp of allParts) {
      const entry = ensureEntry(sp.companyCode);
      if (!entry) continue;
      entry.sparePartCount += 1;
    }

    return Array.from(map.values()).map((item) => ({
      companyCode: item.companyCode,
      companyName: item.companyName,
      plantAdmins: Array.from(item.plantAdmins),
      userCount: item.userCount,
      departmentCount: item.departmentCount,
      machineCount: item.machineCount,
      openBreakdowns: item.openBreakdowns,
      sparePartCount: item.sparePartCount,
      lastActiveAt: item.lastActiveAt,
    }));
  } catch (error) {
    console.error('Failed to build companies directory:', error);
    return [];
  }
}

export async function logActivity(
  actorEmail: string,
  actorRole: string,
  module: string,
  action: string,
  entityCode: string,
  details: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(activityLogs)
      .values({
        companyCode,
        actorEmail,
        actorRole,
        module,
        action,
        entityCode,
        details,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in logActivity:', error);
    throw new Error('Failed to record activity log.', { cause: error });
  }
}

export async function createDepartmentRecord(
  payload: {
    code: string;
    name: string;
    headName: string;
    location: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(departments)
      .values({
        companyCode,
        code: payload.code,
        name: payload.name,
        headName: payload.headName,
        location: payload.location,
      })
      .returning();
    await logActivity(
      actorEmail,
      'Plant Admin',
      'RLS Policy',
      'CREATED_DEPARTMENT',
      payload.code,
      `Created department ${payload.name} (${payload.location})`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createDepartmentRecord:', error);
    throw new Error('Failed to create department.', { cause: error });
  }
}

export async function createSectionRecord(
  payload: {
    code: string;
    name: string;
    departmentId?: number | null;
    supervisor: string;
    floorZone: string;
    status: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    let safeDeptId: number | null = null;
    if (payload.departmentId) {
      const deptRows = await db
        .select()
        .from(departments)
        .where(
          and(
            eq(departments.id, Number(payload.departmentId)),
            eq(departments.companyCode, companyCode)
          )
        );
      if (deptRows.length > 0) safeDeptId = deptRows[0].id;
    }

    const inserted = await db
      .insert(sections)
      .values({
        companyCode,
        code: payload.code,
        name: payload.name,
        departmentId: safeDeptId,
        supervisor: payload.supervisor,
        floorZone: payload.floorZone,
        status: payload.status || 'Operational',
      })
      .returning();
    await logActivity(
      actorEmail,
      'Plant Admin',
      'Assets',
      'CREATED_SECTION',
      payload.code,
      `Created plant section ${payload.name} at ${payload.floorZone}`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createSectionRecord:', error);
    throw new Error('Failed to create plant section.', { cause: error });
  }
}

export async function createMachineRecord(
  payload: {
    code: string;
    name: string;
    sectionId?: number | null;
    manufacturer: string;
    modelNumber: string;
    serialNumber: string;
    criticality: string;
    status: string;
    installedDate: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    let targetSectionId = payload.sectionId ? Number(payload.sectionId) : 0;
    if (!targetSectionId) {
      const existingSections = await db
        .select()
        .from(sections)
        .where(eq(sections.companyCode, companyCode));
      if (existingSections.length > 0) {
        targetSectionId = existingSections[0].id;
      } else {
        const defaultSec = await db
          .insert(sections)
          .values({
            companyCode,
            code: 'SEC-01',
            name: 'Main Production Floor',
            departmentId: null,
            supervisor: actorEmail,
            floorZone: 'Zone A',
            status: 'Operational',
          })
          .returning();
        targetSectionId = defaultSec[0].id;
      }
    }

    const inserted = await db
      .insert(machines)
      .values({
        companyCode,
        code: payload.code,
        name: payload.name,
        sectionId: targetSectionId,
        manufacturer: payload.manufacturer,
        modelNumber: payload.modelNumber,
        serialNumber: payload.serialNumber,
        criticality: payload.criticality || 'High',
        status: payload.status || 'Running',
        installedDate: payload.installedDate || new Date().toISOString().slice(0, 10),
        operatingHours: 0,
        healthScore: 100,
      })
      .returning();

    await logActivity(
      actorEmail,
      'Plant Engineer',
      'Assets',
      'REGISTERED_MACHINE',
      payload.code,
      `Registered machine ${payload.name} (${payload.modelNumber})`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createMachineRecord:', error);
    throw new Error('Failed to create machine asset.', { cause: error });
  }
}

export async function createComponentRecord(
  payload: {
    code: string;
    name: string;
    machineId: number;
    category: string;
    specification: string;
    condition: string;
    installedDate: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(components)
      .values({
        companyCode,
        ...payload,
      })
      .returning();
    await logActivity(
      actorEmail,
      'Maintenance Engineer',
      'Assets',
      'ADDED_COMPONENT',
      payload.code,
      `Attached component ${payload.name} (${payload.category}) to Machine #${payload.machineId}`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createComponentRecord:', error);
    throw new Error('Failed to create machine component.', { cause: error });
  }
}

export async function createSparePartRecord(
  payload: {
    partNumber: string;
    name: string;
    componentId?: number | null;
    machineId?: number | null;
    category: string;
    unit: string;
    unitCost: number;
    minStockLevel: number;
    leadTimeDays: number;
    initialStock: number;
    binLocation: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(spareParts)
      .values({
        companyCode,
        partNumber: payload.partNumber,
        name: payload.name,
        componentId: payload.componentId ? Number(payload.componentId) : null,
        machineId: payload.machineId ? Number(payload.machineId) : null,
        category: payload.category,
        unit: payload.unit,
        unitCost: payload.unitCost,
        minStockLevel: payload.minStockLevel,
        leadTimeDays: payload.leadTimeDays,
      })
      .returning();

    const part = inserted[0];

    await db.insert(spareStock).values({
      companyCode,
      sparePartId: part.id,
      binLocation: payload.binLocation || 'BIN-01',
      quantityOnHand: payload.initialStock,
      reservedQty: 0,
      reorderPoint: payload.minStockLevel,
      maxCapacity: Math.max(payload.minStockLevel * 4, 25),
    });

    if (payload.initialStock <= payload.minStockLevel) {
      await db.insert(lowStockAlerts).values({
        companyCode,
        sparePartId: part.id,
        currentQty: payload.initialStock,
        thresholdQty: payload.minStockLevel,
        severity: payload.initialStock === 0 ? 'Critical' : 'Warning',
        alertStatus: 'Active',
      });
    }

    await logActivity(
      actorEmail,
      'Store Keeper',
      'Assets',
      'CATALOGED_SPARE_PART',
      payload.partNumber,
      `Cataloged spare part ${payload.name} (${payload.initialStock} ${payload.unit} in ${payload.binLocation})`,
      companyCode
    );
    return part;
  } catch (error) {
    console.error('Database query failed in createSparePartRecord:', error);
    throw new Error('Failed to create spare part record.', { cause: error });
  }
}

export async function createBreakdownRecord(
  payload: {
    ticketCode: string;
    machineId: number;
    sectionId?: number | null;
    severity: string;
    failureMode: string;
    rootCause: string;
    assignedTechnician: string;
    downtimeMinutes: number;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(breakdownLogs)
      .values({
        companyCode,
        ticketCode: payload.ticketCode,
        machineId: Number(payload.machineId),
        sectionId: payload.sectionId ? Number(payload.sectionId) : null,
        severity: payload.severity,
        failureMode: payload.failureMode,
        rootCause: payload.rootCause || 'Pending Investigation',
        actionTaken: 'Logged for maintenance intervention.',
        reportedBy: actorEmail,
        assignedTechnician: payload.assignedTechnician || actorEmail,
        downtimeMinutes: Number(payload.downtimeMinutes) || 0,
        status: 'Open',
      })
      .returning();

    await db
      .update(machines)
      .set({ status: 'Breakdown', healthScore: 65 })
      .where(
        and(eq(machines.id, Number(payload.machineId)), eq(machines.companyCode, companyCode))
      );

    await logActivity(
      actorEmail,
      'Maintenance Engineer',
      'Maintenance',
      'LOGGED_BREAKDOWN',
      payload.ticketCode,
      `Logged ${payload.severity} breakdown on Machine #${payload.machineId}: ${payload.failureMode}`,
      companyCode
    );

    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createBreakdownRecord:', error);
    throw new Error('Failed to log breakdown.', { cause: error });
  }
}

export async function updateBreakdownStatusRecord(
  id: number,
  status: string,
  actionTaken: string,
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const updated = await db
      .update(breakdownLogs)
      .set({
        status,
        actionTaken,
        resolvedAt: status === 'Resolved' ? new Date() : null,
      })
      .where(and(eq(breakdownLogs.id, id), eq(breakdownLogs.companyCode, companyCode)))
      .returning();

    const record = updated[0];
    if (record && status === 'Resolved') {
      await db
        .update(machines)
        .set({ status: 'Running', healthScore: 95 })
        .where(and(eq(machines.id, record.machineId), eq(machines.companyCode, companyCode)));

      await db.insert(machineHistory).values({
        companyCode,
        machineId: record.machineId,
        eventType: 'Breakdown Repair',
        summary: `Resolved ${record.ticketCode}: ${actionTaken || record.failureMode}`,
        partsReplaced: 'See Stock Issues',
        technician: record.assignedTechnician || actorEmail,
        costIncurred: 0,
        eventDate: new Date().toISOString().slice(0, 10),
      });
    }

    if (record) {
      await logActivity(
        actorEmail,
        'Maintenance Engineer',
        'Maintenance',
        'UPDATED_BREAKDOWN',
        record.ticketCode,
        `Updated breakdown ${record.ticketCode} status to ${status}`,
        companyCode
      );
    }

    return record;
  } catch (error) {
    console.error('Database query failed in updateBreakdownStatusRecord:', error);
    throw new Error('Failed to update breakdown status.', { cause: error });
  }
}

export async function createDailyMaintenanceRecord(
  payload: {
    machineId: number;
    checklistTitle: string;
    shift: string;
    operatorName: string;
    lubricationOk: boolean;
    pressureBar: string;
    temperatureCelsius: string;
    vibrationMmS: string;
    remarks: string;
    status: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(dailyMaintenance)
      .values({
        companyCode,
        ...payload,
        operatorName: payload.operatorName || actorEmail,
      })
      .returning();
    await logActivity(
      actorEmail,
      'Maintenance Operator',
      'Maintenance',
      'DAILY_CHECKLIST',
      `DM-${inserted[0].id}`,
      `Completed daily maintenance inspection "${payload.checklistTitle}" on Machine #${payload.machineId}`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createDailyMaintenanceRecord:', error);
    throw new Error('Failed to log daily maintenance inspection.', { cause: error });
  }
}

export async function createPreventiveScheduleRecord(
  payload: {
    scheduleCode: string;
    machineId: number;
    title: string;
    frequency: string;
    assignedEngineer: string;
    nextDueDate: string;
    estimatedHours: number;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(preventiveSchedules)
      .values({
        companyCode,
        ...payload,
        assignedEngineer: payload.assignedEngineer || actorEmail,
        complianceStatus: 'Scheduled',
      })
      .returning();

    await logActivity(
      actorEmail,
      'Reliability Engineer',
      'Maintenance',
      'CREATED_PM_SCHEDULE',
      payload.scheduleCode,
      `Scheduled preventive maintenance "${payload.title}" (${payload.frequency}) due ${payload.nextDueDate}`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createPreventiveScheduleRecord:', error);
    throw new Error('Failed to create preventive maintenance schedule.', { cause: error });
  }
}

export async function createComplaintRecord(
  payload: {
    complaintCode: string;
    machineId: number;
    sectionId?: number | null;
    title: string;
    description: string;
    priority: string;
    assignedTo: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const initialStage =
      payload.assignedTo && payload.assignedTo !== 'Unassigned' ? 'Assigned' : 'New';
    const inserted = await db
      .insert(complaints)
      .values({
        companyCode,
        complaintCode: payload.complaintCode,
        machineId: Number(payload.machineId),
        sectionId: payload.sectionId ? Number(payload.sectionId) : null,
        title: payload.title,
        description: payload.description,
        priority: payload.priority || 'High',
        assignedTo: payload.assignedTo || 'Unassigned',
        workflowStage: initialStage,
        raisedBy: actorEmail,
        workNotes: '',
        verifiedByProduction: 'Pending Verification',
      })
      .returning();

    await logActivity(
      actorEmail,
      'Production Supervisor',
      'Complaints',
      'RAISED_COMPLAINT',
      payload.complaintCode,
      `Raised ${payload.priority} complaint "${payload.title}" on Machine #${payload.machineId}`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createComplaintRecord:', error);
    throw new Error('Failed to submit shop-floor complaint.', { cause: error });
  }
}

export async function advanceComplaintWorkflowRecord(
  id: number,
  nextStage: string,
  assignedTo: string,
  workNotes: string,
  verifiedByProduction: string,
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const updated = await db
      .update(complaints)
      .set({
        workflowStage: nextStage,
        assignedTo: assignedTo || actorEmail,
        workNotes,
        verifiedByProduction,
        updatedAt: new Date(),
      })
      .where(and(eq(complaints.id, id), eq(complaints.companyCode, companyCode)))
      .returning();

    const record = updated[0];
    if (record) {
      await logActivity(
        actorEmail,
        'Plant Engineer',
        'Complaints',
        'WORKFLOW_TRANSITION',
        record.complaintCode,
        `Moved complaint ${record.complaintCode} to stage [${nextStage}]`,
        companyCode
      );
    }
    return record;
  } catch (error) {
    console.error('Database query failed in advanceComplaintWorkflowRecord:', error);
    throw new Error('Failed to advance complaint workflow stage.', { cause: error });
  }
}

export async function issueStockRecord(
  payload: {
    issueCode: string;
    sparePartId: number;
    machineId?: number | null;
    quantityIssued: number;
    issuedTo: string;
    workOrderRef: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(stockIssues)
      .values({
        companyCode,
        issueCode: payload.issueCode,
        sparePartId: Number(payload.sparePartId),
        machineId: payload.machineId ? Number(payload.machineId) : null,
        quantityIssued: Number(payload.quantityIssued),
        issuedTo: payload.issuedTo || actorEmail,
        workOrderRef: payload.workOrderRef,
        issuedBy: actorEmail,
      })
      .returning();

    const existingStocks = await db
      .select()
      .from(spareStock)
      .where(
        and(
          eq(spareStock.sparePartId, Number(payload.sparePartId)),
          eq(spareStock.companyCode, companyCode)
        )
      );

    if (existingStocks.length > 0) {
      const stockRow = existingStocks[0];
      const newQty = Math.max(0, stockRow.quantityOnHand - Number(payload.quantityIssued));
      await db
        .update(spareStock)
        .set({ quantityOnHand: newQty, lastCountedAt: new Date() })
        .where(eq(spareStock.id, stockRow.id));

      if (newQty <= stockRow.reorderPoint) {
        await db.insert(lowStockAlerts).values({
          companyCode,
          sparePartId: Number(payload.sparePartId),
          currentQty: newQty,
          thresholdQty: stockRow.reorderPoint,
          severity: newQty <= 1 ? 'Critical' : 'Warning',
          alertStatus: 'Active',
        });
      }
    }

    await logActivity(
      actorEmail,
      'Store Keeper',
      'Store',
      'ISSUED_STOCK',
      payload.issueCode,
      `Issued ${payload.quantityIssued} units of Spare Part #${payload.sparePartId} to ${payload.issuedTo} (WO: ${payload.workOrderRef})`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in issueStockRecord:', error);
    throw new Error('Failed to issue spare stock.', { cause: error });
  }
}

export async function receiveStockRecord(
  payload: {
    grnCode: string;
    sparePartId: number;
    supplierName: string;
    quantityReceived: number;
    unitPrice: number;
    invoiceNumber: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(stockReceives)
      .values({
        companyCode,
        ...payload,
        receivedBy: actorEmail,
      })
      .returning();

    const existingStocks = await db
      .select()
      .from(spareStock)
      .where(
        and(
          eq(spareStock.sparePartId, Number(payload.sparePartId)),
          eq(spareStock.companyCode, companyCode)
        )
      );

    if (existingStocks.length > 0) {
      const stockRow = existingStocks[0];
      const newQty = stockRow.quantityOnHand + Number(payload.quantityReceived);
      await db
        .update(spareStock)
        .set({ quantityOnHand: newQty, lastCountedAt: new Date() })
        .where(eq(spareStock.id, stockRow.id));

      if (newQty > stockRow.reorderPoint) {
        await db
          .update(lowStockAlerts)
          .set({ alertStatus: 'Resolved', currentQty: newQty })
          .where(
            and(
              eq(lowStockAlerts.sparePartId, Number(payload.sparePartId)),
              eq(lowStockAlerts.companyCode, companyCode)
            )
          );
      }
    }

    await logActivity(
      actorEmail,
      'Store Keeper',
      'Store',
      'RECEIVED_GRN',
      payload.grnCode,
      `Received ${payload.quantityReceived} units of Spare Part #${payload.sparePartId} from ${payload.supplierName}`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in receiveStockRecord:', error);
    throw new Error('Failed to record stock receive (GRN).', { cause: error });
  }
}

export async function createRequisitionRecord(
  payload: {
    reqNumber: string;
    sparePartId?: number | null;
    itemDescription: string;
    requestedQty: number;
    estimatedTotalCost: number;
    departmentId?: number | null;
    urgency: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    let safeDeptId: number | null = null;
    if (payload.departmentId) {
      const deptRows = await db
        .select()
        .from(departments)
        .where(
          and(
            eq(departments.id, Number(payload.departmentId)),
            eq(departments.companyCode, companyCode)
          )
        );
      if (deptRows.length > 0) safeDeptId = deptRows[0].id;
    }

    const inserted = await db
      .insert(requisitions)
      .values({
        companyCode,
        reqNumber: payload.reqNumber,
        sparePartId: payload.sparePartId ? Number(payload.sparePartId) : null,
        itemDescription: payload.itemDescription,
        requestedQty: Number(payload.requestedQty),
        estimatedTotalCost: Number(payload.estimatedTotalCost),
        departmentId: safeDeptId,
        urgency: payload.urgency || 'High',
        requestedBy: actorEmail,
        status: 'Pending Approval',
      })
      .returning();

    await logActivity(
      actorEmail,
      'Procurement / Engineer',
      'Procurement',
      'CREATED_REQUISITION',
      payload.reqNumber,
      `Raised purchase requisition ${payload.reqNumber} for ${payload.requestedQty}x ${payload.itemDescription} ($${payload.estimatedTotalCost})`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createRequisitionRecord:', error);
    throw new Error('Failed to create purchase requisition.', { cause: error });
  }
}

export async function approveRequisitionRecord(
  payload: {
    requisitionId: number;
    decision: string;
    comments: string;
    vendorName?: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const newStatus =
      payload.decision === 'Approved'
        ? payload.vendorName
          ? 'PO Issued'
          : 'Approved'
        : 'Rejected';

    const updatedReq = await db
      .update(requisitions)
      .set({ status: newStatus })
      .where(
        and(eq(requisitions.id, payload.requisitionId), eq(requisitions.companyCode, companyCode))
      )
      .returning();

    const reqItem = updatedReq[0];

    const approvalRow = await db
      .insert(approvals)
      .values({
        companyCode,
        requisitionId: payload.requisitionId,
        approverName: actorEmail,
        approverRole: 'Procurement Approver',
        decision: payload.decision,
        comments: payload.comments || 'Approved',
      })
      .returning();

    if (reqItem && payload.decision === 'Approved' && payload.vendorName) {
      const poNum = `PO-${new Date().getFullYear()}-${String(reqItem.id).padStart(3, '0')}`;
      await db.insert(purchaseHistory).values({
        companyCode,
        poNumber: poNum,
        requisitionId: reqItem.id,
        vendorName: payload.vendorName,
        itemsSummary: `${reqItem.requestedQty}x ${reqItem.itemDescription}`,
        totalAmount: reqItem.estimatedTotalCost,
        deliveryStatus: 'In Transit',
        orderDate: new Date().toISOString().slice(0, 10),
      });
    }

    await logActivity(
      actorEmail,
      'Procurement Approver',
      'Procurement',
      'REQUISITION_DECISION',
      reqItem ? reqItem.reqNumber : `REQ-${payload.requisitionId}`,
      `Marked requisition ${reqItem?.reqNumber || payload.requisitionId} as ${newStatus}`,
      companyCode
    );

    return approvalRow[0];
  } catch (error) {
    console.error('Database query failed in approveRequisitionRecord:', error);
    throw new Error('Failed to process requisition approval.', { cause: error });
  }
}

export async function updateUserRoleMappingRecord(
  userId: number,
  role: string,
  departmentId: number | null,
  shift: string,
  rlsPolicyLevel: string,
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    let safeDeptId: number | null = null;
    if (departmentId) {
      const deptRows = await db
        .select()
        .from(departments)
        .where(
          and(eq(departments.id, Number(departmentId)), eq(departments.companyCode, companyCode))
        );
      if (deptRows.length > 0) {
        safeDeptId = deptRows[0].id;
      }
    }

    const updated = await db
      .update(users)
      .set({
        role,
        departmentId: safeDeptId,
        shift,
        rlsPolicyLevel,
        lastSyncedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (updated[0]) {
      await logActivity(
        actorEmail,
        'Plant Admin',
        'RLS Policy',
        'UPDATED_USER_RLS_ROLE',
        updated[0].email,
        `Assigned role [${role}] & RLS Policy [${rlsPolicyLevel}] to ${updated[0].email}`,
        companyCode
      );
    }
    return updated[0];
  } catch (error) {
    console.error('Database query failed in updateUserRoleMappingRecord:', error);
    throw new Error('Failed to update user role mapping.', { cause: error });
  }
}

export async function createDocumentMetadataRecord(
  payload: {
    docCode: string;
    title: string;
    category: string;
    machineId?: number | null;
    fileFormat: string;
    fileSizeKb: number;
    version: string;
    rlsAccessRole: string;
  },
  actorEmail: string,
  rawCompanyCode?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const inserted = await db
      .insert(documents)
      .values({
        companyCode,
        docCode: payload.docCode,
        title: payload.title,
        category: payload.category,
        machineId: payload.machineId ? Number(payload.machineId) : null,
        fileFormat: payload.fileFormat || 'PDF',
        fileSizeKb: Number(payload.fileSizeKb) || 500,
        version: payload.version || 'v1.0',
        rlsAccessRole: payload.rlsAccessRole || 'All Authenticated Staff',
        uploadedBy: actorEmail,
      })
      .returning();

    await logActivity(
      actorEmail,
      'Documentation Engineer',
      'Assets',
      'UPLOADED_DOCUMENT',
      payload.docCode,
      `Registered engineering document "${payload.title}" (${payload.version})`,
      companyCode
    );
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createDocumentMetadataRecord:', error);
    throw new Error('Failed to save document metadata.', { cause: error });
  }
}

export async function createUpdateRequestRecord(
  payload: {
    requestCode?: string;
    senderName?: string;
    senderRole?: string;
    requestType: string;
    targetModule: string;
    priority: string;
    title: string;
    description: string;
  },
  actorEmail: string,
  rawCompanyCode?: string,
  rawCompanyName?: string
) {
  try {
    const companyCode = normalizeCompanyCode(rawCompanyCode);
    const companyName =
      rawCompanyName && rawCompanyName.trim().length > 0 ? rawCompanyName.trim() : companyCode;
    const reqCode =
      payload.requestCode && payload.requestCode.trim().length > 0
        ? payload.requestCode.trim()
        : `UPD-${Date.now().toString().slice(-5)}`;
    const senderName =
      payload.senderName && payload.senderName.trim().length > 0
        ? payload.senderName.trim()
        : actorEmail.split('@')[0];
    const senderRole = payload.senderRole || 'Plant User';

    const inserted = await db
      .insert(updateRequests)
      .values({
        requestCode: reqCode,
        companyCode,
        companyName,
        senderEmail: actorEmail,
        senderName,
        senderRole,
        requestType: payload.requestType || 'New Feature Request',
        targetModule: payload.targetModule || 'Whole Webapp',
        priority: payload.priority || 'Normal',
        title: payload.title,
        description: payload.description,
        status: 'Pending Review',
        superAdminReply: '',
      })
      .returning();

    await logActivity(
      actorEmail,
      senderRole,
      'Update Request',
      'SUBMITTED_UPDATE_REQUEST',
      reqCode,
      `Submitted Request For An Update [${payload.requestType}]: "${payload.title}" to Website Super Admin`,
      companyCode
    );

    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createUpdateRequestRecord:', error);
    throw new Error('Failed to submit update request.', { cause: error });
  }
}

export async function respondToUpdateRequestRecord(
  id: number,
  status: string,
  superAdminReply: string,
  actorEmail: string
) {
  try {
    if (!isWebsiteSuperAdminEmail(actorEmail)) {
      throw new Error('Only the Website Super Admin can update or reply to platform requests.');
    }
    const updated = await db
      .update(updateRequests)
      .set({
        status,
        superAdminReply: superAdminReply || '',
        updatedAt: new Date(),
      })
      .where(eq(updateRequests.id, id))
      .returning();

    if (updated[0]) {
      await logActivity(
        actorEmail,
        'Super Admin',
        'Update Request',
        'SUPER_ADMIN_UPDATE_RESPONSE',
        updated[0].requestCode,
        `Super Admin updated status of ${updated[0].requestCode} to [${status}]`,
        updated[0].companyCode
      );
    }
    return updated[0];
  } catch (error) {
    console.error('Database query failed in respondToUpdateRequestRecord:', error);
    throw new Error('Failed to update request status.', { cause: error });
  }
}

export async function deleteCompanyProfileRecord(
  rawTargetCompanyCode: string,
  actorEmail: string
) {
  try {
    if (!isWebsiteSuperAdminEmail(actorEmail)) {
      throw new Error('Only the Website Super Admin can delete a company profile.');
    }
    const targetCode = (rawTargetCompanyCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '-');
    if (!targetCode) {
      throw new Error('Invalid company code.');
    }

    await db.delete(activityLogs).where(eq(activityLogs.companyCode, targetCode));
    await db.delete(documents).where(eq(documents.companyCode, targetCode));
    await db.delete(approvals).where(eq(approvals.companyCode, targetCode));
    await db.delete(purchaseHistory).where(eq(purchaseHistory.companyCode, targetCode));
    await db.delete(requisitions).where(eq(requisitions.companyCode, targetCode));
    await db.delete(lowStockAlerts).where(eq(lowStockAlerts.companyCode, targetCode));
    await db.delete(stockIssues).where(eq(stockIssues.companyCode, targetCode));
    await db.delete(stockReceives).where(eq(stockReceives.companyCode, targetCode));
    await db.delete(spareStock).where(eq(spareStock.companyCode, targetCode));
    await db.delete(spareParts).where(eq(spareParts.companyCode, targetCode));
    await db.delete(components).where(eq(components.companyCode, targetCode));
    await db.delete(breakdownLogs).where(eq(breakdownLogs.companyCode, targetCode));
    await db.delete(dailyMaintenance).where(eq(dailyMaintenance.companyCode, targetCode));
    await db.delete(preventiveSchedules).where(eq(preventiveSchedules.companyCode, targetCode));
    await db.delete(machineHistory).where(eq(machineHistory.companyCode, targetCode));
    await db.delete(complaints).where(eq(complaints.companyCode, targetCode));
    await db.delete(machines).where(eq(machines.companyCode, targetCode));
    await db.delete(sections).where(eq(sections.companyCode, targetCode));
    await db.delete(updateRequests).where(eq(updateRequests.companyCode, targetCode));
    await db.delete(users).where(eq(users.companyCode, targetCode));
    await db.delete(departments).where(eq(departments.companyCode, targetCode));

    const companyDirectory = await getAllCompaniesDirectory();
    subscriptionStore.delete(targetCode);
    return { deletedCompanyCode: targetCode, companyDirectory };
  } catch (error) {
    console.error('Database query failed in deleteCompanyProfileRecord:', error);
    throw new Error('Failed to delete company profile.', { cause: error });
  }
}

function getDefaultSubscriptionForCompany(
  companyCode: string,
  companyName: string,
  plantLocation = 'Industrial Zone, Bangladesh'
): CompanySubscriptionConfig {
  const existing = subscriptionStore.get(companyCode);
  if (existing) {
    if (companyName && existing.companyName === existing.companyCode) {
      existing.companyName = companyName;
    }
    return existing;
  }
  const defaultExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const created: CompanySubscriptionConfig = {
    companyCode,
    companyName: companyName || companyCode,
    plantLocation,
    plan: 'Enterprise',
    status: 'Active',
    expiresAt: defaultExpiry,
    maxMachines: 250,
    maxUsers: 100,
    maxStoreItems: 2000,
    updatedAt: new Date().toISOString(),
  };
  subscriptionStore.set(companyCode, created);
  return created;
}

export async function getSuperAdminOverviewData(
  requesterEmail: string
): Promise<SuperAdminOverviewData> {
  if (!isWebsiteSuperAdminEmail(requesterEmail)) {
    throw new Error('Unauthorized: Super Admin privileges required.');
  }

  const [
    allUsers,
    allDepts,
    allSections,
    allMachines,
    allComponents,
    allSpareParts,
    allBreakdowns,
    allDailyMaint,
    allPmSchedules,
    allHistory,
    allComplaints,
    allSpareStock,
    allStockIssues,
    allStockReceives,
    allLowStockAlerts,
    allRequisitions,
    allApprovals,
    allPurchases,
    allLogs,
    allDocs,
    allUpdateReqs,
  ] = await Promise.all([
    db.select().from(users).orderBy(desc(users.lastSyncedAt)),
    db.select().from(departments),
    db.select().from(sections),
    db.select().from(machines),
    db.select().from(components),
    db.select().from(spareParts),
    db.select().from(breakdownLogs),
    db.select().from(dailyMaintenance),
    db.select().from(preventiveSchedules),
    db.select().from(machineHistory),
    db.select().from(complaints),
    db.select().from(spareStock),
    db.select().from(stockIssues),
    db.select().from(stockReceives),
    db.select().from(lowStockAlerts),
    db.select().from(requisitions),
    db.select().from(approvals),
    db.select().from(purchaseHistory),
    db.select().from(activityLogs).orderBy(desc(activityLogs.id)),
    db.select().from(documents),
    db.select().from(updateRequests).orderBy(desc(updateRequests.id)),
  ]);

  const companies = await getAllCompaniesDirectory();

  // Enrich plantLocation from first department location if present
  const locationByCompany = new Map<string, string>();
  for (const d of allDepts) {
    const code = normalizeCompanyCode(d.companyCode);
    if (d.location && !locationByCompany.has(code)) {
      locationByCompany.set(code, d.location);
    }
  }

  const enrichedCompanies = companies.map((c) => {
    const sub = getDefaultSubscriptionForCompany(
      c.companyCode,
      c.companyName,
      locationByCompany.get(c.companyCode) || 'Industrial Zone, Bangladesh'
    );
    return {
      ...c,
      plantLocation: sub.plantLocation,
    };
  });

  const subscriptions = enrichedCompanies.map((c) =>
    getDefaultSubscriptionForCompany(
      c.companyCode,
      c.companyName,
      c.plantLocation || 'Industrial Zone, Bangladesh'
    )
  );

  const filteredUsers = allUsers
    .filter((u) => !isBlockedPlaceholderCompany(u.companyCode, u.companyName))
    .map((u) => ({
      id: u.id,
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      companyCode: u.companyCode,
      companyName: u.companyName,
      role: u.role,
      departmentId: u.departmentId,
      phone: u.phone,
      shift: normalizeShiftLabel(u.shift),
      rlsPolicyLevel: u.rlsPolicyLevel,
      status: u.rlsPolicyLevel === 'SUSPENDED_ACCOUNT' ? 'Suspended' : 'Active',
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
      lastSyncedAt: u.lastSyncedAt
        ? new Date(u.lastSyncedAt).toISOString()
        : new Date().toISOString(),
    }));

  const filteredLogs = allLogs
    .filter((l) => !isBlockedPlaceholderCompany(l.companyCode))
    .slice(0, 250)
    .map((l) => ({
      id: l.id,
      companyCode: l.companyCode,
      actorEmail: l.actorEmail,
      actorRole: l.actorRole,
      module: l.module,
      action: l.action,
      entityCode: l.entityCode,
      details: l.details,
      ipAddress: 'Cloud-TLS / Verified Token',
      createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
    }));

  const tableBreakdown = [
    { tableName: 'users', count: filteredUsers.length },
    { tableName: 'departments', count: allDepts.length },
    { tableName: 'sections', count: allSections.length },
    { tableName: 'machines', count: allMachines.length },
    { tableName: 'components', count: allComponents.length },
    { tableName: 'spare_parts', count: allSpareParts.length },
    { tableName: 'breakdown_logs', count: allBreakdowns.length },
    { tableName: 'daily_maintenance', count: allDailyMaint.length },
    { tableName: 'preventive_schedules', count: allPmSchedules.length },
    { tableName: 'machine_history', count: allHistory.length },
    { tableName: 'complaints', count: allComplaints.length },
    { tableName: 'spare_stock', count: allSpareStock.length },
    { tableName: 'stock_issues', count: allStockIssues.length },
    { tableName: 'stock_receives', count: allStockReceives.length },
    { tableName: 'low_stock_alerts', count: allLowStockAlerts.length },
    { tableName: 'requisitions', count: allRequisitions.length },
    { tableName: 'approvals', count: allApprovals.length },
    { tableName: 'purchase_history', count: allPurchases.length },
    { tableName: 'activity_logs', count: filteredLogs.length },
    { tableName: 'documents', count: allDocs.length },
    { tableName: 'update_requests', count: allUpdateReqs.length },
  ];

  const totalRecordsCount = tableBreakdown.reduce((sum, item) => sum + item.count, 0);

  return {
    allUsers: filteredUsers,
    companies: enrichedCompanies,
    subscriptions,
    globalLogs: filteredLogs,
    announcements: globalAnnouncementsStore,
    updateRequests: allUpdateReqs.map((r) => ({
      id: r.id,
      requestCode: r.requestCode,
      companyCode: r.companyCode,
      companyName: r.companyName,
      senderEmail: r.senderEmail,
      senderName: r.senderName,
      senderRole: r.senderRole,
      requestType: r.requestType,
      targetModule: r.targetModule,
      priority: r.priority,
      title: r.title,
      description: r.description,
      status: r.status,
      superAdminReply: r.superAdminReply || '',
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
    })),
    emailBroadcasts: emailBroadcastsStore,
    smtpConfigured: Boolean(process.env.SMTP_PASS && process.env.SMTP_PASS.trim().length > 0),
    systemHealth: {
      dbStatus: 'Connected',
      databaseEngine: 'PostgreSQL 16 (Google Cloud SQL + Drizzle ORM)',
      serverUptimeSeconds: Math.max(1, Math.floor((Date.now() - SERVER_BOOT_TIME_MS) / 1000)),
      totalRecordsCount,
      tableBreakdown,
      lastBackupAt: lastManualBackupIso,
    },
  };
}

export async function superAdminUpdateUserRecord(
  userId: number,
  payload: {
    role?: string;
    status?: 'Active' | 'Suspended';
    shift?: string;
    companyCode?: string;
    companyName?: string;
  },
  actorEmail: string
) {
  if (!isWebsiteSuperAdminEmail(actorEmail)) {
    throw new Error('Unauthorized: Super Admin privileges required.');
  }
  const existingRows = await db.select().from(users).where(eq(users.id, userId));
  if (existingRows.length === 0) {
    throw new Error('User not found.');
  }
  const target = existingRows[0];
  const nextRole = payload.role || target.role;
  const nextShift = payload.shift ? normalizeShiftLabel(payload.shift) : target.shift;
  const nextCompanyCode = payload.companyCode
    ? normalizeCompanyCode(payload.companyCode)
    : target.companyCode;
  const nextCompanyName = payload.companyName?.trim() || target.companyName;
  const nextRls =
    payload.status === 'Suspended'
      ? 'SUSPENDED_ACCOUNT'
      : nextRole.toLowerCase().includes('admin')
      ? 'FULL_RLS_SUPERUSER'
      : 'COMPANY_RLS_SCOPED';

  const updated = await db
    .update(users)
    .set({
      role: nextRole,
      shift: nextShift,
      companyCode: nextCompanyCode,
      companyName: nextCompanyName,
      rlsPolicyLevel: nextRls,
      lastSyncedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  await logActivity(
    actorEmail,
    'System Super Admin',
    'Super Admin',
    payload.status === 'Suspended' ? 'SUSPENDED_USER_ACCOUNT' : 'UPDATED_USER_ACCOUNT',
    target.email,
    `Super Admin updated ${target.email}: Role=[${nextRole}], Status=[${payload.status || 'Active'}], Company=[${nextCompanyCode}]`,
    nextCompanyCode
  );

  return updated[0];
}

export async function superAdminUpdateSubscriptionRecord(
  rawCompanyCode: string,
  payload: {
    companyName?: string;
    plantLocation?: string;
    plan?: SubscriptionPlanTier;
    status?: 'Active' | 'Trial' | 'Past Due' | 'Suspended';
    expiresAt?: string;
    maxMachines?: number;
    maxUsers?: number;
    maxStoreItems?: number;
  },
  actorEmail: string
) {
  if (!isWebsiteSuperAdminEmail(actorEmail)) {
    throw new Error('Unauthorized: Super Admin privileges required.');
  }
  const code = normalizeCompanyCode(rawCompanyCode);
  const current = getDefaultSubscriptionForCompany(
    code,
    payload.companyName || code,
    payload.plantLocation || 'Industrial Zone, Bangladesh'
  );

  const updated: CompanySubscriptionConfig = {
    ...current,
    companyName: payload.companyName?.trim() || current.companyName,
    plantLocation: payload.plantLocation?.trim() || current.plantLocation,
    plan: payload.plan || current.plan,
    status: payload.status || current.status,
    expiresAt: payload.expiresAt || current.expiresAt,
    maxMachines:
      payload.maxMachines !== undefined ? Number(payload.maxMachines) : current.maxMachines,
    maxUsers: payload.maxUsers !== undefined ? Number(payload.maxUsers) : current.maxUsers,
    maxStoreItems:
      payload.maxStoreItems !== undefined ? Number(payload.maxStoreItems) : current.maxStoreItems,
    updatedAt: new Date().toISOString(),
  };

  subscriptionStore.set(code, updated);

  await logActivity(
    actorEmail,
    'System Super Admin',
    'Subscription Control',
    'UPDATED_COMPANY_SUBSCRIPTION',
    code,
    `Updated subscription for ${updated.companyName} (${code}) to [${updated.plan}] (${updated.status}), Expires: ${updated.expiresAt}, Limits: ${updated.maxMachines} machines / ${updated.maxUsers} users`,
    code
  );

  return updated;
}

export async function superAdminCreateAnnouncementRecord(
  payload: {
    title: string;
    message: string;
    severity?: 'Info' | 'Warning' | 'Critical';
    targetCompanyCode?: string;
  },
  actorEmail: string
) {
  if (!isWebsiteSuperAdminEmail(actorEmail)) {
    throw new Error('Unauthorized: Super Admin privileges required.');
  }
  const nextId =
    globalAnnouncementsStore.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;
  const targetCode =
    !payload.targetCompanyCode || payload.targetCompanyCode === 'ALL'
      ? 'ALL'
      : normalizeCompanyCode(payload.targetCompanyCode);

  const created: GlobalAnnouncementItem = {
    id: nextId,
    title: payload.title.trim(),
    message: payload.message.trim(),
    severity: payload.severity || 'Info',
    targetCompanyCode: targetCode,
    active: true,
    createdBy: actorEmail,
    createdAt: new Date().toISOString(),
  };

  globalAnnouncementsStore = [created, ...globalAnnouncementsStore];

  await logActivity(
    actorEmail,
    'System Super Admin',
    'Global Broadcast',
    'PUBLISHED_ANNOUNCEMENT',
    `NOTICE-${nextId}`,
    `Broadcasted [${created.severity}] announcement "${created.title}" to [${targetCode}]`,
    targetCode === 'ALL' ? 'MAINTEX-GLOBAL' : targetCode
  );

  return created;
}

export async function superAdminToggleAnnouncementRecord(
  id: number,
  active: boolean,
  actorEmail: string
) {
  if (!isWebsiteSuperAdminEmail(actorEmail)) {
    throw new Error('Unauthorized: Super Admin privileges required.');
  }
  globalAnnouncementsStore = globalAnnouncementsStore.map((a) =>
    a.id === id ? { ...a, active } : a
  );
  return globalAnnouncementsStore.find((a) => a.id === id) || null;
}

export async function superAdminDeleteAnnouncementRecord(id: number, actorEmail: string) {
  if (!isWebsiteSuperAdminEmail(actorEmail)) {
    throw new Error('Unauthorized: Super Admin privileges required.');
  }
  globalAnnouncementsStore = globalAnnouncementsStore.filter((a) => a.id !== id);
  return { deletedId: id };
}

export async function superAdminTriggerBackupSnapshot(
  targetCompanyCode: string,
  actorEmail: string
) {
  if (!isWebsiteSuperAdminEmail(actorEmail)) {
    throw new Error('Unauthorized: Super Admin privileges required.');
  }
  lastManualBackupIso = new Date().toISOString();
  const cleanCode =
    !targetCompanyCode || targetCompanyCode === 'ALL'
      ? 'ALL'
      : normalizeCompanyCode(targetCompanyCode);

  await logActivity(
    actorEmail,
    'System Super Admin',
    'System Health & DB',
    'MANUAL_DB_BACKUP',
    cleanCode === 'ALL' ? 'FULL-CLUSTER-SNAPSHOT' : `BACKUP-${cleanCode}`,
    `Triggered manual PostgreSQL backup snapshot for [${cleanCode}]`,
    cleanCode === 'ALL' ? 'MAINTEX-GLOBAL' : cleanCode
  );

  if (cleanCode === 'ALL') {
    const overview = await getSuperAdminOverviewData(actorEmail);
    return {
      backupTimestamp: lastManualBackupIso,
      scope: 'ALL_COMPANIES',
      triggeredBy: actorEmail,
      overview,
    };
  }

  const companyState = await getFullPlantState(cleanCode, actorEmail);
  return {
    backupTimestamp: lastManualBackupIso,
    scope: cleanCode,
    triggeredBy: actorEmail,
    companyState,
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function superAdminSendMassEmailRecord(
  payload: {
    subject: string;
    bodyText: string;
    targetAudienceLabel: string;
    recipientEmails: string[];
    attachments?: EmailBroadcastAttachment[];
    gmailMessageId?: string;
    senderEmailOverride?: string;
  },
  actorEmail: string
): Promise<EmailBroadcastLogItem> {
  if (!isWebsiteSuperAdminEmail(actorEmail)) {
    throw new Error('Unauthorized: Super Admin privileges required.');
  }

  const subject = (payload.subject || '').trim();
  const bodyText = (payload.bodyText || '').trim();
  if (!subject || !bodyText) {
    throw new Error('Subject and email body text are required.');
  }

  const uniqueRecipients = Array.from(
    new Set(
      (payload.recipientEmails || [])
        .map((e) => (e || '').trim().toLowerCase())
        .filter((e) => e.includes('@'))
    )
  );

  if (uniqueRecipients.length === 0) {
    throw new Error('Please select at least one valid recipient email address.');
  }

  const senderName = (process.env.SMTP_FROM_NAME || OFFICIAL_SENDER_NAME).trim();
  const senderEmail = (
    payload.senderEmailOverride ||
    process.env.SMTP_USER ||
    OFFICIAL_SENDER_EMAIL
  )
    .trim()
    .toLowerCase();
  const smtpPass = (process.env.SMTP_PASS || '').trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  let deliveryMode: 'GMAIL_API_SENT' | 'SMTP_VERIFIED' | 'QUEUED_GMAIL_DISPATCH' =
    payload.gmailMessageId ? 'GMAIL_API_SENT' : 'QUEUED_GMAIL_DISPATCH';

  const htmlParagraphs = escapeHtml(bodyText)
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p style="margin:0 0 12px 0;">${line}</p>` : '<br/>'))
    .join('');

  const htmlEmailBody = `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #d0d7de;border-radius:8px;overflow:hidden;background:#ffffff;color:#0f172a;">
      <div style="background:#0070f3;color:#ffffff;padding:18px 24px;">
        <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;opacity:0.9;">
          OFFICIAL PLATFORM COMMUNICATION
        </div>
        <div style="font-size:18px;font-weight:800;margin-top:4px;">
          ${escapeHtml(senderName)}
        </div>
        <div style="font-size:12px;opacity:0.9;margin-top:2px;">
          ${escapeHtml(senderEmail)}
        </div>
      </div>
      <div style="padding:24px;font-size:14px;line-height:1.65;color:#1e293b;">
        <h2 style="margin:0 0 16px 0;font-size:16px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:10px;">
          ${escapeHtml(subject)}
        </h2>
        ${htmlParagraphs}
        ${
          attachments.length > 0
            ? `<div style="margin-top:20px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;">
                <strong>Attached Files (${attachments.length}):</strong>
                <ul style="margin:6px 0 0 18px;padding:0;">
                  ${attachments
                    .map(
                      (a) =>
                        `<li>${escapeHtml(a.name)} (${Math.max(1, Math.round(a.sizeBytes / 1024))} KB)</li>`
                    )
                    .join('')}
                </ul>
              </div>`
            : ''
        }
      </div>
      <div style="background:#f1f5f9;padding:14px 24px;font-size:11px;color:#475569;border-top:1px solid #e2e8f0;">
        <div>Sent officially by <strong>${escapeHtml(senderName)}</strong> &lt;${escapeHtml(senderEmail)}&gt;</div>
        <div style="margin-top:3px;">Recipient privacy enforced via BCC isolation &bull; MAINTEX Industrial CMMS</div>
      </div>
    </div>
  `;

  if (deliveryMode !== 'GMAIL_API_SENT' && smtpPass.length > 0) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: senderEmail,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: `"${senderName}" <${senderEmail}>`,
        bcc: uniqueRecipients,
        replyTo: `"${senderName}" <${senderEmail}>`,
        subject,
        text: `${bodyText}\n\n---\n${senderName} <${senderEmail}>`,
        html: htmlEmailBody,
        attachments: attachments.map((att) => ({
          filename: att.name,
          content: Buffer.from(att.base64Data, 'base64'),
          contentType: att.mimeType || 'application/octet-stream',
        })),
      });
      deliveryMode = 'SMTP_VERIFIED';
    } catch (smtpError: any) {
      console.error('SMTP send warning (falling back to Gmail dispatch record):', smtpError?.message);
    }
  }

  const nextId =
    emailBroadcastsStore.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;
  const broadcastCode = `MAIL-${String(1000 + nextId)}`;

  const logRecord: EmailBroadcastLogItem = {
    id: nextId,
    broadcastCode,
    senderName,
    senderEmail,
    subject,
    bodyText,
    targetAudienceLabel: payload.targetAudienceLabel || 'All Active Users',
    recipientEmails: uniqueRecipients,
    recipientCount: uniqueRecipients.length,
    attachments: attachments.map((a) => ({
      name: a.name,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
    deliveryMode,
    gmailMessageId: payload.gmailMessageId,
    sentBy: actorEmail,
    sentAt: new Date().toISOString(),
  };

  emailBroadcastsStore = [logRecord, ...emailBroadcastsStore].slice(0, 100);

  await logActivity(
    actorEmail,
    'System Super Admin',
    'Mass Email Broadcast',
    'SENT_MASS_EMAIL_BROADCAST',
    broadcastCode,
    `Sent official email "${subject}" from "${senderName} <${senderEmail}>" to ${uniqueRecipients.length} user(s) via BCC (${attachments.length} attachment(s))`,
    'MAINTEX-GLOBAL'
  );

  return logRecord;
}



