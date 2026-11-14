import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import StudioNav from '@/components/studio-nav';
import { ProjectProvider } from '@/components/project-context';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/');

  return (
    <ProjectProvider>
      <div className="min-h-[100dvh]">
        <StudioNav email={user.email} />
        <main className="safe-bottom mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </ProjectProvider>
  );
}
