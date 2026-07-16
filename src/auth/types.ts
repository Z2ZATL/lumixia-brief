import type { Factor, User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

export type AuthStage =
  | 'booting'
  | 'signed_out'
  | 'oauth_callback'
  | 'mfa_enrollment_required'
  | 'mfa_challenge_required'
  | 'authenticated_aal2'
  | 'recoverable_error';

export interface TotpEnrollment {
  factorId: string;
  friendlyName: string;
  qrCode: string;
  secret: string;
}

export interface AuthContextValue {
  stage: AuthStage;
  user: User | null;
  factors: Factor<'totp', 'verified'>[];
  enrollment: TotpEnrollment | null;
  error: string;
  busy: boolean;
  localDemo: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
  completeOAuthCallback: (search: string) => Promise<string | null>;
  startEnrollment: (friendlyName: string) => Promise<void>;
  verifyEnrollment: (code: string) => Promise<void>;
  verifyFactor: (factorId: string, code: string) => Promise<void>;
  removeFactor: (factorId: string) => Promise<void>;
}

export interface AuthProviderProps {
  children: ReactNode;
}
