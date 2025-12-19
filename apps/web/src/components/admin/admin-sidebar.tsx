import { Link } from '@/i18n/routing';
import { BarChart, FileText, LayoutDashboard, Settings, Users } from 'lucide-react';

interface AdminSidebarProps {
  className?: string;
  user: {
    name: string;
    email: string;
    role: string;
  };
}

const sidebarItems = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'Claims',
    href: '/admin/claims',
    icon: FileText,
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
  },
  {
    title: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart,
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
];

export function AdminSidebar({ className, user }: AdminSidebarProps) {
  return (
    <div className={`flex flex-col h-screen border-r bg-muted/30 ${className}`}>
      <div className="p-6 border-b">
        <Link href="/admin" className="flex items-center gap-2 font-bold text-xl">
          <span className="text-primary">Admin</span>
          <span>Panel</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <nav className="grid gap-1 px-4">
          {sidebarItems.map((item, index) => (
            <Link
              key={index}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary hover:bg-muted"
            >
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t bg-muted/50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
            {user.name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium truncate">{user.name}</span>
            <span className="text-xs text-muted-foreground truncate capitalize">{user.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
