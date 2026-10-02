import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// 1. Organization: Departments (Multi-Company Isolated)
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  code: text('code').notNull(),
  name: text('name').notNull(),
  headName: text('head_name').notNull(),
  location: text('location').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. Organization: Users & Role Mappings (Linked to Firebase Auth UID + Gmail + Company Profile)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('Plant Operator'),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  companyName: text('company_name').notNull().default('Default Factory'),
  role: text('role').notNull().default('Maintenance Engineer'),
  departmentId: integer('department_id').references(() => departments.id),
  phone: text('phone').notNull().default(''),
  shift: text('shift').notNull().default('Shift A (06:00 - 14:00)'),
  rlsPolicyLevel: text('rls_policy_level').notNull().default('PLANT_RLS_ENFORCED'),
  lastSyncedAt: timestamp('last_synced_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. Asset Management: Sections
export const sections = pgTable('sections', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  code: text('code').notNull(),
  name: text('name').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  supervisor: text('supervisor').notNull(),
  floorZone: text('floor_zone').notNull(),
  status: text('status').notNull().default('Operational'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. Asset Management: Machines
export const machines = pgTable('machines', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  code: text('code').notNull(),
  name: text('name').notNull(),
  sectionId: integer('section_id')
    .references(() => sections.id)
    .notNull(),
  manufacturer: text('manufacturer').notNull(),
  modelNumber: text('model_number').notNull(),
  serialNumber: text('serial_number').notNull(),
  criticality: text('criticality').notNull().default('Critical'),
  status: text('status').notNull().default('Running'),
  operatingHours: integer('operating_hours').notNull().default(0),
  healthScore: integer('health_score').notNull().default(94),
  installedDate: text('installed_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 5. Asset Management: Components
export const components = pgTable('components', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  code: text('code').notNull(),
  name: text('name').notNull(),
  machineId: integer('machine_id')
    .references(() => machines.id)
    .notNull(),
  category: text('category').notNull(),
  specification: text('specification').notNull(),
  condition: text('condition').notNull().default('Optimal'),
  installedDate: text('installed_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. Asset Management: Spare Parts
export const spareParts = pgTable('spare_parts', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  partNumber: text('part_number').notNull(),
  name: text('name').notNull(),
  componentId: integer('component_id').references(() => components.id),
  machineId: integer('machine_id').references(() => machines.id),
  category: text('category').notNull(),
  unit: text('unit').notNull().default('PCS'),
  unitCost: integer('unit_cost').notNull().default(0),
  minStockLevel: integer('min_stock_level').notNull().default(5),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. Maintenance: Breakdown Logs
export const breakdownLogs = pgTable('breakdown_logs', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  ticketCode: text('ticket_code').notNull(),
  machineId: integer('machine_id')
    .references(() => machines.id)
    .notNull(),
  sectionId: integer('section_id').references(() => sections.id),
  severity: text('severity').notNull().default('Critical'),
  failureMode: text('failure_mode').notNull(),
  rootCause: text('root_cause').notNull().default('Pending Investigation'),
  actionTaken: text('action_taken').notNull().default(''),
  reportedBy: text('reported_by').notNull(),
  assignedTechnician: text('assigned_technician').notNull(),
  downtimeMinutes: integer('downtime_minutes').notNull().default(0),
  status: text('status').notNull().default('Open'),
  reportedAt: timestamp('reported_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});

// 8. Maintenance: Daily Maintenance
export const dailyMaintenance = pgTable('daily_maintenance', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  machineId: integer('machine_id')
    .references(() => machines.id)
    .notNull(),
  checklistTitle: text('checklist_title').notNull(),
  shift: text('shift').notNull().default('Shift A'),
  operatorName: text('operator_name').notNull(),
  lubricationOk: boolean('lubrication_ok').notNull().default(true),
  pressureBar: text('pressure_bar').notNull().default('6.2 BAR'),
  temperatureCelsius: text('temperature_celsius').notNull().default('44°C'),
  vibrationMmS: text('vibration_mm_s').notNull().default('1.4 mm/s'),
  remarks: text('remarks').notNull().default('Nominal parameters'),
  status: text('status').notNull().default('Completed'),
  checkedAt: timestamp('checked_at').defaultNow(),
});

// 9. Maintenance: Preventive Schedules
export const preventiveSchedules = pgTable('preventive_schedules', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  scheduleCode: text('schedule_code').notNull(),
  machineId: integer('machine_id')
    .references(() => machines.id)
    .notNull(),
  title: text('title').notNull(),
  frequency: text('frequency').notNull(),
  assignedEngineer: text('assigned_engineer').notNull(),
  nextDueDate: text('next_due_date').notNull(),
  estimatedHours: integer('estimated_hours').notNull().default(4),
  complianceStatus: text('compliance_status').notNull().default('Scheduled'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 10. Maintenance: Machine History
export const machineHistory = pgTable('machine_history', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  machineId: integer('machine_id')
    .references(() => machines.id)
    .notNull(),
  eventType: text('event_type').notNull(),
  summary: text('summary').notNull(),
  partsReplaced: text('parts_replaced').notNull().default('None'),
  technician: text('technician').notNull(),
  costIncurred: integer('cost_incurred').notNull().default(0),
  eventDate: text('event_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 11. Complaints (Workflow: New -> Assigned -> Work Progress -> Production Verification)
export const complaints = pgTable('complaints', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  complaintCode: text('complaint_code').notNull(),
  machineId: integer('machine_id')
    .references(() => machines.id)
    .notNull(),
  sectionId: integer('section_id').references(() => sections.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('High'),
  workflowStage: text('workflow_stage').notNull().default('New'),
  raisedBy: text('raised_by').notNull(),
  assignedTo: text('assigned_to').notNull().default('Unassigned'),
  workNotes: text('work_notes').notNull().default(''),
  verifiedByProduction: text('verified_by_production').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 12. Store & Inventory: Spare Stock
export const spareStock = pgTable('spare_stock', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  sparePartId: integer('spare_part_id')
    .references(() => spareParts.id)
    .notNull(),
  binLocation: text('bin_location').notNull(),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  reservedQty: integer('reserved_qty').notNull().default(0),
  reorderPoint: integer('reorder_point').notNull().default(5),
  maxCapacity: integer('max_capacity').notNull().default(50),
  lastCountedAt: timestamp('last_counted_at').defaultNow(),
});

// 13. Store & Inventory: Stock Issues
export const stockIssues = pgTable('stock_issues', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  issueCode: text('issue_code').notNull(),
  sparePartId: integer('spare_part_id')
    .references(() => spareParts.id)
    .notNull(),
  machineId: integer('machine_id').references(() => machines.id),
  quantityIssued: integer('quantity_issued').notNull(),
  issuedTo: text('issued_to').notNull(),
  workOrderRef: text('work_order_ref').notNull(),
  issuedBy: text('issued_by').notNull(),
  issuedAt: timestamp('issued_at').defaultNow(),
});

// 14. Store & Inventory: Stock Receives
export const stockReceives = pgTable('stock_receives', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  grnCode: text('grn_code').notNull(),
  sparePartId: integer('spare_part_id')
    .references(() => spareParts.id)
    .notNull(),
  supplierName: text('supplier_name').notNull(),
  quantityReceived: integer('quantity_received').notNull(),
  unitPrice: integer('unit_price').notNull().default(0),
  invoiceNumber: text('invoice_number').notNull(),
  receivedBy: text('received_by').notNull(),
  receivedAt: timestamp('received_at').defaultNow(),
});

// 15. Store & Inventory: Low Stock Alerts
export const lowStockAlerts = pgTable('low_stock_alerts', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  sparePartId: integer('spare_part_id')
    .references(() => spareParts.id)
    .notNull(),
  currentQty: integer('current_qty').notNull(),
  thresholdQty: integer('threshold_qty').notNull(),
  severity: text('severity').notNull().default('Critical'),
  alertStatus: text('alert_status').notNull().default('Active'),
  triggeredAt: timestamp('triggered_at').defaultNow(),
});

// 16. Procurement: Requisitions
export const requisitions = pgTable('requisitions', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  reqNumber: text('req_number').notNull(),
  sparePartId: integer('spare_part_id').references(() => spareParts.id),
  itemDescription: text('item_description').notNull(),
  requestedQty: integer('requested_qty').notNull(),
  estimatedTotalCost: integer('estimated_total_cost').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  requestedBy: text('requested_by').notNull(),
  urgency: text('urgency').notNull().default('High'),
  status: text('status').notNull().default('Pending Approval'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 17. Procurement: Approvals
export const approvals = pgTable('approvals', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  requisitionId: integer('requisition_id')
    .references(() => requisitions.id)
    .notNull(),
  approverName: text('approver_name').notNull(),
  approverRole: text('approver_role').notNull(),
  decision: text('decision').notNull().default('Approved'),
  comments: text('comments').notNull().default(''),
  decidedAt: timestamp('decided_at').defaultNow(),
});

// 18. Procurement: Purchase History
export const purchaseHistory = pgTable('purchase_history', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  poNumber: text('po_number').notNull(),
  requisitionId: integer('requisition_id').references(() => requisitions.id),
  vendorName: text('vendor_name').notNull(),
  itemsSummary: text('items_summary').notNull(),
  totalAmount: integer('total_amount').notNull(),
  deliveryStatus: text('delivery_status').notNull().default('In Transit'),
  orderDate: text('order_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 19. Logs & Files: Activity Logs
export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  actorEmail: text('actor_email').notNull(),
  actorRole: text('actor_role').notNull().default('Maintenance Engineer'),
  module: text('module').notNull(),
  action: text('action').notNull(),
  entityCode: text('entity_code').notNull(),
  details: text('details').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 20. Logs & Files: Documents Metadata
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  docCode: text('doc_code').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  machineId: integer('machine_id').references(() => machines.id),
  fileFormat: text('file_format').notNull().default('PDF'),
  fileSizeKb: integer('file_size_kb').notNull().default(1240),
  version: text('version').notNull().default('v2.1'),
  uploadedBy: text('uploaded_by').notNull(),
  rlsAccessRole: text('rls_access_role').notNull().default('All Authenticated Plant Staff'),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
});

// 21. Website / WebApp Update & Feature Requests (Sent to Super Admin)
export const updateRequests = pgTable('update_requests', {
  id: serial('id').primaryKey(),
  requestCode: text('request_code').notNull(),
  companyCode: text('company_code').notNull().default('DEFAULT-FACTORY'),
  companyName: text('company_name').notNull().default('Default Industrial Plant'),
  senderEmail: text('sender_email').notNull(),
  senderName: text('sender_name').notNull(),
  senderRole: text('sender_role').notNull(),
  requestType: text('request_type').notNull().default('New Feature Request'),
  targetModule: text('target_module').notNull().default('Whole Webapp'),
  priority: text('priority').notNull().default('Normal'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('Pending Review'),
  superAdminReply: text('super_admin_reply').default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const departmentsRelations = relations(departments, ({ many }) => ({
  users: many(users),
  sections: many(sections),
  requisitions: many(requisitions),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  department: one(departments, {
    fields: [sections.departmentId],
    references: [departments.id],
  }),
  machines: many(machines),
}));

export const machinesRelations = relations(machines, ({ one, many }) => ({
  section: one(sections, {
    fields: [machines.sectionId],
    references: [sections.id],
  }),
  components: many(components),
  spareParts: many(spareParts),
  breakdownLogs: many(breakdownLogs),
  dailyMaintenance: many(dailyMaintenance),
  preventiveSchedules: many(preventiveSchedules),
  machineHistory: many(machineHistory),
  complaints: many(complaints),
  documents: many(documents),
}));

export const componentsRelations = relations(components, ({ one, many }) => ({
  machine: one(machines, {
    fields: [components.machineId],
    references: [machines.id],
  }),
  spareParts: many(spareParts),
}));

export const sparePartsRelations = relations(spareParts, ({ one, many }) => ({
  component: one(components, {
    fields: [spareParts.componentId],
    references: [components.id],
  }),
  machine: one(machines, {
    fields: [spareParts.machineId],
    references: [machines.id],
  }),
  stock: many(spareStock),
  issues: many(stockIssues),
  receives: many(stockReceives),
  lowStockAlerts: many(lowStockAlerts),
}));

export const requisitionsRelations = relations(requisitions, ({ one, many }) => ({
  sparePart: one(spareParts, {
    fields: [requisitions.sparePartId],
    references: [spareParts.id],
  }),
  department: one(departments, {
    fields: [requisitions.departmentId],
    references: [departments.id],
  }),
  approvals: many(approvals),
  purchases: many(purchaseHistory),
}));
