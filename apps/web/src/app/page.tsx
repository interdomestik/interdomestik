import { redirect } from 'next/navigation';

// Root redirect to default locale
// Needed because middleware.ts is disabled for this project.
export default function RootPage() {
  redirect('/sq');
}
