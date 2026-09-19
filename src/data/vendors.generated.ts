// GENERATED FILE — do not edit by hand. Source of truth: vendors/*.json (see CONTRIBUTING.md).
// Regenerate with: npm run kb:generate (also runs automatically in npm run kb:check / CI).
//
// This is the ONLY place VENDOR_MAP / ENV_ALIASES / the vendor knowledge base are defined at
// runtime — the app never reads vendors/*.json itself at runtime, only this compiled module.

import type { VendorEntry, VendorKbEntry } from '../lib/types'

/** Keyed by the npm/pypi/go/gem/maven package name (or alias) most commonly imported/required. */
export const VENDOR_MAP: Record<string, VendorEntry> = {
  "algoliasearch": {
    "vendor": "Algolia",
    "tier": "search",
    "substrate": [
      "gcp",
      "aws"
    ],
    "sla": 0.9999,
    "statusUrl": "https://status.algolia.com/api/v2/status.json"
  },
  "@aws-sdk/client-bedrock-runtime": {
    "vendor": "Amazon Bedrock",
    "tier": "ai",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "@aws-sdk/client-dynamodb": {
    "vendor": "Amazon DynamoDB",
    "tier": "data",
    "substrate": [
      "aws"
    ],
    "sla": 0.9999
  },
  "@aws-sdk/client-s3": {
    "vendor": "Amazon S3",
    "tier": "storage",
    "substrate": [
      "aws"
    ],
    "sla": 0.9999
  },
  "@amplitude/analytics-browser": {
    "vendor": "Amplitude",
    "tier": "analytics",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "@anthropic-ai/sdk": {
    "vendor": "Anthropic",
    "tier": "ai",
    "substrate": [
      "aws",
      "gcp"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.anthropic.com/api/v2/status.json"
  },
  "@auth0/auth0-react": {
    "vendor": "Auth0",
    "tier": "auth",
    "substrate": [
      "aws"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.auth0.com/api/v2/status.json"
  },
  "braintree": {
    "vendor": "Braintree",
    "tier": "payments",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "@clerk/nextjs": {
    "vendor": "Clerk",
    "tier": "auth",
    "substrate": [
      "aws",
      "cloudflare"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.clerk.com/api/v2/status.json"
  },
  "@clerk/clerk-react": {
    "vendor": "Clerk",
    "tier": "auth",
    "substrate": [
      "aws",
      "cloudflare"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.clerk.com/api/v2/status.json"
  },
  "cloudinary": {
    "vendor": "Cloudinary",
    "tier": "storage",
    "substrate": [
      "aws",
      "gcp"
    ],
    "sla": 0.999
  },
  "dd-trace": {
    "vendor": "Datadog",
    "tier": "observability",
    "substrate": [
      "aws",
      "gcp"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.datadoghq.com/api/v2/status.json"
  },
  "firebase": {
    "vendor": "Firebase",
    "tier": "data",
    "substrate": [
      "gcp"
    ],
    "sla": 0.999
  },
  "firebase-admin": {
    "vendor": "Firebase",
    "tier": "data",
    "substrate": [
      "gcp"
    ],
    "sla": 0.999
  },
  "@google/generative-ai": {
    "vendor": "Google AI",
    "tier": "ai",
    "substrate": [
      "gcp"
    ],
    "sla": 0.999
  },
  "@googlemaps/js-api-loader": {
    "vendor": "Google Maps",
    "tier": "maps",
    "substrate": [
      "gcp"
    ],
    "sla": 0.999
  },
  "mixpanel": {
    "vendor": "Mixpanel",
    "tier": "analytics",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "mongodb": {
    "vendor": "MongoDB Atlas",
    "tier": "data",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "newrelic": {
    "vendor": "New Relic",
    "tier": "observability",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "next-auth": {
    "vendor": "NextAuth.js",
    "tier": "auth",
    "substrate": [
      "self"
    ],
    "sla": 0.999
  },
  "openai": {
    "vendor": "OpenAI",
    "tier": "ai",
    "substrate": [
      "azure"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.openai.com/api/v2/status.json"
  },
  "@planetscale/database": {
    "vendor": "PlanetScale",
    "tier": "data",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "posthog-js": {
    "vendor": "PostHog",
    "tier": "analytics",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "postmark": {
    "vendor": "Postmark",
    "tier": "email",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "razorpay": {
    "vendor": "Razorpay",
    "tier": "payments",
    "substrate": [
      "aws"
    ],
    "sla": 0.999,
    "fallbacks": [
      "Stripe"
    ]
  },
  "resend": {
    "vendor": "Resend",
    "tier": "email",
    "substrate": [
      "aws"
    ],
    "sla": 0.999
  },
  "@sendgrid/mail": {
    "vendor": "SendGrid",
    "tier": "email",
    "substrate": [
      "azure"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.sendgrid.com/api/v2/status.json"
  },
  "@sentry/react": {
    "vendor": "Sentry",
    "tier": "observability",
    "substrate": [
      "gcp"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.sentry.io/api/v2/status.json"
  },
  "@sentry/node": {
    "vendor": "Sentry",
    "tier": "observability",
    "substrate": [
      "gcp"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.sentry.io/api/v2/status.json"
  },
  "@slack/web-api": {
    "vendor": "Slack",
    "tier": "messaging",
    "substrate": [
      "aws",
      "gcp"
    ],
    "sla": 0.999,
    "statusUrl": "https://slack-status.com/api/v2.0.0/current"
  },
  "stripe": {
    "vendor": "Stripe",
    "tier": "payments",
    "substrate": [
      "aws"
    ],
    "sla": 0.9999,
    "statusUrl": "https://status.stripe.com/api/v2/status.json",
    "fallbacks": [
      "Razorpay"
    ]
  },
  "@supabase/supabase-js": {
    "vendor": "Supabase",
    "tier": "data",
    "substrate": [
      "aws"
    ],
    "sla": 0.999,
    "statusUrl": "https://status.supabase.com/api/v2/status.json"
  },
  "twilio": {
    "vendor": "Twilio",
    "tier": "messaging",
    "substrate": [
      "aws",
      "gcp"
    ],
    "sla": 0.9995,
    "statusUrl": "https://status.twilio.com/api/v2/status.json"
  }
}

/** Maps env-var names to the VENDOR_MAP key they imply. */
export const ENV_ALIASES: Record<string, string> = {
  "ALGOLIA_API_KEY": "algoliasearch",
  "ALGOLIA_APP_ID": "algoliasearch",
  "AMPLITUDE_API_KEY": "@amplitude/analytics-browser",
  "ANTHROPIC_API_KEY": "@anthropic-ai/sdk",
  "AUTH0_CLIENT_ID": "@auth0/auth0-react",
  "AUTH0_DOMAIN": "@auth0/auth0-react",
  "BRAINTREE_MERCHANT_ID": "braintree",
  "CLERK_PUBLISHABLE_KEY": "@clerk/nextjs",
  "CLERK_SECRET_KEY": "@clerk/nextjs",
  "CLOUDINARY_URL": "cloudinary",
  "DATADOG_API_KEY": "dd-trace",
  "FIREBASE_API_KEY": "firebase",
  "GOOGLE_GENERATIVE_AI_API_KEY": "@google/generative-ai",
  "GOOGLE_MAPS_API_KEY": "@googlemaps/js-api-loader",
  "MIXPANEL_TOKEN": "mixpanel",
  "MONGODB_URI": "mongodb",
  "NEW_RELIC_LICENSE_KEY": "newrelic",
  "NEXTAUTH_SECRET": "next-auth",
  "OPENAI_API_KEY": "openai",
  "PLANETSCALE_DATABASE_URL": "@planetscale/database",
  "POSTHOG_API_KEY": "posthog-js",
  "POSTMARK_API_TOKEN": "postmark",
  "RAZORPAY_KEY_ID": "razorpay",
  "RAZORPAY_KEY_SECRET": "razorpay",
  "RESEND_API_KEY": "resend",
  "SENDGRID_API_KEY": "@sendgrid/mail",
  "SENTRY_DSN": "@sentry/react",
  "SLACK_BOT_TOKEN": "@slack/web-api",
  "STRIPE_PUBLISHABLE_KEY": "stripe",
  "STRIPE_SECRET_KEY": "stripe",
  "SUPABASE_ANON_KEY": "@supabase/supabase-js",
  "SUPABASE_SERVICE_ROLE_KEY": "@supabase/supabase-js",
  "SUPABASE_URL": "@supabase/supabase-js",
  "TWILIO_ACCOUNT_SID": "twilio",
  "TWILIO_AUTH_TOKEN": "twilio"
}

/** Every vendor's full knowledge-base record (evidence, confidence, hosts, alternatives, ...),
 * keyed by its stable id — see vendors/<id>.json and vendors/schema.json. */
export const VENDOR_KB: Record<string, VendorKbEntry> = {
  "algolia": {
    "id": "algolia",
    "name": "Algolia",
    "category": "search",
    "aliases": [],
    "packages": {
      "npm": "algoliasearch",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "ALGOLIA_API_KEY",
      "ALGOLIA_APP_ID"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.algolia.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      },
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.9999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "amazon-bedrock": {
    "id": "amazon-bedrock",
    "name": "Amazon Bedrock",
    "category": "ai",
    "aliases": [],
    "packages": {
      "npm": "@aws-sdk/client-bedrock-runtime",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [],
    "hosts": [
      "bedrock-runtime.us-east-1.amazonaws.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "bedrock-runtime.us-east-1.amazonaws.com resolves to 13.217.253.194, published in AWS ip-ranges.json (region us-east-1); Amazon Bedrock is a first-party AWS service. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "amazon-dynamodb": {
    "id": "amazon-dynamodb",
    "name": "Amazon DynamoDB",
    "category": "data",
    "aliases": [],
    "packages": {
      "npm": "@aws-sdk/client-dynamodb",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [],
    "hosts": [
      "dynamodb.us-east-1.amazonaws.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "dynamodb.us-east-1.amazonaws.com resolves to 3.218.181.12, published in AWS ip-ranges.json (region us-east-1); Amazon DynamoDB is a first-party AWS service. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.9999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "amazon-s3": {
    "id": "amazon-s3",
    "name": "Amazon S3",
    "category": "storage",
    "aliases": [],
    "packages": {
      "npm": "@aws-sdk/client-s3",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [],
    "hosts": [
      "s3.amazonaws.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "s3.amazonaws.com resolves to 16.15.236.113, published in AWS ip-ranges.json (region us-east-1); Amazon S3 is a first-party AWS service. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.9999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "amplitude": {
    "id": "amplitude",
    "name": "Amplitude",
    "category": "analytics",
    "aliases": [],
    "packages": {
      "npm": "@amplitude/analytics-browser",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "AMPLITUDE_API_KEY"
    ],
    "hosts": [
      "api2.amplitude.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api2.amplitude.com resolves to 35.161.38.218, published in AWS ip-ranges.json (region us-west-2). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "anthropic": {
    "id": "anthropic",
    "name": "Anthropic",
    "category": "ai",
    "aliases": [],
    "packages": {
      "npm": "@anthropic-ai/sdk",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "ANTHROPIC_API_KEY"
    ],
    "hosts": [
      "api.anthropic.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.anthropic.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "auth0": {
    "id": "auth0",
    "name": "Auth0",
    "category": "auth",
    "aliases": [],
    "packages": {
      "npm": "@auth0/auth0-react",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "AUTH0_CLIENT_ID",
      "AUTH0_DOMAIN"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.auth0.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "braintree": {
    "id": "braintree",
    "name": "Braintree",
    "category": "payments",
    "aliases": [],
    "packages": {
      "npm": "braintree",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "BRAINTREE_MERCHANT_ID"
    ],
    "hosts": [
      "api.braintreegateway.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "clerk": {
    "id": "clerk",
    "name": "Clerk",
    "category": "auth",
    "aliases": [
      "@clerk/clerk-react"
    ],
    "packages": {
      "npm": "@clerk/nextjs",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.clerk.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      },
      {
        "value": "cloudflare",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "cloudinary": {
    "id": "cloudinary",
    "name": "Cloudinary",
    "category": "storage",
    "aliases": [],
    "packages": {
      "npm": "cloudinary",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "CLOUDINARY_URL"
    ],
    "hosts": [
      "api.cloudinary.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.cloudinary.com resolves to 34.193.31.77, published in AWS ip-ranges.json (region us-east-1). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "datadog": {
    "id": "datadog",
    "name": "Datadog",
    "category": "observability",
    "aliases": [],
    "packages": {
      "npm": "dd-trace",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "DATADOG_API_KEY"
    ],
    "hosts": [
      "api.datadoghq.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.datadoghq.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.datadoghq.com resolves to 3.233.158.19, published in AWS ip-ranges.json (region us-east-1). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "firebase": {
    "id": "firebase",
    "name": "Firebase",
    "category": "data",
    "aliases": [
      "firebase-admin"
    ],
    "packages": {
      "npm": "firebase",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "FIREBASE_API_KEY"
    ],
    "hosts": [
      "firestore.googleapis.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "google-ai": {
    "id": "google-ai",
    "name": "Google AI",
    "category": "ai",
    "aliases": [],
    "packages": {
      "npm": "@google/generative-ai",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "GOOGLE_GENERATIVE_AI_API_KEY"
    ],
    "hosts": [
      "generativelanguage.googleapis.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "google-maps": {
    "id": "google-maps",
    "name": "Google Maps",
    "category": "maps",
    "aliases": [],
    "packages": {
      "npm": "@googlemaps/js-api-loader",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "GOOGLE_MAPS_API_KEY"
    ],
    "hosts": [
      "maps.googleapis.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "mixpanel": {
    "id": "mixpanel",
    "name": "Mixpanel",
    "category": "analytics",
    "aliases": [],
    "packages": {
      "npm": "mixpanel",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "MIXPANEL_TOKEN"
    ],
    "hosts": [
      "api.mixpanel.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "reported",
        "evidence": [
          {
            "url": "https://www.gstatic.com/ipranges/cloud.json",
            "note": "CONFLICT — curated substrate is aws, but api.mixpanel.com resolves to 107.178.240.159, published in Google Cloud's cloud.json (region global). Left at \"aws\" (behavior-preserving) pending human review; see docs/kb-todo.md.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "mongodb-atlas": {
    "id": "mongodb-atlas",
    "name": "MongoDB Atlas",
    "category": "data",
    "aliases": [],
    "packages": {
      "npm": "mongodb",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "MONGODB_URI"
    ],
    "hosts": [],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "new-relic": {
    "id": "new-relic",
    "name": "New Relic",
    "category": "observability",
    "aliases": [],
    "packages": {
      "npm": "newrelic",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "NEW_RELIC_LICENSE_KEY"
    ],
    "hosts": [
      "api.newrelic.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "next-auth": {
    "id": "next-auth",
    "name": "NextAuth.js",
    "category": "auth",
    "aliases": [],
    "packages": {
      "npm": "next-auth",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "NEXTAUTH_SECRET"
    ],
    "hosts": [],
    "statusFeed": null,
    "substrate": [
      {
        "value": "self",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "openai": {
    "id": "openai",
    "name": "OpenAI",
    "category": "ai",
    "aliases": [],
    "packages": {
      "npm": "openai",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "OPENAI_API_KEY"
    ],
    "hosts": [
      "api.openai.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.openai.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "azure",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "planetscale": {
    "id": "planetscale",
    "name": "PlanetScale",
    "category": "data",
    "aliases": [],
    "packages": {
      "npm": "@planetscale/database",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "PLANETSCALE_DATABASE_URL"
    ],
    "hosts": [],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "posthog": {
    "id": "posthog",
    "name": "PostHog",
    "category": "analytics",
    "aliases": [],
    "packages": {
      "npm": "posthog-js",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "POSTHOG_API_KEY"
    ],
    "hosts": [
      "app.posthog.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "app.posthog.com CNAMEs to posthog-ingress-prod-us-256455477.us-east-1.elb.amazonaws.com, a direct AWS ELB hostname. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "postmark": {
    "id": "postmark",
    "name": "Postmark",
    "category": "email",
    "aliases": [],
    "packages": {
      "npm": "postmark",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "POSTMARK_API_TOKEN"
    ],
    "hosts": [
      "api.postmarkapp.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.postmarkapp.com resolves to 3.136.210.2, published in AWS ip-ranges.json (region us-east-2). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "razorpay": {
    "id": "razorpay",
    "name": "Razorpay",
    "category": "payments",
    "aliases": [],
    "packages": {
      "npm": "razorpay",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET"
    ],
    "hosts": [
      "api.razorpay.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.razorpay.com resolves to 3.108.150.134, published in AWS ip-ranges.json (region ap-south-1). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": [
      "stripe"
    ]
  },
  "resend": {
    "id": "resend",
    "name": "Resend",
    "category": "email",
    "aliases": [],
    "packages": {
      "npm": "resend",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "RESEND_API_KEY"
    ],
    "hosts": [
      "api.resend.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "sendgrid": {
    "id": "sendgrid",
    "name": "SendGrid",
    "category": "email",
    "aliases": [],
    "packages": {
      "npm": "@sendgrid/mail",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SENDGRID_API_KEY"
    ],
    "hosts": [
      "api.sendgrid.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.sendgrid.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "azure",
        "confidence": "reported",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "CONFLICT — curated substrate is azure, but api.sendgrid.com resolves to 13.229.175.20, published in AWS ip-ranges.json (region ap-southeast-1). Left at \"azure\" (behavior-preserving) pending human review; see docs/kb-todo.md.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "sentry": {
    "id": "sentry",
    "name": "Sentry",
    "category": "observability",
    "aliases": [
      "@sentry/node"
    ],
    "packages": {
      "npm": "@sentry/react",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SENTRY_DSN"
    ],
    "hosts": [
      "sentry.io"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.sentry.io/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "gcp",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://www.gstatic.com/ipranges/cloud.json",
            "note": "sentry.io resolves to 34.111.148.117/34.8.226.60, both published in Google Cloud's cloud.json. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "slack": {
    "id": "slack",
    "name": "Slack",
    "category": "messaging",
    "aliases": [],
    "packages": {
      "npm": "@slack/web-api",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SLACK_BOT_TOKEN"
    ],
    "hosts": [
      "slack.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://slack-status.com/api/v2.0.0/current"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "slack.com resolves to 65.2.117.88, published in AWS ip-ranges.json (region ap-south-1). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "stripe": {
    "id": "stripe",
    "name": "Stripe",
    "category": "payments",
    "aliases": [],
    "packages": {
      "npm": "stripe",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_SECRET_KEY"
    ],
    "hosts": [
      "api.stripe.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.stripe.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.9999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": [
      "razorpay"
    ]
  },
  "supabase": {
    "id": "supabase",
    "name": "Supabase",
    "category": "data",
    "aliases": [],
    "packages": {
      "npm": "@supabase/supabase-js",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.supabase.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "twilio": {
    "id": "twilio",
    "name": "Twilio",
    "category": "messaging",
    "aliases": [],
    "packages": {
      "npm": "twilio",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN"
    ],
    "hosts": [
      "api.twilio.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.twilio.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "reported",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.twilio.com CNAMEs to dt5wf3kt7zzil.cloudfront.net (AWS CloudFront) — an edge/CDN observation, corroborates but does not confirm the origin cloud. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.9995,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  }
}

/** Same knowledge-base records, keyed by every VENDOR_MAP detection key instead of by id — so UI
 * code that already has a detected Vendor.key can look up its KB record directly. */
export const VENDOR_KB_BY_DETECTION_KEY: Record<string, VendorKbEntry> = {
  "algoliasearch": {
    "id": "algolia",
    "name": "Algolia",
    "category": "search",
    "aliases": [],
    "packages": {
      "npm": "algoliasearch",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "ALGOLIA_API_KEY",
      "ALGOLIA_APP_ID"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.algolia.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      },
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.9999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@aws-sdk/client-bedrock-runtime": {
    "id": "amazon-bedrock",
    "name": "Amazon Bedrock",
    "category": "ai",
    "aliases": [],
    "packages": {
      "npm": "@aws-sdk/client-bedrock-runtime",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [],
    "hosts": [
      "bedrock-runtime.us-east-1.amazonaws.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "bedrock-runtime.us-east-1.amazonaws.com resolves to 13.217.253.194, published in AWS ip-ranges.json (region us-east-1); Amazon Bedrock is a first-party AWS service. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@aws-sdk/client-dynamodb": {
    "id": "amazon-dynamodb",
    "name": "Amazon DynamoDB",
    "category": "data",
    "aliases": [],
    "packages": {
      "npm": "@aws-sdk/client-dynamodb",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [],
    "hosts": [
      "dynamodb.us-east-1.amazonaws.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "dynamodb.us-east-1.amazonaws.com resolves to 3.218.181.12, published in AWS ip-ranges.json (region us-east-1); Amazon DynamoDB is a first-party AWS service. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.9999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@aws-sdk/client-s3": {
    "id": "amazon-s3",
    "name": "Amazon S3",
    "category": "storage",
    "aliases": [],
    "packages": {
      "npm": "@aws-sdk/client-s3",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [],
    "hosts": [
      "s3.amazonaws.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "s3.amazonaws.com resolves to 16.15.236.113, published in AWS ip-ranges.json (region us-east-1); Amazon S3 is a first-party AWS service. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.9999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@amplitude/analytics-browser": {
    "id": "amplitude",
    "name": "Amplitude",
    "category": "analytics",
    "aliases": [],
    "packages": {
      "npm": "@amplitude/analytics-browser",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "AMPLITUDE_API_KEY"
    ],
    "hosts": [
      "api2.amplitude.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api2.amplitude.com resolves to 35.161.38.218, published in AWS ip-ranges.json (region us-west-2). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@anthropic-ai/sdk": {
    "id": "anthropic",
    "name": "Anthropic",
    "category": "ai",
    "aliases": [],
    "packages": {
      "npm": "@anthropic-ai/sdk",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "ANTHROPIC_API_KEY"
    ],
    "hosts": [
      "api.anthropic.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.anthropic.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@auth0/auth0-react": {
    "id": "auth0",
    "name": "Auth0",
    "category": "auth",
    "aliases": [],
    "packages": {
      "npm": "@auth0/auth0-react",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "AUTH0_CLIENT_ID",
      "AUTH0_DOMAIN"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.auth0.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "braintree": {
    "id": "braintree",
    "name": "Braintree",
    "category": "payments",
    "aliases": [],
    "packages": {
      "npm": "braintree",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "BRAINTREE_MERCHANT_ID"
    ],
    "hosts": [
      "api.braintreegateway.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@clerk/nextjs": {
    "id": "clerk",
    "name": "Clerk",
    "category": "auth",
    "aliases": [
      "@clerk/clerk-react"
    ],
    "packages": {
      "npm": "@clerk/nextjs",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.clerk.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      },
      {
        "value": "cloudflare",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@clerk/clerk-react": {
    "id": "clerk",
    "name": "Clerk",
    "category": "auth",
    "aliases": [
      "@clerk/clerk-react"
    ],
    "packages": {
      "npm": "@clerk/nextjs",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.clerk.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      },
      {
        "value": "cloudflare",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "cloudinary": {
    "id": "cloudinary",
    "name": "Cloudinary",
    "category": "storage",
    "aliases": [],
    "packages": {
      "npm": "cloudinary",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "CLOUDINARY_URL"
    ],
    "hosts": [
      "api.cloudinary.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.cloudinary.com resolves to 34.193.31.77, published in AWS ip-ranges.json (region us-east-1). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "dd-trace": {
    "id": "datadog",
    "name": "Datadog",
    "category": "observability",
    "aliases": [],
    "packages": {
      "npm": "dd-trace",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "DATADOG_API_KEY"
    ],
    "hosts": [
      "api.datadoghq.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.datadoghq.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.datadoghq.com resolves to 3.233.158.19, published in AWS ip-ranges.json (region us-east-1). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "firebase": {
    "id": "firebase",
    "name": "Firebase",
    "category": "data",
    "aliases": [
      "firebase-admin"
    ],
    "packages": {
      "npm": "firebase",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "FIREBASE_API_KEY"
    ],
    "hosts": [
      "firestore.googleapis.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "firebase-admin": {
    "id": "firebase",
    "name": "Firebase",
    "category": "data",
    "aliases": [
      "firebase-admin"
    ],
    "packages": {
      "npm": "firebase",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "FIREBASE_API_KEY"
    ],
    "hosts": [
      "firestore.googleapis.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@google/generative-ai": {
    "id": "google-ai",
    "name": "Google AI",
    "category": "ai",
    "aliases": [],
    "packages": {
      "npm": "@google/generative-ai",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "GOOGLE_GENERATIVE_AI_API_KEY"
    ],
    "hosts": [
      "generativelanguage.googleapis.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@googlemaps/js-api-loader": {
    "id": "google-maps",
    "name": "Google Maps",
    "category": "maps",
    "aliases": [],
    "packages": {
      "npm": "@googlemaps/js-api-loader",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "GOOGLE_MAPS_API_KEY"
    ],
    "hosts": [
      "maps.googleapis.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "mixpanel": {
    "id": "mixpanel",
    "name": "Mixpanel",
    "category": "analytics",
    "aliases": [],
    "packages": {
      "npm": "mixpanel",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "MIXPANEL_TOKEN"
    ],
    "hosts": [
      "api.mixpanel.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "reported",
        "evidence": [
          {
            "url": "https://www.gstatic.com/ipranges/cloud.json",
            "note": "CONFLICT — curated substrate is aws, but api.mixpanel.com resolves to 107.178.240.159, published in Google Cloud's cloud.json (region global). Left at \"aws\" (behavior-preserving) pending human review; see docs/kb-todo.md.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "mongodb": {
    "id": "mongodb-atlas",
    "name": "MongoDB Atlas",
    "category": "data",
    "aliases": [],
    "packages": {
      "npm": "mongodb",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "MONGODB_URI"
    ],
    "hosts": [],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "newrelic": {
    "id": "new-relic",
    "name": "New Relic",
    "category": "observability",
    "aliases": [],
    "packages": {
      "npm": "newrelic",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "NEW_RELIC_LICENSE_KEY"
    ],
    "hosts": [
      "api.newrelic.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "next-auth": {
    "id": "next-auth",
    "name": "NextAuth.js",
    "category": "auth",
    "aliases": [],
    "packages": {
      "npm": "next-auth",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "NEXTAUTH_SECRET"
    ],
    "hosts": [],
    "statusFeed": null,
    "substrate": [
      {
        "value": "self",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "openai": {
    "id": "openai",
    "name": "OpenAI",
    "category": "ai",
    "aliases": [],
    "packages": {
      "npm": "openai",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "OPENAI_API_KEY"
    ],
    "hosts": [
      "api.openai.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.openai.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "azure",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@planetscale/database": {
    "id": "planetscale",
    "name": "PlanetScale",
    "category": "data",
    "aliases": [],
    "packages": {
      "npm": "@planetscale/database",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "PLANETSCALE_DATABASE_URL"
    ],
    "hosts": [],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "posthog-js": {
    "id": "posthog",
    "name": "PostHog",
    "category": "analytics",
    "aliases": [],
    "packages": {
      "npm": "posthog-js",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "POSTHOG_API_KEY"
    ],
    "hosts": [
      "app.posthog.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "app.posthog.com CNAMEs to posthog-ingress-prod-us-256455477.us-east-1.elb.amazonaws.com, a direct AWS ELB hostname. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "postmark": {
    "id": "postmark",
    "name": "Postmark",
    "category": "email",
    "aliases": [],
    "packages": {
      "npm": "postmark",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "POSTMARK_API_TOKEN"
    ],
    "hosts": [
      "api.postmarkapp.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.postmarkapp.com resolves to 3.136.210.2, published in AWS ip-ranges.json (region us-east-2). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "razorpay": {
    "id": "razorpay",
    "name": "Razorpay",
    "category": "payments",
    "aliases": [],
    "packages": {
      "npm": "razorpay",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET"
    ],
    "hosts": [
      "api.razorpay.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.razorpay.com resolves to 3.108.150.134, published in AWS ip-ranges.json (region ap-south-1). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": [
      "stripe"
    ]
  },
  "resend": {
    "id": "resend",
    "name": "Resend",
    "category": "email",
    "aliases": [],
    "packages": {
      "npm": "resend",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "RESEND_API_KEY"
    ],
    "hosts": [
      "api.resend.com"
    ],
    "statusFeed": null,
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@sendgrid/mail": {
    "id": "sendgrid",
    "name": "SendGrid",
    "category": "email",
    "aliases": [],
    "packages": {
      "npm": "@sendgrid/mail",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SENDGRID_API_KEY"
    ],
    "hosts": [
      "api.sendgrid.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.sendgrid.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "azure",
        "confidence": "reported",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "CONFLICT — curated substrate is azure, but api.sendgrid.com resolves to 13.229.175.20, published in AWS ip-ranges.json (region ap-southeast-1). Left at \"azure\" (behavior-preserving) pending human review; see docs/kb-todo.md.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@sentry/react": {
    "id": "sentry",
    "name": "Sentry",
    "category": "observability",
    "aliases": [
      "@sentry/node"
    ],
    "packages": {
      "npm": "@sentry/react",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SENTRY_DSN"
    ],
    "hosts": [
      "sentry.io"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.sentry.io/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "gcp",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://www.gstatic.com/ipranges/cloud.json",
            "note": "sentry.io resolves to 34.111.148.117/34.8.226.60, both published in Google Cloud's cloud.json. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@sentry/node": {
    "id": "sentry",
    "name": "Sentry",
    "category": "observability",
    "aliases": [
      "@sentry/node"
    ],
    "packages": {
      "npm": "@sentry/react",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SENTRY_DSN"
    ],
    "hosts": [
      "sentry.io"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.sentry.io/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "gcp",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://www.gstatic.com/ipranges/cloud.json",
            "note": "sentry.io resolves to 34.111.148.117/34.8.226.60, both published in Google Cloud's cloud.json. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "@slack/web-api": {
    "id": "slack",
    "name": "Slack",
    "category": "messaging",
    "aliases": [],
    "packages": {
      "npm": "@slack/web-api",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SLACK_BOT_TOKEN"
    ],
    "hosts": [
      "slack.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://slack-status.com/api/v2.0.0/current"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "verified",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "slack.com resolves to 65.2.117.88, published in AWS ip-ranges.json (region ap-south-1). Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "stripe": {
    "id": "stripe",
    "name": "Stripe",
    "category": "payments",
    "aliases": [],
    "packages": {
      "npm": "stripe",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_SECRET_KEY"
    ],
    "hosts": [
      "api.stripe.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.stripe.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.9999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": [
      "razorpay"
    ]
  },
  "@supabase/supabase-js": {
    "id": "supabase",
    "name": "Supabase",
    "category": "data",
    "aliases": [],
    "packages": {
      "npm": "@supabase/supabase-js",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL"
    ],
    "hosts": [],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.supabase.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.999,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  },
  "twilio": {
    "id": "twilio",
    "name": "Twilio",
    "category": "messaging",
    "aliases": [],
    "packages": {
      "npm": "twilio",
      "pypi": null,
      "go": null,
      "gem": null,
      "maven": null
    },
    "envPrefixes": [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN"
    ],
    "hosts": [
      "api.twilio.com"
    ],
    "statusFeed": {
      "kind": "statuspage",
      "url": "https://status.twilio.com/api/v2/status.json"
    },
    "substrate": [
      {
        "value": "aws",
        "confidence": "reported",
        "evidence": [
          {
            "url": "https://ip-ranges.amazonaws.com/ip-ranges.json",
            "note": "api.twilio.com CNAMEs to dt5wf3kt7zzil.cloudfront.net (AWS CloudFront) — an edge/CDN observation, corroborates but does not confirm the origin cloud. Checked via scripts/verify-substrates.ts.",
            "retrievedAt": "2026-09-19"
          }
        ]
      },
      {
        "value": "gcp",
        "confidence": "unknown",
        "evidence": []
      }
    ],
    "sla": {
      "value": 0.9995,
      "sourceUrl": null,
      "retrievedAt": null
    },
    "alternatives": []
  }
}

/** A short content hash of vendors/*.json — changes only when the data actually changes. */
export const KB_VERSION = "91bac97484"
/** The most recent evidence/SLA retrievedAt date across all vendors, or null if none has one yet. */
export const KB_LAST_UPDATED = "2026-09-19"
