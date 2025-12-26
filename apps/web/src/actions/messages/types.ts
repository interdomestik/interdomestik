export type MessageWithSender = {
  id: string;
  claimId: string;
  senderId: string;
  content: string;
  isInternal: boolean;
  readAt: Date | null;
  createdAt: Date;
  sender: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  };
};

type SenderRow = {
  id: string | null;
  name: string | null;
  image: string | null;
  role: string | null;
} | null;

export type SelectedMessageRow = {
  id: string;
  claimId: string;
  senderId: string;
  content: string;
  isInternal: boolean | null;
  readAt: Date | null;
  createdAt: Date | null;
  sender: SenderRow;
};
