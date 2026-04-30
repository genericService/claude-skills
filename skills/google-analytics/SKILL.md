---
name: google-analytics
version: 1.0.0
description: Sets up, configures, and optimizes Google Analytics 4 (GA4) properties. Evaluates websites for proper GA4 implementation, tracking codes, and configuration improvements. Uses the Google Analytics Admin API for programmatic setup or provides manual integration paths via gtag.js or Next.js Third Parties.
---

# Google Analytics 4 (GA4) Manager

This skill provides a standardized approach to setting up, verifying, and optimizing Google Analytics 4 properties. It covers programmatic setup via the Google Analytics Admin API, manual code integration, and optimization audits.

---

## How to use this skill

1. **Assess Current State**: Check if the website currently has Google Analytics. Use web scraping tools (like Firecrawl or native page requests) to look for `G-XXXXXXXXXX` IDs in the source code.
2. **Setup Strategy**: Determine if you need to create a new GA4 property or integrate an existing one.
3. **Programmatic Creation (Optional)**: If the user provides a Google Cloud Service Account with Analytics Admin access, use the included `ga_admin.py` script to create properties and data streams programmatically.
4. **Code Integration**: Inject the correct GA4 implementation code into the project (e.g., using `@next/third-parties/google` for Next.js, or raw `gtag.js` for plain HTML).
5. **Optimization & Auditing**: Review the site's layout and suggest custom events for key interactions (e.g., lead forms, e-commerce purchases, outbound clicks).

---

## The Three Phases

### Phase 1: Setup & Creation

If the user needs a new property, you have two choices:

- **Option A: Manual creation (Recommended for most users)**
  Guide the user to `analytics.google.com` to create a property and retrieve the `G-XXXXXX` Measurement ID.
- **Option B: Programmatic creation**
  If authenticated via Google Cloud with `analytics.manage` scopes, you can use the Analytics Admin API to provision properties and web streams on behalf of the user.

### Phase 2: Code Integration

Implement the tracking code using the most appropriate method for the user's stack.

**Next.js (App Router)**
Use the official `@next/third-parties/google` library.
```tsx
import { GoogleAnalytics } from '@next/third-parties/google'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
      <GoogleAnalytics gaId="G-XYZ" />
    </html>
  )
}
```

**Standard HTML/Vanilla JS**
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XYZ"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-XYZ');
</script>
```

### Phase 3: Optimization & Event Tracking

Standard page views are tracked automatically in GA4. However, you should evaluate the project for valuable custom events. 

- **Lead Generation**: Track form submissions.
- **E-commerce**: Track `add_to_cart`, `begin_checkout`, and `purchase`.
- **Engagement**: Track video plays, file downloads, or clicks on outbound social links.

**Sending Custom Events (Next.js Example)**
```tsx
import { sendGAEvent } from '@next/third-parties/google'

export function EventButton() {
  return (
    <button
      onClick={() => sendGAEvent('event', 'buttonClicked', { value: 'xyz' })}
    >
      Send Event
    </button>
  )
}
```

---

## Scripts & Tools

- **`scripts/ga_admin.py`**: A python script that interacts with the Google Analytics Admin API to list accounts, properties, and create web data streams. Requires `google-analytics-admin` package and GCP credentials.

---

## Anti-patterns to avoid

- **Don't hardcode GA IDs in source code if they change per environment.** Use environment variables (e.g., `NEXT_PUBLIC_GA_ID`).
- **Don't use Universal Analytics (UA-XXXXX).** Universal Analytics is deprecated. Always use GA4 (`G-XXXXX`).
- **Don't add multiple `gtag.js` script tags.** Only one core tag is needed per page.
