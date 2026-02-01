import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ padding: '100px', textAlign: 'center' }} data-testid="not-found-page">
      <h1 style={{ fontSize: '3rem' }}>404 (Locale)</h1>
      <p>Faqja nuk u gjet / Page Not Found</p>
      <Link href="/" style={{ color: 'blue', textDecoration: 'underline' }}>
        Back to Home
      </Link>
    </div>
  );
}
