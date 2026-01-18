export type CashVerificationRequestDTO = {
  id: string; // attemptId
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  amount: number;
  currency: string;
  status: string; // Added status for display
  isResubmission: boolean; // Added for UI badge
  createdAt: Date;
  updatedAt: Date;
  branchId: string;
  branchCode: string;
  branchName: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  documentId: string | null;
  documentPath: string | null;
  verificationNote: string | null;
  verifierName: string | null;
};

export type VerificationView = 'queue' | 'history';

export type VerificationTimelineEvent = {
  id: string;
  type: 'created' | 'document_upload' | 'action';
  title: string;
  description?: string;
  date: Date;
  actorName?: string;
};

export type CashVerificationDetailsDTO = CashVerificationRequestDTO & {
  documents: { id: string; name: string; url: string; uploadedAt: Date }[];
  timeline: VerificationTimelineEvent[];
};
