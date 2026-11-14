import { fail, ok, withUser } from '@/lib/api';
import { connectionSummary, disconnectYouTube, oauthConfigured } from '@/lib/youtube';

export async function GET() {
  return withUser(async (user) => {
    const [connection, configured] = [await connectionSummary(user.id), oauthConfigured()];
    return ok({ connection, configured });
  })();
}

export async function DELETE() {
  return withUser(async (user) => {
    await disconnectYouTube(user.id);
    return ok({ disconnected: true });
  })();
}
