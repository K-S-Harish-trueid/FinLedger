/**
 * Set by `requireAuth`, which gates every router that reads them.
 */
declare global {
  namespace Express {
    interface Request {
      userId: string;
      deviceId: string;
    }
  }
}

export {};
