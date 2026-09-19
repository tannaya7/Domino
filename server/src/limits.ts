/** Shared by requestHandler.ts (local Node http server) and lambdaHandler.ts (real Lambda entry
 * point) so the two transports enforce the SAME request-size ceiling — API Gateway's own default
 * (10MB) is a platform default, not something this app configures, and is 5x more permissive than
 * this app's own JSON bodies ever need to be; bounding it here also bounds JSON.parse cost and any
 * downstream prompt-construction cost (e.g. Ask Blast Radius) against an oversized payload. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2MB — generous for this API's JSON bodies
