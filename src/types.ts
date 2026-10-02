export type NavSectionId =
  | 'dashboard'
  | 'companies'
  | 'assets'
  | 'maintenance'
  | 'complaints'
  | 'store'
  | 'procurement'
  | 'users'
  | 'activity'
  | 'reports'
  | 'documents'
  | 'update-requests'
  | 'instructions';

export const SUPER_ADMIN_EMAILS = [
  'mdmahfuj0987@gmail.com',
  'administration.maintex.com@gmail.com',
] as const;

export const OFFICIAL_SENDER_NAME = 'MAINTEX ADMINISTRATION';
export const OFFICIAL_SENDER_EMAIL = 'administration.maintex.com@gmail.com';

export interface CompanyDirectoryItem {
  companyCode: string;
  companyName: string;
  plantLocation?: string;
  plantAdmins: string[];
  userCount: number;
  departmentCount: number;
  machineCount: number;
  openBreakdowns: number;
  sparePartCount: number;
  lastActiveAt: string;
}

export const PLANT_ROLES = [
  'Plant Admin',
  'Maintenance Engineer',
  'Production Supervisor',
  'Store Keeper',
  'Procurement Officer',
] as const;

export const PLANT_SHIFTS = [
  'G Shift (8:00 AM - 5:00 PM)',
  'A Shift (6:00 AM - 2:00 PM)',
  'B Shift (2:00 PM - 10:00 PM)',
  'C Shift (10:00 PM - 6:00 AM)',
] as const;

export function normalizeShiftLabel(raw?: string | null): string {
  const s = (raw || '').trim();
  if (!s) return PLANT_SHIFTS[0];
  const lower = s.toLowerCase();
  if (
    lower.includes('general') ||
    lower.startsWith('g shift') ||
    lower.includes('09:00') ||
    lower.includes('8:00 am - 5')
  ) {
    return 'G Shift (8:00 AM - 5:00 PM)';
  }
  if (
    lower.includes('shift a') ||
    lower.startsWith('a shift') ||
    lower.includes('06:00 - 14:00') ||
    lower.includes('6:00 am - 2:00 pm')
  ) {
    return 'A Shift (6:00 AM - 2:00 PM)';
  }
  if (
    lower.includes('shift b') ||
    lower.startsWith('b shift') ||
    lower.includes('14:00 - 22:00') ||
    lower.includes('2:00 pm - 10:00 pm')
  ) {
    return 'B Shift (2:00 PM - 10:00 PM)';
  }
  if (
    lower.includes('shift c') ||
    lower.startsWith('c shift') ||
    lower.includes('22:00 - 06:00') ||
    lower.includes('10:00 pm - 6:00 am')
  ) {
    return 'C Shift (10:00 PM - 6:00 AM)';
  }
  return PLANT_SHIFTS[0];
}

export interface CompanyWorkspaceProfile {
  companyCode: string;
  companyName: string;
  selectedRole: string;
  selectedShift: string;
}

export interface Department {
  id: number;
  companyCode?: string;
  code: string;
  name: string;
  headName: string;
  location: string;
}

export interface PlantUser {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  companyCode?: string;
  companyName?: string;
  role: string;
  departmentId: number | null;
  phone: string;
  shift: string;
  rlsPolicyLevel: string;
  status?: 'Active' | 'Suspended' | string;
  createdAt?: string;
  lastSyncedAt: string;
}

export interface Section {
  id: number;
  code: string;
  name: string;
  departmentId: number | null;
  supervisor: string;
  floorZone: string;
  status: string;
}

export interface Machine {
  id: number;
  code: string;
  name: string;
  sectionId: number;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  criticality: string;
  status: string;
  operatingHours: number;
  healthScore: number;
  installedDate: string;
}

export interface ComponentItem {
  id: number;
  code: string;
  name: string;
  machineId: number;
  category: string;
  specification: string;
  condition: string;
  installedDate: string;
}

export interface SparePart {
  id: number;
  partNumber: string;
  name: string;
  componentId: number | null;
  machineId: number | null;
  category: string;
  unit: string;
  unitCost: number;
  minStockLevel: number;
  leadTimeDays: number;
}

export interface BreakdownLog {
  id: number;
  ticketCode: string;
  machineId: number;
  sectionId: number | null;
  severity: string;
  failureMode: string;
  rootCause: string;
  actionTaken: string;
  reportedBy: string;
  assignedTechnician: string;
  downtimeMinutes: number;
  status: string;
  reportedAt: string;
  resolvedAt: string | null;
}

export interface DailyMaintenanceItem {
  id: number;
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
  checkedAt: string;
}

export interface PreventiveSchedule {
  id: number;
  scheduleCode: string;
  machineId: number;
  title: string;
  frequency: string;
  assignedEngineer: string;
  nextDueDate: string;
  estimatedHours: number;
  complianceStatus: string;
}

export interface MachineHistoryItem {
  id: number;
  machineId: number;
  eventType: string;
  summary: string;
  partsReplaced: string;
  technician: string;
  costIncurred: number;
  eventDate: string;
}

export interface ComplaintItem {
  id: number;
  complaintCode: string;
  machineId: number;
  sectionId: number | null;
  title: string;
  description: string;
  priority: string;
  workflowStage: 'New' | 'Assigned' | 'Work Progress' | 'Production Verification' | 'Closed' | string;
  raisedBy: string;
  assignedTo: string;
  workNotes: string;
  verifiedByProduction: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpareStockItem {
  id: number;
  sparePartId: number;
  binLocation: string;
  quantityOnHand: number;
  reservedQty: number;
  reorderPoint: number;
  maxCapacity: number;
  lastCountedAt: string;
}

export interface StockIssueItem {
  id: number;
  issueCode: string;
  sparePartId: number;
  machineId: number | null;
  quantityIssued: number;
  issuedTo: string;
  workOrderRef: string;
  issuedBy: string;
  issuedAt: string;
}

export interface StockReceiveItem {
  id: number;
  grnCode: string;
  sparePartId: number;
  supplierName: string;
  quantityReceived: number;
  unitPrice: number;
  invoiceNumber: string;
  receivedBy: string;
  receivedAt: string;
}

export interface LowStockAlertItem {
  id: number;
  sparePartId: number;
  currentQty: number;
  thresholdQty: number;
  severity: string;
  alertStatus: string;
  triggeredAt: string;
}

export interface RequisitionItem {
  id: number;
  reqNumber: string;
  sparePartId: number | null;
  itemDescription: string;
  requestedQty: number;
  estimatedTotalCost: number;
  departmentId: number | null;
  requestedBy: string;
  urgency: string;
  status: string;
  createdAt: string;
}

export interface ApprovalItem {
  id: number;
  requisitionId: number;
  approverName: string;
  approverRole: string;
  decision: string;
  comments: string;
  decidedAt: string;
}

export interface PurchaseHistoryItem {
  id: number;
  poNumber: string;
  requisitionId: number | null;
  vendorName: string;
  itemsSummary: string;
  totalAmount: number;
  deliveryStatus: string;
  orderDate: string;
}

export interface ActivityLogItem {
  id: number;
  companyCode?: string;
  actorEmail: string;
  actorRole: string;
  module: string;
  action: string;
  entityCode: string;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

export interface DocumentItem {
  id: number;
  docCode: string;
  title: string;
  category: string;
  machineId: number | null;
  fileFormat: string;
  fileSizeKb: number;
  version: string;
  uploadedBy: string;
  rlsAccessRole: string;
  uploadedAt: string;
}

export interface UpdateRequestItem {
  id: number;
  requestCode: string;
  companyCode: string;
  companyName: string;
  senderEmail: string;
  senderName: string;
  senderRole: string;
  requestType: string;
  targetModule: string;
  priority: string;
  title: string;
  description: string;
  status: string;
  superAdminReply: string;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionPlanTier = 'Free' | 'Pro' | 'Enterprise';

export interface CompanySubscriptionConfig {
  companyCode: string;
  companyName: string;
  plantLocation: string;
  plan: SubscriptionPlanTier;
  status: 'Active' | 'Trial' | 'Past Due' | 'Suspended';
  expiresAt: string;
  maxMachines: number;
  maxUsers: number;
  maxStoreItems: number;
  updatedAt: string;
}

export interface GlobalAnnouncementItem {
  id: number;
  title: string;
  message: string;
  severity: 'Info' | 'Warning' | 'Critical';
  targetCompanyCode: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface SuperAdminSystemHealth {
  dbStatus: 'Connected' | 'Local Fallback';
  databaseEngine: string;
  serverUptimeSeconds: number;
  totalRecordsCount: number;
  tableBreakdown: { tableName: string; count: number }[];
  lastBackupAt: string;
}

export interface EmailBroadcastAttachment {
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
}

export interface EmailBroadcastLogItem {
  id: number;
  broadcastCode: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  bodyText: string;
  targetAudienceLabel: string;
  recipientEmails: string[];
  recipientCount: number;
  attachments: { name: string; mimeType: string; sizeBytes: number }[];
  deliveryMode: 'GMAIL_API_SENT' | 'SMTP_VERIFIED' | 'QUEUED_GMAIL_DISPATCH';
  gmailMessageId?: string;
  sentBy: string;
  sentAt: string;
}

export interface SuperAdminOverviewData {
  allUsers: PlantUser[];
  companies: CompanyDirectoryItem[];
  subscriptions: CompanySubscriptionConfig[];
  globalLogs: ActivityLogItem[];
  announcements: GlobalAnnouncementItem[];
  updateRequests: UpdateRequestItem[];
  emailBroadcasts?: EmailBroadcastLogItem[];
  smtpConfigured?: boolean;
  systemHealth: SuperAdminSystemHealth;
}

export interface PlantStateData {
  currentUser?: PlantUser;
  companyDirectory?: CompanyDirectoryItem[];
  updateRequests?: UpdateRequestItem[];
  globalAnnouncements?: GlobalAnnouncementItem[];
  departments: Department[];
  users: PlantUser[];
  sections: Section[];
  machines: Machine[];
  components: ComponentItem[];
  spareParts: SparePart[];
  breakdownLogs: BreakdownLog[];
  dailyMaintenance: DailyMaintenanceItem[];
  preventiveSchedules: PreventiveSchedule[];
  machineHistory: MachineHistoryItem[];
  complaints: ComplaintItem[];
  spareStock: SpareStockItem[];
  stockIssues: StockIssueItem[];
  stockReceives: StockReceiveItem[];
  lowStockAlerts: LowStockAlertItem[];
  requisitions: RequisitionItem[];
  approvals: ApprovalItem[];
  purchaseHistory: PurchaseHistoryItem[];
  activityLogs: ActivityLogItem[];
  documents: DocumentItem[];
  syncedAt: string;
}
