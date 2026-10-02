import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  EmailBroadcastAttachment,
  OFFICIAL_SENDER_EMAIL,
  OFFICIAL_SENDER_NAME,
} from '../types.ts';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

for (const scope of SCOPES) {
  googleAuthProvider.addScope(scope);
}

// Always show the Google account selector so users on phone/desktop can pick from multiple Gmail accounts
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the OAuth access token in memory (NEVER in localStorage/sessionStorage).
let cachedAccessToken: string | null = null;
let cachedSenderEmail: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      cachedSenderEmail = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const setInMemoryAccessToken = (token: string | null, email?: string | null) => {
  cachedAccessToken = token;
  if (email !== undefined) {
    cachedSenderEmail = email;
  }
};

export const googleSignIn = async (
  loginHintEmail?: string
): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const params: Record<string, string> = {
      prompt: 'consent select_account',
    };
    if (loginHintEmail) {
      params.login_hint = loginHintEmail;
    }
    googleAuthProvider.setCustomParameters(params);

    const result = await signInWithPopup(auth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Gmail OAuth access token from Google Sign-In.');
    }

    cachedAccessToken = credential.accessToken;
    cachedSenderEmail = result.user.email || loginHintEmail || OFFICIAL_SENDER_EMAIL;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getConnectedSenderEmail = (): string | null => {
  return cachedSenderEmail;
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return uint8ToBase64(bytes);
}

function utf8ToBase64Url(str: string): string {
  return utf8ToBase64(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function wrapBase64Lines(b64: string, lineLength = 76): string {
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += lineLength) {
    chunks.push(b64.slice(i, i + lineLength));
  }
  return chunks.join('\r\n');
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendMassEmailWithGmailApi(params: {
  accessToken: string;
  senderName?: string;
  senderEmail?: string;
  recipientEmails: string[];
  subject: string;
  bodyText: string;
  attachments?: EmailBroadcastAttachment[];
}): Promise<{ id: string; threadId: string }> {
  const senderName = (params.senderName || OFFICIAL_SENDER_NAME).trim();
  const senderEmail = (params.senderEmail || cachedSenderEmail || OFFICIAL_SENDER_EMAIL)
    .trim()
    .toLowerCase();
  const attachments = params.attachments || [];

  const htmlParagraphs = escapeHtml(params.bodyText)
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p style="margin:0 0 12px 0;">${line}</p>` : '<br/>'))
    .join('');

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:16px;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;border:1px solid #d0d7de;border-radius:8px;overflow:hidden;background:#ffffff;color:#0f172a;">
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
        ${escapeHtml(params.subject)}
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
</body>
</html>`;

  const boundary = `----=_MaintexMimeBoundary_${Date.now().toString(36)}`;
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(params.subject)}?=`;
  const encodedSenderName = `=?UTF-8?B?${utf8ToBase64(senderName)}?=`;

  const mimeLines: string[] = [
    `From: "${encodedSenderName}" <${senderEmail}>`,
    `To: "${encodedSenderName}" <${senderEmail}>`,
    `Bcc: ${params.recipientEmails.join(', ')}`,
    `Reply-To: "${encodedSenderName}" <${senderEmail}>`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64Lines(utf8ToBase64(htmlBody)),
    '',
  ];

  for (const att of attachments) {
    const cleanB64 = (att.base64Data || '').replace(/\s+/g, '');
    const encodedFileName = `=?UTF-8?B?${utf8ToBase64(att.name)}?=`;
    mimeLines.push(`--${boundary}`);
    mimeLines.push(
      `Content-Type: ${att.mimeType || 'application/octet-stream'}; name="${encodedFileName}"`
    );
    mimeLines.push(`Content-Disposition: attachment; filename="${encodedFileName}"`);
    mimeLines.push('Content-Transfer-Encoding: base64');
    mimeLines.push('');
    mimeLines.push(wrapBase64Lines(cleanB64));
    mimeLines.push('');
  }

  mimeLines.push(`--${boundary}--`);

  const rawMime = mimeLines.join('\r\n');
  const rawBase64Url = utf8ToBase64Url(rawMime);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: rawBase64Url,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg =
      errBody?.error?.message || `Gmail API returned HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  return await response.json();
}
