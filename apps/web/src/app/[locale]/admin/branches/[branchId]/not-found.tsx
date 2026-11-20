// Catches notFound() from this page inside the segment, before it reaches the segment's own
// error.tsx boundary: without it the not-found error was rethrown through that error boundary
// inside the streamed loading boundary and surfaced as React #441/#419 page errors.
export { default } from '../../not-found';
