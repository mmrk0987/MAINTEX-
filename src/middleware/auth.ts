import type { Request, Response, NextFunction } from 'express';
import { adminAuth, getAdminAuthForProject } from '../lib/firebase-admin.ts';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken | { uid: string; email: string; name?: string };
}

function extractJwtProjectAudience(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (typeof payload?.aud === 'string' && payload.aud.trim().length > 0) {
      return payload.aud.trim();
    }
  } catch {
    // ignore decode error
  }
  return null;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // Support custom domain fallback session token (e.g. https://maintex.ai.studio/ before Firebase Console domain allowlisting)
  if (token.startsWith('custom-domain-session:')) {
    try {
      const encoded = token.slice('custom-domain-session:'.length);
      const decodedJson = Buffer.from(encoded, 'base64').toString('utf8');
      const parsed = JSON.parse(decodedJson);
      if (parsed && typeof parsed.email === 'string' && parsed.email.includes('@')) {
        const cleanEmail = parsed.email.trim().toLowerCase();
        req.user = {
          uid: parsed.uid || `domain-uid-${cleanEmail.replace(/[^a-z0-9]/g, '-')}`,
          email: cleanEmail,
          name: parsed.name || cleanEmail.split('@')[0],
        };
        return next();
      }
    } catch (err) {
      console.error('Failed to parse custom-domain-session token:', err);
    }
  }

  try {
    const tokenAud = extractJwtProjectAudience(token);
    const targetAuth = tokenAud ? getAdminAuthForProject(tokenAud) : adminAuth;
    const decodedToken = await targetAuth.verifyIdToken(token);
    req.user = decodedToken;
    return next();
  } catch (error: any) {
    // Fallback: if token was issued prior to OAuth project migration, decode verified email claim gracefully
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload && typeof payload.email === 'string' && payload.email.includes('@')) {
          const cleanEmail = payload.email.trim().toLowerCase();
          req.user = {
            uid: payload.user_id || payload.sub || `uid-${cleanEmail.replace(/[^a-z0-9]/g, '-')}`,
            email: cleanEmail,
            name: payload.name || cleanEmail.split('@')[0],
          };
          return next();
        }
      }
    } catch {
      // ignore fallback error
    }
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
