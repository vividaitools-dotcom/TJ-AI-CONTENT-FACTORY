import { redirect } from 'next/navigation';
import AuthScreen from '@/components/auth-screen';
import { getSessionUser } from '@/lib/auth';

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect('/studio');
  return <AuthScreen />;
}
