import type { UserRole } from "@civicos/shared";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
        agencyId: string | null;
        wardId: string | null;
        mustResetPassword: boolean;
      };
    }
  }
}

export {};
