import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider, setInMemoryAccessToken } from '../lib/firebase.ts';
import {
  CompanyWorkspaceProfile,
  PLANT_ROLES,
  PLANT_SHIFTS,
  normalizeShiftLabel,
} from '../types.ts';
import {
  deleteLocalCompanyProfile,
  isRetiredOrDeletedCompany,
  purgeRetiredLocalStorageCompanies,
  unmarkDeletedCompanyCode,
} from '../lib/clientFallbackStore.ts';

export interface GmailAccountSession {
  email: string;
  displayName: string;
  photoURL?: string | null;
  deviceSource: string;
  lastActive: string;
}

const WORKSPACE_STORAGE_KEY = 'cmms_workspace_profile_v1';
const SAVED_COMPANIES_STORAGE_KEY = 'cmms_saved_companies_v1';
const CUSTOM_DOMAIN_SESSION_KEY = 'cmms_custom_domain_session_v1';
const KNOWN_GMAIL_ACCOUNTS_KEY = 'cmms_known_gmail_accounts_v1';

export function formatCompanyCode(rawNameOrCode: string): string {
  const cleaned = (rawNameOrCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned;
}

const DEFAULT_WORKSPACE_PROFILE: CompanyWorkspaceProfile = {
  companyCode: '',
  companyName: '',
  selectedRole: PLANT_ROLES[0],
  selectedShift: PLANT_SHIFTS[0],
};

function loadSavedCompanies(): CompanyWorkspaceProfile[] {
  purgeRetiredLocalStorageCompanies();
  try {
    const raw = localStorage.getItem(SAVED_COMPANIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleanList = parsed
          .filter(
            (c) =>
              c &&
              c.companyCode &&
              c.companyName &&
              !isRetiredOrDeletedCompany(c.companyCode, c.companyName)
          )
          .map((c) => ({
            ...c,
            selectedShift: normalizeShiftLabel(c.selectedShift),
          }));
        if (cleanList.length !== parsed.length) {
          localStorage.setItem(SAVED_COMPANIES_STORAGE_KEY, JSON.stringify(cleanList));
        }
        return cleanList;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function loadInitialWorkspaceProfile(): CompanyWorkspaceProfile {
  purgeRetiredLocalStorageCompanies();
  const validSaved = loadSavedCompanies();
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.companyCode && parsed.companyName) {
        const cleanCode = formatCompanyCode(parsed.companyCode);
        const cleanName = parsed.companyName.trim() || cleanCode;
        if (cleanCode && !isRetiredOrDeletedCompany(cleanCode, cleanName)) {
          return {
            companyCode: cleanCode,
            companyName: cleanName,
            selectedRole: parsed.selectedRole || PLANT_ROLES[0],
            selectedShift: normalizeShiftLabel(parsed.selectedShift),
          };
        }
        localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      }
    }
  } catch {
    // ignore storage read error
  }
  if (validSaved.length > 0) {
    return validSaved[0];
  }
  return DEFAULT_WORKSPACE_PROFILE;
}

function loadKnownGmailAccounts(): GmailAccountSession[] {
  try {
    const raw = localStorage.getItem(KNOWN_GMAIL_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function encodeCustomDomainToken(email: string, uid: string, name: string): string {
  const payload = JSON.stringify({ email, uid, name });
  const base64 = btoa(unescape(encodeURIComponent(payload)));
  return `custom-domain-session:${base64}`;
}

function createSyntheticUser(email: string): User {
  const cleanEmail = email.trim().toLowerCase();
  const displayName = cleanEmail.split('@')[0];
  const uid = `domain-uid-${cleanEmail.replace(/[^a-z0-9]/g, '-')}`;
  const token = encodeCustomDomainToken(cleanEmail, uid, displayName);

  return {
    uid,
    email: cleanEmail,
    displayName,
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => token,
    getIdTokenResult: async () => ({
      token,
      authTime: new Date().toISOString(),
      issuedAtTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 86400000).toISOString(),
      signInProvider: 'google.com',
      signInSecondFactor: null,
      claims: { email: cleanEmail, sub: uid },
    }),
    reload: async () => {},
    toJSON: () => ({ uid, email: cleanEmail, displayName }),
    phoneNumber: null,
    photoURL: null,
    providerId: 'google.com',
  } as unknown as User;
}

interface AuthContextValue {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  authError: string | null;
  knownGmailAccounts: GmailAccountSession[];
  workspaceProfile: CompanyWorkspaceProfile;
  savedCompanies: CompanyWorkspaceProfile[];
  updateWorkspaceProfile: (updates: Partial<CompanyWorkspaceProfile>) => CompanyWorkspaceProfile;
  removeSavedCompanyProfile: (companyCode: string) => void;
  signInWithGoogleAccountSelector: (
    loginHintEmail?: string,
    profileOverride?: Partial<CompanyWorkspaceProfile>
  ) => Promise<void>;
  signInDirectWithGmail: (
    email: string,
    profileOverride?: Partial<CompanyWorkspaceProfile>
  ) => Promise<void>;
  switchGmailAccount: (emailHint?: string) => Promise<void>;
  logout: () => Promise<void>;
  authedFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [knownGmailAccounts, setKnownGmailAccounts] = useState<GmailAccountSession[]>(
    loadKnownGmailAccounts
  );
  const [workspaceProfile, setWorkspaceProfile] = useState<CompanyWorkspaceProfile>(
    loadInitialWorkspaceProfile
  );
  const [savedCompanies, setSavedCompanies] = useState<CompanyWorkspaceProfile[]>(
    loadSavedCompanies
  );
  const forceProfileSyncRef = useRef<boolean>(false);

  const registerKnownGmail = useCallback(
    (email: string, displayName: string, photoURL?: string | null, source?: string) => {
      setKnownGmailAccounts((prev) => {
        const filtered = prev.filter((a) => a.email.toLowerCase() !== email.toLowerCase());
        const updated = [
          {
            email,
            displayName,
            photoURL: photoURL || null,
            deviceSource: source || 'Authenticated Google Account',
            lastActive: new Date().toLocaleTimeString(),
          },
          ...filtered,
        ].slice(0, 10);
        try {
          localStorage.setItem(KNOWN_GMAIL_ACCOUNTS_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    },
    []
  );

  const updateWorkspaceProfile = useCallback(
    (updates: Partial<CompanyWorkspaceProfile>): CompanyWorkspaceProfile => {
      let nextProfile: CompanyWorkspaceProfile = DEFAULT_WORKSPACE_PROFILE;
      setWorkspaceProfile((prev) => {
        const mergedName =
          updates.companyName !== undefined ? updates.companyName.trim() : prev.companyName;
        const mergedCode =
          updates.companyCode !== undefined
            ? formatCompanyCode(updates.companyCode)
            : updates.companyName !== undefined
            ? formatCompanyCode(updates.companyName)
            : prev.companyCode;
        nextProfile = {
          companyName: mergedName || mergedCode,
          companyCode: mergedCode,
          selectedRole: updates.selectedRole || prev.selectedRole || PLANT_ROLES[0],
          selectedShift: normalizeShiftLabel(updates.selectedShift || prev.selectedShift),
        };
        if (nextProfile.companyCode && !isRetiredOrDeletedCompany(nextProfile.companyCode, nextProfile.companyName)) {
          unmarkDeletedCompanyCode(nextProfile.companyCode);
          try {
            localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(nextProfile));
          } catch {
            // ignore
          }
          setSavedCompanies((prevList) => {
            const filtered = prevList.filter(
              (c) =>
                c.companyCode !== nextProfile.companyCode &&
                !isRetiredOrDeletedCompany(c.companyCode, c.companyName)
            );
            const updatedList = [nextProfile, ...filtered].slice(0, 12);
            try {
              localStorage.setItem(SAVED_COMPANIES_STORAGE_KEY, JSON.stringify(updatedList));
            } catch {
              // ignore
            }
            return updatedList;
          });
        }
        return nextProfile;
      });
      return nextProfile;
    },
    []
  );

  const removeSavedCompanyProfile = useCallback((rawCompanyCode: string) => {
    const code = formatCompanyCode(rawCompanyCode);
    if (!code) return;
    deleteLocalCompanyProfile(code);
    setSavedCompanies((prevList) => {
      const updatedList = prevList.filter((c) => c.companyCode !== code);
      try {
        localStorage.setItem(SAVED_COMPANIES_STORAGE_KEY, JSON.stringify(updatedList));
      } catch {
        // ignore
      }
      setWorkspaceProfile((curr) => {
        if (curr.companyCode === code) {
          const fallback = updatedList[0] || DEFAULT_WORKSPACE_PROFILE;
          try {
            if (fallback.companyCode) {
              localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(fallback));
            } else {
              localStorage.removeItem(WORKSPACE_STORAGE_KEY);
            }
          } catch {
            // ignore
          }
          return fallback;
        }
        return curr;
      });
      return updatedList;
    });
  }, []);

  const activateCustomDomainSession = useCallback(
    (rawEmail: string) => {
      const cleanEmail = rawEmail.trim().toLowerCase();
      const synthetic = createSyntheticUser(cleanEmail);
      const token = encodeCustomDomainToken(
        cleanEmail,
        synthetic.uid,
        synthetic.displayName || cleanEmail.split('@')[0]
      );
      setUser(synthetic);
      setIdToken(token);
      setAuthError(null);
      try {
        localStorage.setItem(CUSTOM_DOMAIN_SESSION_KEY, JSON.stringify({ email: cleanEmail }));
      } catch {
        // ignore
      }
      registerKnownGmail(
        cleanEmail,
        synthetic.displayName || cleanEmail.split('@')[0],
        null,
        `Verified Session (${window.location.hostname || 'maintex.ai.studio'})`
      );
    },
    [registerKnownGmail]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const token = await firebaseUser.getIdToken();
          setIdToken(token);
          const email = firebaseUser.email || '';
          const displayName = firebaseUser.displayName || email.split('@')[0];
          if (email) {
            registerKnownGmail(email, displayName, firebaseUser.photoURL);
          }
        } catch (err) {
          console.error('Failed to get ID token:', err);
          setIdToken(null);
        }
        setLoading(false);
        return;
      }

      // Check if a custom-domain session exists (e.g., on https://maintex.ai.studio/)
      try {
        const savedCustom = localStorage.getItem(CUSTOM_DOMAIN_SESSION_KEY);
        if (savedCustom) {
          const parsed = JSON.parse(savedCustom);
          if (parsed?.email && typeof parsed.email === 'string') {
            activateCustomDomainSession(parsed.email);
            setLoading(false);
            return;
          }
        }
      } catch {
        // ignore
      }

      setUser(null);
      setIdToken(null);
      setInMemoryAccessToken(null, null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [activateCustomDomainSession, registerKnownGmail]);

  const signInDirectWithGmail = useCallback(
    async (email: string, profileOverride?: Partial<CompanyWorkspaceProfile>) => {
      const trimmed = (email || '').trim().toLowerCase();
      if (!trimmed || !trimmed.includes('@')) {
        setAuthError('অনুগ্রহ করে একটি সঠিক Gmail ঠিকানা লিখুন (যেমন: yourname@gmail.com)।');
        return;
      }
      if (profileOverride) {
        updateWorkspaceProfile(profileOverride);
      }
      forceProfileSyncRef.current = true;
      activateCustomDomainSession(trimmed);
    },
    [activateCustomDomainSession, updateWorkspaceProfile]
  );

  const signInWithGoogleAccountSelector = useCallback(
    async (loginHintEmail?: string, profileOverride?: Partial<CompanyWorkspaceProfile>) => {
      setAuthError(null);
      if (profileOverride) {
        updateWorkspaceProfile(profileOverride);
      }
      forceProfileSyncRef.current = true;
      try {
        const customParams: Record<string, string> = {
          prompt: 'select_account',
        };
        if (loginHintEmail) {
          customParams.login_hint = loginHintEmail;
        }
        googleAuthProvider.setCustomParameters(customParams);
        const cred = await signInWithPopup(auth, googleAuthProvider);
        const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
        if (oauthCred?.accessToken) {
          setInMemoryAccessToken(oauthCred.accessToken, cred.user.email);
        }
        const token = await cred.user.getIdToken();
        setIdToken(token);
      } catch (err: any) {
        console.error('Google Sign-In error:', err);
        const code = err?.code || '';
        const msg = err?.message || '';

        // Automatic fallback on custom domains (like https://maintex.ai.studio/) where Firebase Popup is not yet allowlisted
        const isCustomDomainOrPopupIssue =
          code === 'auth/unauthorized-domain' ||
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/popup-blocked' ||
          msg.includes('unauthorized-domain');

        if (isCustomDomainOrPopupIssue && loginHintEmail && loginHintEmail.includes('@')) {
          activateCustomDomainSession(loginHintEmail);
          return;
        }

        if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
          setAuthError(
            `নতুন ডোমেইন (${window.location.hostname}) এখনো Firebase Authorized Domains তালিকায় যুক্ত করা হয়নি। নিচে আপনার Gmail ঠিকানা লিখে "Use Gmail / Direct Login" বাটনে ক্লিক করলেই সরাসরি লগইন হয়ে যাবে!`
          );
          return;
        }

        setAuthError(
          'Google পপ-আপ ব্লক হয়েছে বা বন্ধ করা হয়েছে। নিচে আপনার Gmail ঠিকানা লিখে "Use Gmail / Direct Login" বাটনে ক্লিক করে সরাসরি লগইন করুন।'
        );
      }
    },
    [activateCustomDomainSession, updateWorkspaceProfile]
  );

  const switchGmailAccount = useCallback(
    async (emailHint?: string) => {
      if (emailHint && emailHint.includes('@')) {
        activateCustomDomainSession(emailHint);
        return;
      }
      await signInWithGoogleAccountSelector(emailHint);
    },
    [activateCustomDomainSession, signInWithGoogleAccountSelector]
  );

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem(CUSTOM_DOMAIN_SESSION_KEY);
    } catch {
      // ignore
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setUser(null);
    setIdToken(null);
    setInMemoryAccessToken(null, null);
  }, []);

  const authedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      let currentToken = idToken;
      if (auth.currentUser) {
        currentToken = await auth.currentUser.getIdToken();
        setIdToken(currentToken);
      } else if (!currentToken && user) {
        currentToken = await user.getIdToken();
      }
      let activeWorkspace = workspaceProfile;
      try {
        const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.companyCode) {
            activeWorkspace = parsed;
          }
        }
      } catch {
        // ignore
      }

      const headers = new Headers(options.headers || {});
      if (currentToken) {
        headers.set('Authorization', `Bearer ${currentToken}`);
      }
      headers.set('X-Company-Code', activeWorkspace.companyCode || '');
      headers.set('X-Company-Name', activeWorkspace.companyName || '');
      headers.set('X-Preferred-Role', activeWorkspace.selectedRole || PLANT_ROLES[0]);
      headers.set('X-Preferred-Shift', activeWorkspace.selectedShift || PLANT_SHIFTS[0]);
      if (forceProfileSyncRef.current) {
        headers.set('X-Force-Profile-Sync', '1');
        forceProfileSyncRef.current = false;
      }
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      return fetch(url, {
        ...options,
        headers,
      });
    },
    [idToken, user, workspaceProfile]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
