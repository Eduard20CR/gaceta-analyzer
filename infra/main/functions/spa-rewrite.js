// CloudFront Function "spa-rewrite" (ADR-0008, docs/architecture.md →
// "CloudFront configuration"). Runtime: cloudfront-js-2.0.
//
// The web app is a single page app: /jobs/3f6c… is not a file in the bucket,
// React Router draws it from index.html. CloudFront runs this function before
// looking in the bucket, and sends every path without a file extension to
// /index.html. Files such as /assets/index-abc123.js are left alone.
//
// It only runs on the default behavior, never on /api/*, so the API's real
// 403 and 404 answers reach the browser unchanged (that is why custom error
// responses are not used).
//
// CloudFront Functions are plain scripts (no import/export): CloudFront calls
// the top-level `handler`. apps/api/tests/infra/spa-rewrite.test.ts loads this
// file and tests it.

// eslint-disable-next-line no-unused-vars -- called by CloudFront, not by this file
function handler(event) {
  const request = event.request;
  const lastSegment = request.uri.split('/').pop();

  // "app.123.js" has a dot, "abc" or "" (the path "/") do not.
  if (!lastSegment.includes('.')) {
    request.uri = '/index.html';
  }

  return request;
}
