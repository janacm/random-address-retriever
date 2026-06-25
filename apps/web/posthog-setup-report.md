# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Random Address Retriever React/Vite frontend. PostHog is initialised in `src/main.tsx` and wrapped with `PostHogProvider` so all components can access it via the `usePostHog` hook. Five business events are captured across three source files covering the core address-retrieval flow, clipboard usage, and the two lead-generation forms.

| Event name | Description | File |
|---|---|---|
| `address_retrieved` | A random address was successfully fetched for a given city and province (includes city, province, postal code, verbose flag, query duration). | `src/App.tsx` |
| `address_retrieval_failed` | A random address fetch failed (includes city, province, error message, HTTP status). | `src/App.tsx` |
| `address_copied` | The user copied the retrieved address to their clipboard (includes city, province, postal code). | `src/App.tsx` |
| `api_access_requested` | The API access request form was submitted successfully. | `src/views.tsx` |
| `feedback_submitted` | The feedback form was submitted successfully. | `src/views.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behaviour, based on the events we just instrumented:

- [Analytics basics (wizard) dashboard](https://us.posthog.com/project/484730/dashboard/1756703)
- [Address retrievals over time](https://us.posthog.com/project/484730/insights/fHGJJduV)
- [Unique users retrieving addresses (daily)](https://us.posthog.com/project/484730/insights/Y46Bn4Ww)
- [Address retrieval success vs failure](https://us.posthog.com/project/484730/insights/IFbVDMep)
- [API access requests](https://us.posthog.com/project/484730/insights/KxLNAAst)
- [Addresses copied to clipboard](https://us.posthog.com/project/484730/insights/NB1ouNkd)

## Verify before merging

- [ ] Run a full production build (`pnpm --filter @random-address/web build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Run `pnpm install` from the repo root to install `posthog-js` and `@posthog/react` (the sandbox prevented the wizard from running the install; the deps were added to `package.json` manually).
- [ ] Add `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST` to `.env.example` and any monorepo bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or a Vite upload plugin) into CI so production stack traces de-minify in PostHog error tracking.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
