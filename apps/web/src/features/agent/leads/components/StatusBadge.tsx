import { CheckCircle, Clock } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case 'new':
      return <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded text-xs">New</span>;
    case 'contacted':
      return (
        <span className="text-purple-600 bg-purple-50 px-2 py-1 rounded text-xs">Contacted</span>
      );
    case 'payment_pending':
      return (
        <span className="text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-xs flex items-center w-fit">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </span>
      );
    case 'paid':
      return <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-xs">Paid</span>;
    case 'converted':
      return (
        <span className="text-emerald-700 bg-emerald-100 px-2 py-1 rounded text-xs font-medium flex items-center w-fit">
          <CheckCircle className="w-3 h-3 mr-1" />
          Member
        </span>
      );
    case 'lost':
    case 'disqualified':
    case 'expired':
      return (
        <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded text-xs">Lost/Closed</span>
      );
    default:
      return <span className="text-gray-500">{status}</span>;
  }
}
