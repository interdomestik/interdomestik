'use client';
export default function ErrorPage({ reset }) {
  return (
    <div role="alert">
      <p>Fixture request failed. Reload or retry retains the stored operation identity.</p>
      <button onClick={() => reset()}>Retry rendering</button>
    </div>
  );
}
