import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  normalizeCompanyCode,
  getOrCreateUser,
  switchUserCompanyAndRoleRecord,
  getFullPlantState,
  createDepartmentRecord,
  createMachineRecord,
  createSectionRecord,
  createComponentRecord,
  createSparePartRecord,
  createBreakdownRecord,
  updateBreakdownStatusRecord,
  createDailyMaintenanceRecord,
  createPreventiveScheduleRecord,
  createComplaintRecord,
  advanceComplaintWorkflowRecord,
  issueStockRecord,
  receiveStockRecord,
  createRequisitionRecord,
  approveRequisitionRecord,
  updateUserRoleMappingRecord,
  createDocumentMetadataRecord,
  createUpdateRequestRecord,
  respondToUpdateRequestRecord,
  deleteCompanyProfileRecord,
  getSuperAdminOverviewData,
  superAdminUpdateUserRecord,
  superAdminUpdateSubscriptionRecord,
  superAdminCreateAnnouncementRecord,
  superAdminToggleAnnouncementRecord,
  superAdminDeleteAnnouncementRecord,
  superAdminTriggerBackupSnapshot,
  superAdminSendMassEmailRecord,
  logActivity,
} from './src/db/repository.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractWorkspaceContext(req: AuthRequest) {
  const rawCode =
    (req.headers['x-company-code'] as string) ||
    req.body?.companyCode ||
    (req.query?.companyCode as string) ||
    '';
  const companyCode = normalizeCompanyCode(rawCode);
  const companyName =
    (req.headers['x-company-name'] as string) ||
    req.body?.companyName ||
    companyCode;
  const preferredRole =
    (req.headers['x-preferred-role'] as string) || req.body?.preferredRole || undefined;
  const preferredShift =
    (req.headers['x-preferred-shift'] as string) || req.body?.preferredShift || undefined;
  const forceProfileUpdate =
    req.headers['x-force-profile-sync'] === '1' || Boolean(req.body?.forceProfileUpdate);

  return {
    companyCode,
    companyName,
    preferredRole,
    preferredShift,
    forceProfileUpdate,
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  // Authenticate, sync user to PostgreSQL, and return full real-time state isolated by companyCode
  app.get('/api/plant-state', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || 'unknown-uid';
      const email = req.user?.email || 'operator@factory.io';
      const name = req.user?.name || email.split('@')[0];
      const { companyCode, companyName, preferredRole, preferredShift, forceProfileUpdate } =
        extractWorkspaceContext(req);

      const currentUser = await getOrCreateUser(
        uid,
        email,
        name,
        companyCode,
        companyName,
        preferredRole,
        preferredShift,
        forceProfileUpdate
      );
      const state = await getFullPlantState(companyCode, email);

      res.json({
        currentUser,
        ...state,
      });
    } catch (error: any) {
      console.error('Failed to fetch plant state:', error);
      res.status(500).json({ error: error.message || 'Failed to load plant state' });
    }
  });

  // Switch active Company Profile, Role, or Shift
  app.post('/api/users/switch-profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || 'unknown-uid';
      const email = req.user?.email || 'operator@factory.io';
      const name = req.user?.name || email.split('@')[0];
      const { companyCode, companyName, preferredRole, preferredShift } =
        extractWorkspaceContext(req);

      const roleToApply = req.body?.role || preferredRole || 'Plant Admin';
      const shiftToApply = req.body?.shift || preferredShift || 'G Shift (8:00 AM - 5:00 PM)';
      const codeToApply = normalizeCompanyCode(req.body?.companyCode || companyCode);
      const nameToApply = req.body?.companyName || companyName || codeToApply;

      const currentUser = await switchUserCompanyAndRoleRecord(
        uid,
        email,
        name,
        codeToApply,
        nameToApply,
        roleToApply,
        shiftToApply
      );
      const state = await getFullPlantState(codeToApply, email);

      res.json({
        currentUser,
        ...state,
      });
    } catch (error: any) {
      console.error('Failed to switch company/role profile:', error);
      res.status(500).json({ error: error.message || 'Failed to switch company or role profile' });
    }
  });

  // Trigger manual cloud backup & realtime sync checkpoint
  app.post('/api/sync-backup', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const { deviceLabel } = req.body;
      await logActivity(
        email,
        'Authenticated Gmail Operator',
        'Auth/Sync',
        'REALTIME_BACKUP_SYNC',
        'PG-SYNC-OK',
        `Synchronized multi-account Gmail session (${email}) from ${deviceLabel || 'Mobile/Desktop Terminal'}`,
        companyCode
      );
      const state = await getFullPlantState(companyCode, email);
      res.json(state);
    } catch (error: any) {
      console.error('Failed to run sync backup:', error);
      res.status(500).json({ error: error.message || 'Sync backup failed' });
    }
  });

  // Organization: Create Department
  app.post('/api/departments', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createDepartmentRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create department:', error);
      res.status(500).json({ error: error.message || 'Failed to create department' });
    }
  });

  // Asset Management: Create Section
  app.post('/api/sections', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createSectionRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create section:', error);
      res.status(500).json({ error: error.message || 'Failed to create section' });
    }
  });

  // Asset Management: Create Machine
  app.post('/api/machines', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createMachineRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create machine:', error);
      res.status(500).json({ error: error.message || 'Failed to create machine' });
    }
  });

  // Asset Management: Create Component
  app.post('/api/components', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createComponentRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create component:', error);
      res.status(500).json({ error: error.message || 'Failed to create component' });
    }
  });

  // Asset Management: Create Spare Part
  app.post('/api/spare-parts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createSparePartRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create spare part:', error);
      res.status(500).json({ error: error.message || 'Failed to create spare part' });
    }
  });

  // Maintenance: Log Breakdown
  app.post('/api/breakdowns', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createBreakdownRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to log breakdown:', error);
      res.status(500).json({ error: error.message || 'Failed to log breakdown' });
    }
  });

  // Maintenance: Update Breakdown Status
  app.patch('/api/breakdowns/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const id = Number(req.params.id);
      const { status, actionTaken } = req.body;
      const updated = await updateBreakdownStatusRecord(id, status, actionTaken, email, companyCode);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update breakdown:', error);
      res.status(500).json({ error: error.message || 'Failed to update breakdown' });
    }
  });

  // Maintenance: Daily Maintenance Checklist
  app.post('/api/daily-maintenance', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createDailyMaintenanceRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to log daily maintenance:', error);
      res.status(500).json({ error: error.message || 'Failed to log daily maintenance' });
    }
  });

  // Maintenance: Preventive Schedule
  app.post('/api/preventive-schedules', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createPreventiveScheduleRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create PM schedule:', error);
      res.status(500).json({ error: error.message || 'Failed to create PM schedule' });
    }
  });

  // Complaints: Create Complaint
  app.post('/api/complaints', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createComplaintRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create complaint:', error);
      res.status(500).json({ error: error.message || 'Failed to create complaint' });
    }
  });

  // Complaints: Advance Workflow Stage (New -> Assigned -> Work Progress -> Production Verification)
  app.patch('/api/complaints/:id/workflow', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const id = Number(req.params.id);
      const { nextStage, assignedTo, workNotes, verifiedByProduction } = req.body;
      const updated = await advanceComplaintWorkflowRecord(
        id,
        nextStage,
        assignedTo,
        workNotes,
        verifiedByProduction,
        email,
        companyCode
      );
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to advance complaint workflow:', error);
      res.status(500).json({ error: error.message || 'Failed to advance complaint workflow' });
    }
  });

  // Store & Inventory: Issue Stock
  app.post('/api/store/issue', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await issueStockRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to issue stock:', error);
      res.status(500).json({ error: error.message || 'Failed to issue stock' });
    }
  });

  // Store & Inventory: Receive Stock (GRN)
  app.post('/api/store/receive', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await receiveStockRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to receive stock:', error);
      res.status(500).json({ error: error.message || 'Failed to receive stock' });
    }
  });

  // Procurement: Create Requisition
  app.post('/api/procurement/requisitions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createRequisitionRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create requisition:', error);
      res.status(500).json({ error: error.message || 'Failed to create requisition' });
    }
  });

  // Procurement: Approve / Decide Requisition & Issue PO
  app.post('/api/procurement/approvals', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await approveRequisitionRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to approve requisition:', error);
      res.status(500).json({ error: error.message || 'Failed to approve requisition' });
    }
  });

  // Users & Role Mappings: Update Role & RLS Policy
  app.patch('/api/users/:id/role', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const userId = Number(req.params.id);
      const { role, departmentId, shift, rlsPolicyLevel } = req.body;
      const updated = await updateUserRoleMappingRecord(
        userId,
        role,
        departmentId ? Number(departmentId) : null,
        shift,
        rlsPolicyLevel,
        email,
        companyCode
      );
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update user role:', error);
      res.status(500).json({ error: error.message || 'Failed to update user role' });
    }
  });

  // Documents Metadata: Upload / Register Technical Document
  app.post('/api/documents', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode } = extractWorkspaceContext(req);
      const created = await createDocumentMetadataRecord(req.body, email, companyCode);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create document record:', error);
      res.status(500).json({ error: error.message || 'Failed to create document record' });
    }
  });

  // Update Requests: Submit a Request For An Update to Website Super Admin
  app.post('/api/update-requests', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const { companyCode, companyName, preferredRole } = extractWorkspaceContext(req);
      const created = await createUpdateRequestRecord(
        {
          ...req.body,
          senderRole: req.body?.senderRole || preferredRole || 'Plant User',
        },
        email,
        companyCode,
        companyName
      );
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to submit update request:', error);
      res.status(500).json({ error: error.message || 'Failed to submit update request' });
    }
  });

  // Update Requests: Super Admin replies or updates status
  app.patch('/api/update-requests/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const id = Number(req.params.id);
      const { status, superAdminReply } = req.body;
      const updated = await respondToUpdateRequestRecord(id, status, superAdminReply, email);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to respond to update request:', error);
      res.status(500).json({ error: error.message || 'Failed to respond to update request' });
    }
  });

  // Super Admin: Permanently Delete a Company Profile & All Its Isolated Records
  app.delete('/api/companies/:companyCode', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const targetCode = req.params.companyCode || '';
      const result = await deleteCompanyProfileRecord(targetCode, email);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete company profile:', error);
      res.status(500).json({ error: error.message || 'Failed to delete company profile' });
    }
  });

  // Super Admin Panel: Full Platform Overview (Users, Companies, Subscriptions, Logs, Announcements, DB Health)
  app.get('/api/super-admin/overview', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const overview = await getSuperAdminOverviewData(email);
      res.json(overview);
    } catch (error: any) {
      console.error('Failed to load super admin overview:', error);
      res.status(403).json({ error: error.message || 'Failed to load super admin overview' });
    }
  });

  // Super Admin Panel: Edit or Suspend/Activate User Account
  app.patch('/api/super-admin/users/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const userId = Number(req.params.id);
      const updated = await superAdminUpdateUserRecord(userId, req.body, email);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update user from super admin panel:', error);
      res.status(500).json({ error: error.message || 'Failed to update user account' });
    }
  });

  // Super Admin Panel: Update Company Subscription Plan, Expiry & Usage Limits
  app.put('/api/super-admin/subscriptions/:companyCode', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const targetCode = req.params.companyCode || '';
      const updated = await superAdminUpdateSubscriptionRecord(targetCode, req.body, email);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update company subscription:', error);
      res.status(500).json({ error: error.message || 'Failed to update company subscription' });
    }
  });

  // Super Admin Panel: Create Global Broadcast Announcement
  app.post('/api/super-admin/announcements', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const created = await superAdminCreateAnnouncementRecord(req.body, email);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create global announcement:', error);
      res.status(500).json({ error: error.message || 'Failed to create global announcement' });
    }
  });

  // Super Admin Panel: Toggle Announcement Active State
  app.patch('/api/super-admin/announcements/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const id = Number(req.params.id);
      const updated = await superAdminToggleAnnouncementRecord(id, Boolean(req.body?.active), email);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to toggle announcement:', error);
      res.status(500).json({ error: error.message || 'Failed to toggle announcement' });
    }
  });

  // Super Admin Panel: Delete Global Announcement
  app.delete('/api/super-admin/announcements/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const id = Number(req.params.id);
      const result = await superAdminDeleteAnnouncementRecord(id, email);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete announcement:', error);
      res.status(500).json({ error: error.message || 'Failed to delete announcement' });
    }
  });

  // Super Admin Panel: Trigger Manual Company Data Backup Snapshot
  app.post('/api/super-admin/backup', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const targetCode = req.body?.companyCode || 'ALL';
      const snapshot = await superAdminTriggerBackupSnapshot(targetCode, email);
      res.json(snapshot);
    } catch (error: any) {
      console.error('Failed to trigger manual company backup:', error);
      res.status(500).json({ error: error.message || 'Failed to trigger manual backup' });
    }
  });

  // Super Admin Panel: Send Official Mass Email Broadcast with Attachments
  app.post('/api/super-admin/email-broadcast', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const record = await superAdminSendMassEmailRecord(req.body, email);
      res.status(201).json(record);
    } catch (error: any) {
      console.error('Failed to send mass email broadcast:', error);
      res.status(500).json({ error: error.message || 'Failed to send mass email broadcast' });
    }
  });

  // Super Admin Panel: Inspect / Bypass Workspace Data for a Specific Company
  app.get('/api/super-admin/inspect/:companyCode', requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.user?.email || 'operator@factory.io';
      const targetCode = normalizeCompanyCode(req.params.companyCode || '');
      const state = await getFullPlantState(targetCode, email);
      res.json(state);
    } catch (error: any) {
      console.error('Failed to inspect company workspace:', error);
      res.status(500).json({ error: error.message || 'Failed to inspect company workspace' });
    }
  });

  // Ensure unmatched /api/* routes always return JSON instead of HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Factory Maintenance Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
