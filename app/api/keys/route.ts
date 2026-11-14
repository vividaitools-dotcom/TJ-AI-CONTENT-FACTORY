import { fail, ok, readBody, withUser } from '@/lib/api';
import { logActivity, run, uid } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import {
  PROVIDERS,
  listProviderKeys,
  providerInfo,
  type ProviderId,
} from '@/lib/providers';

export async function GET() {
  return withUser(async (user) => {
    const saved = await listProviderKeys(user.id);
    return ok({ providers: PROVIDERS, saved });
  })();
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{
      provider?: string;
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
    }>(request);
    const provider = (body.provider || '') as ProviderId;
    const info = providerInfo(provider);
    if (!info) return fail('Unknown provider.');
    const apiKey = (body.apiKey || '').trim();
    if (apiKey.length < 6) return fail('That API key looks too short. Paste the full key from the provider.');
    const baseUrl = (body.baseUrl || info.baseUrl || '').trim();
    if (info.requiresBaseUrl && !/^https?:\/\//i.test(baseUrl)) {
      return fail('Enter the base URL of the compatible endpoint, e.g. http://localhost:11434/v1');
    }
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) return fail('Base URL must start with http:// or https://');
    const defaultModel = (body.defaultModel || '').trim() || info.models[0]?.id || null;
    await run(
      `INSERT INTO provider_keys (id, user_id, provider, label, secret, base_url, default_model, created_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         secret = excluded.secret,
         base_url = excluded.base_url,
         default_model = excluded.default_model`,
      [uid('key'), user.id, provider, info.name, encryptSecret(apiKey), baseUrl, defaultModel, Date.now()],
    );
    await logActivity(user.id, 'settings', 'key_saved', `${info.name} · ${defaultModel || 'default model'}`);
    const saved = await listProviderKeys(user.id);
    return ok({ saved });
  })();
}

export async function DELETE(request: Request) {
  return withUser(async (user) => {
    const provider = new URL(request.url).searchParams.get('provider') || '';
    if (!provider) return fail('provider is required.');
    await run('DELETE FROM provider_keys WHERE user_id = ? AND provider = ?', [user.id, provider]);
    await logActivity(user.id, 'settings', 'key_removed', provider);
    const saved = await listProviderKeys(user.id);
    return ok({ saved });
  })();
}
