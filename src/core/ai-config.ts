/**
 * AI-Config — profile/credential test path.
 *
 * Extracted from the retired AgentCenter (which used to host
 * `testProfile` / `testWithProfile`). These are the "send a one-shot
 * probe through a profile's declared test adapter" helpers the provider
 * wizard uses to validate a credential before saving, and the same
 * capability Workspace config-push needs when pushing a resolved profile
 * into a workspace. They are pure GenerateRouter glue — no session, no
 * compaction, no agent loop — which is exactly why they outlive
 * AgentCenter: the agent loop now runs inside the native CLIs, but
 * resolving + testing a profile is still Alice's job.
 *
 * Both delegate to `GenerateRouter.askForTest`, which picks the preset's
 * declared test adapter (lightest SDK that can drive the credential).
 */

import type { GenerateRouter, ProviderResult } from './ai-provider-manager.js'
import { resolveProfile, resolveCredential, type ResolvedProfile } from './config.js'
import { profileToCredential } from './credential-inference.js'

/**
 * Test a saved profile by slug. Uses the stored credential when the
 * profile carries `credentialSlug`, otherwise synthesizes one from the
 * profile's inline fields.
 */
export async function testProfile(
  router: GenerateRouter,
  profileSlug: string,
  prompt = 'Hi',
): Promise<ProviderResult> {
  const profile = await resolveProfile(profileSlug)
  const credential = profile.credentialSlug
    ? await resolveCredential(profile.credentialSlug)
    : profileToCredential(profile)
  return router.askForTest(prompt, profile, credential)
}

/**
 * Test an unsaved profile (inline data from the wizard / config-push).
 * Synthesizes a credential from the profile's inline fields and routes
 * through the preset's declared test adapter.
 */
export async function testWithProfile(
  router: GenerateRouter,
  profile: ResolvedProfile,
  prompt = 'Hi',
): Promise<ProviderResult> {
  const credential = profileToCredential(profile)
  return router.askForTest(prompt, profile, credential)
}
