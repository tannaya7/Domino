# Substrate verification

Generated 2026-09-19T13:21:55.851Z by `scripts/verify-substrates.ts`. Independent DNS + published-IP-range evidence for curated `substrate` tags in `server/src/vendorMap.ts` — informational only, **never automatically applied** to the curated map.

Team Cymru ASN lookup: available, included as supplementary evidence where present.

25 of 33 curated vendors were checked (the rest have no single global host to check — see `scripts/vendorHosts.ts`).

**12 agree, 1 agree (edge only), 2 conflict, 10 inconclusive.**

## Conflicts

### SendGrid (`@sendgrid/mail`) — conflict

Curated substrate: `azure` · Checked: 2026-09-19T13:21:55.851Z

- **api.sendgrid.com**
  - Addresses: 13.229.175.20, 18.182.226.253, 52.198.71.239, 13.251.154.171, 57.182.84.179, 35.76.95.223, 52.197.1.33, 54.64.205.31, 3.1.168.255
  - 13.229.175.20 is in aws's published range 13.228.0.0/15 (region: ap-southeast-1, observed, may be anycast) | ASN AS16509 (AMAZON-02 - Amazon.com, Inc., US) — layer: hosting

### Mixpanel (`mixpanel`) — conflict

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **api.mixpanel.com**
  - Addresses: 107.178.240.159, 35.190.25.25, 130.211.34.183, 35.186.241.51
  - 107.178.240.159 is in gcp's published range 107.178.240.0/20 (region: global, observed, may be anycast) | ASN AS396982 (GOOGLE-CLOUD-PLATFORM - Google LLC, US) — layer: hosting

## Agrees

### Razorpay (`razorpay`) — agrees

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **api.razorpay.com** → CNAME → prod-api.razorpay.com → prod-api-weighted.razorpay.com → cde-blue-ext-v2.razorpay.com
  - Addresses: 3.108.150.134, 3.7.172.96
  - 3.108.150.134 is in aws's published range 3.108.0.0/14 (region: ap-south-1, observed, may be anycast) | ASN AS16509 (AMAZON-02 - Amazon.com, Inc., US) — layer: hosting

### Postmark (`postmark`) — agrees

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **api.postmarkapp.com**
  - Addresses: 3.136.210.2, 3.148.70.16, 3.21.31.251
  - 3.136.210.2 is in aws's published range 3.136.0.0/13 (region: us-east-2, observed, may be anycast) | ASN AS16509 (AMAZON-02 - Amazon.com, Inc., US) — layer: hosting

### Sentry (`@sentry/react`) — agrees

Curated substrate: `gcp` · Checked: 2026-09-19T13:21:55.851Z

- **sentry.io**
  - Addresses: 34.111.148.117, 34.8.226.60
  - 34.111.148.117 is in gcp's published range 34.111.0.0/16 (region: global, observed, may be anycast) | ASN AS396982 (GOOGLE-CLOUD-PLATFORM - Google LLC, US) — layer: hosting

### Sentry (`@sentry/node`) — agrees

Curated substrate: `gcp` · Checked: 2026-09-19T13:21:55.851Z

- **sentry.io**
  - Addresses: 34.8.226.60, 34.111.148.117
  - 34.8.226.60 is in gcp's published range 34.8.0.0/16 (region: global, observed, may be anycast) | ASN AS396982 (GOOGLE-CLOUD-PLATFORM - Google LLC, US) — layer: hosting

### Datadog (`dd-trace`) — agrees

Curated substrate: `aws, gcp` · Checked: 2026-09-19T13:21:55.851Z

- **api.datadoghq.com** → CNAME → orchid.intake.datadoghq.com
  - Addresses: 3.233.158.19, 3.233.158.18, 3.233.158.20, 2600:1f18:24e6:b901:a7b4:6061:b023:91c2, 2600:1f18:24e6:b900:b016:b6d9:1d8d:9ce0, 2600:1f18:24e6:b902:a4ed:885c:cf3e:789c
  - 3.233.158.19 is in aws's published range 3.224.0.0/12 (region: us-east-1, observed, may be anycast) | ASN AS16509 (AMAZON-02 - Amazon.com, Inc., US) — layer: hosting

### PostHog (`posthog-js`) — agrees

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **app.posthog.com** → CNAME → posthog-ingress-prod-us-256455477.us-east-1.elb.amazonaws.com
  - Addresses: 3.41.202.158, 3.41.202.170, 3.41.202.160, 3.41.202.145, 3.41.202.144, 3.41.202.165, 3.41.202.171, 3.41.202.159, 2600:1f18:4c12:9a01:fae0:da9a:f190:b4d, 2600:1f18:4c12:9a01:29f3:e4a8:7aef:cada, 2600:1f18:4c12:9a02:1290:d3e4:3f98:2bbd, 2600:1f18:4c12:9a02:d3b9:e131:cec1:a6f, 2600:1f18:4c12:9a01:2008:4842:1fcb:7cdb, 2600:1f18:4c12:9a02:8cd:27aa:2dd8:f520, 2600:1f18:4c12:9a00:7db4:74fa:a1dc:3c3e, 2600:1f18:4c12:9a00:5e82:6bed:2b3c:cf57
  - CNAME chain includes "posthog-ingress-prod-us-256455477.us-east-1.elb.amazonaws.com" (matches *.amazonaws.com) | ASN AS14618 (AMAZON-AES - Amazon.com, Inc., US) — layer: hosting

### Amazon S3 (`@aws-sdk/client-s3`) — agrees

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **s3.amazonaws.com**
  - Addresses: 16.15.236.113, 52.217.65.30, 52.216.208.160, 16.15.199.89, 52.217.48.246, 16.15.212.67, 16.182.67.120, 16.15.214.181
  - 16.15.236.113 is in aws's published range 16.15.192.0/18 (region: us-east-1, observed, may be anycast) | ASN AS14618 (AMAZON-AES - Amazon.com, Inc., US) — layer: hosting

### Amazon DynamoDB (`@aws-sdk/client-dynamodb`) — agrees

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **dynamodb.us-east-1.amazonaws.com**
  - Addresses: 3.218.181.12
  - 3.218.181.12 is in aws's published range 3.208.0.0/12 (region: us-east-1, observed, may be anycast) | ASN AS14618 (AMAZON-AES - Amazon.com, Inc., US) — layer: hosting

### Amazon Bedrock (`@aws-sdk/client-bedrock-runtime`) — agrees

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **bedrock-runtime.us-east-1.amazonaws.com**
  - Addresses: 13.217.253.194, 98.85.75.230, 98.88.52.13, 54.209.177.10, 34.203.16.47, 44.218.245.151, 34.224.172.88, 98.89.53.194
  - 13.217.253.194 is in aws's published range 13.216.0.0/13 (region: us-east-1, observed, may be anycast) | ASN AS14618 (AMAZON-AES - Amazon.com, Inc., US) — layer: hosting

### Cloudinary (`cloudinary`) — agrees

Curated substrate: `aws, gcp` · Checked: 2026-09-19T13:21:55.851Z

- **api.cloudinary.com**
  - Addresses: 34.193.31.77, 100.57.18.238, 54.204.2.116, 54.146.87.59, 100.26.65.200, 44.194.225.187
  - 34.193.31.77 is in aws's published range 34.192.0.0/12 (region: us-east-1, observed, may be anycast) | ASN AS14618 (AMAZON-AES - Amazon.com, Inc., US) — layer: hosting

### Slack (`@slack/web-api`) — agrees

Curated substrate: `aws, gcp` · Checked: 2026-09-19T13:21:55.851Z

- **slack.com**
  - Addresses: 65.2.117.88, 13.126.138.201, 13.127.99.68
  - 65.2.117.88 is in aws's published range 65.0.0.0/14 (region: ap-south-1, observed, may be anycast) | ASN AS16509 (AMAZON-02 - Amazon.com, Inc., US) — layer: hosting

### Amplitude (`@amplitude/analytics-browser`) — agrees

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **api2.amplitude.com**
  - Addresses: 35.161.38.218, 52.27.41.235, 54.69.23.213, 35.167.242.156, 32.188.184.154, 32.184.179.165, 44.240.172.75, 44.253.171.205
  - 35.161.38.218 is in aws's published range 35.160.0.0/13 (region: us-west-2, observed, may be anycast) | ASN AS16509 (AMAZON-02 - Amazon.com, Inc., US) — layer: hosting

## Agrees (edge only — origin not observable, corroborates but does not confirm)

### Twilio (`twilio`) — agrees-edge

Curated substrate: `aws, gcp` · Checked: 2026-09-19T13:21:55.851Z

- **api.twilio.com** → CNAME → api-intermediate.edge.prod.twilio.com → dt5wf3kt7zzil.cloudfront.net
  - Addresses: 108.159.0.89
  - CNAME chain includes "dt5wf3kt7zzil.cloudfront.net" (matches *.cloudfront.net) | ASN AS16509 (AMAZON-02 - Amazon.com, Inc., US) — layer: edge

## Inconclusive

### Stripe (`stripe`) — inconclusive

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **api.stripe.com**
  - Addresses: 198.137.150.21, 198.202.176.21
  - No CNAME suffix or IP-range match against any known provider | ASN AS16509 (AMAZON-02 - Amazon.com, Inc., US)

### Braintree (`braintree`) — inconclusive

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **api.braintreegateway.com** → CNAME → gateway-api.production.braintree-api.com → cdn-a.production.braintree-api.com
  - Addresses: 159.242.242.193, 159.242.242.192
  - No CNAME suffix or IP-range match against any known provider | ASN AS13335 (CLOUDFLARENET - Cloudflare, Inc., US)

### Firebase (`firebase`) — inconclusive

Curated substrate: `gcp` · Checked: 2026-09-19T13:21:55.851Z

- **firestore.googleapis.com**
  - Addresses: 142.251.43.202, 2404:6800:4007:821::200a
  - No CNAME suffix or IP-range match against any known provider | ASN AS15169 (GOOGLE - Google LLC, US)

### Firebase (`firebase-admin`) — inconclusive

Curated substrate: `gcp` · Checked: 2026-09-19T13:21:55.851Z

- **firestore.googleapis.com**
  - Addresses: 142.251.43.202, 2404:6800:4007:821::200a
  - No CNAME suffix or IP-range match against any known provider | ASN AS15169 (GOOGLE - Google LLC, US)

### Resend (`resend`) — inconclusive

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **api.resend.com** → CNAME → api.resend.com.cdn.cloudflare.net
  - Addresses: 104.20.29.242, 172.66.165.132, 2606:4700:10::6814:1df2, 2606:4700:10::ac42:a584
  - 104.20.29.242 is in cloudflare's published range 104.16.0.0/13 | ASN AS13335 (CLOUDFLARENET - Cloudflare, Inc., US) — layer: edge

### New Relic (`newrelic`) — inconclusive

Curated substrate: `aws` · Checked: 2026-09-19T13:21:55.851Z

- **api.newrelic.com** → CNAME → tls12-ui.newrelic.com.cdn.cloudflare.net
  - Addresses: 162.247.242.3
  - No CNAME suffix or IP-range match against any known provider | ASN AS23467 (NEWRELIC-AS-1 - New Relic, US)

### OpenAI (`openai`) — inconclusive

Curated substrate: `azure` · Checked: 2026-09-19T13:21:55.851Z

- **api.openai.com**
  - Addresses: 162.159.140.245, 172.66.0.243, 2a06:98c1:58::f3, 2606:4700:7::f3
  - 162.159.140.245 is in cloudflare's published range 162.158.0.0/15 | ASN AS13335 (CLOUDFLARENET - Cloudflare, Inc., US) — layer: edge

### Anthropic (`@anthropic-ai/sdk`) — inconclusive

Curated substrate: `aws, gcp` · Checked: 2026-09-19T13:21:55.851Z

- **api.anthropic.com**
  - Addresses: 160.79.104.10, 2607:6bc0::10
  - No CNAME suffix or IP-range match against any known provider | ASN AS399358 (ANTHROPIC - Anthropic, PBC, US)

### Google AI (`@google/generative-ai`) — inconclusive

Curated substrate: `gcp` · Checked: 2026-09-19T13:21:55.851Z

- **generativelanguage.googleapis.com**
  - Addresses: 172.217.119.4, 172.217.116.4, 172.217.112.4, 172.217.113.4, 172.217.118.4, 172.217.114.4, 172.217.117.4, 172.217.115.4, 2001:4860:4842:400::, 2001:4860:4840:400::, 2001:4860:4844:400::, 2001:4860:4841:400::, 2001:4860:4845:400::, 2001:4860:4846:400::, 2001:4860:4843:400::, 2001:4860:4847:400::
  - No CNAME suffix or IP-range match against any known provider | ASN AS15169 (GOOGLE - Google LLC, US)

### Google Maps (`@googlemaps/js-api-loader`) — inconclusive

Curated substrate: `gcp` · Checked: 2026-09-19T13:21:55.851Z

- **maps.googleapis.com**
  - Addresses: 172.217.117.4, 172.217.113.4, 172.217.112.4, 172.217.116.4, 172.217.119.4, 172.217.115.4, 172.217.114.4, 172.217.118.4, 2001:4860:4843:400::, 2001:4860:4840:400::, 2001:4860:4844:400::, 2001:4860:4847:400::, 2001:4860:4841:400::, 2001:4860:4846:400::, 2001:4860:4845:400::, 2001:4860:4842:400::
  - No CNAME suffix or IP-range match against any known provider | ASN AS15169 (GOOGLE - Google LLC, US)
