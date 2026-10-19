# Project rules

- Keep sitewide indexing directives in the root route's SSR `head()` and do not override them in child routes, so both server-rendered pages and the existing static prerender share one consistent policy.