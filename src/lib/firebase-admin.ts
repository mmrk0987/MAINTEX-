import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import fs from 'fs';

const configUrl = new URL('../../firebase-applet-config.json', import.meta.url);
const firebaseConfig = JSON.parse(fs.readFileSync(configUrl, 'utf-8'));

const primaryApp = getApps().length
  ? getApp()
  : initializeApp({
      projectId: firebaseConfig.projectId,
    });

export const adminAuth = getAuth(primaryApp);

export function getAdminAuthForProject(projectId: string): Auth {
  const cleanId = (projectId || '').trim();
  if (!cleanId || cleanId === firebaseConfig.projectId) {
    return adminAuth;
  }
  const appName = `project-${cleanId}`;
  const existing = getApps().find((a) => a.name === appName);
  if (existing) {
    return getAuth(existing);
  }
  const secondaryApp = initializeApp({ projectId: cleanId }, appName);
  return getAuth(secondaryApp);
}
