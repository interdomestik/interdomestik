export default function RootNotFound() {
  return (
    <html suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <div data-testid="not-found-page" className="flex items-center justify-center min-h-screen">
          <h1>404 - Not Found (Root)</h1>
        </div>
      </body>
    </html>
  );
}
