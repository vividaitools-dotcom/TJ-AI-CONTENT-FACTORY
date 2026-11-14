'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/studio', label: 'Studio' },
  { href: '/studio/trends', label: 'Trends' },
  { href: '/studio/ideas', label: 'Ideas' },
  { href: '/studio/scripts', label: 'Scripts' },
  { href: '/studio/visuals', label: 'Visuals' },
  { href: '/studio/video', label: 'Video' },
  { href: '/studio/audio', label: 'Audio' },
  { href: '/studio/publish', label: 'Publish' },
  { href: '/studio/library', label: 'Library' },
  { href: '/studio/settings', label: 'Settings' },
];

export default function StudioNav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <header className="safe-top sticky top-0 z-30 border-b border-white/8 bg-[#05060c]/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
        <Link href="/studio" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-400 text-[0.72rem] font-black text-white shadow-lg shadow-violet-900/40">
            TJ
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.86rem] font-bold leading-tight tracking-tight text-slate-100">
              TJ AI CONTENT FACTORY
            </span>
            <span className="block truncate text-[0.56rem] font-bold uppercase tracking-[0.22em] text-slate-500">
              Discover · Create · Produce · Publish
            </span>
          </span>
        </Link>
        <button type="button" onClick={signOut} className="btn btn-sm btn-ghost shrink-0 !px-2.5" title={email}>
          <span className="hidden text-[0.7rem] text-slate-400 sm:inline">{email.split('@')[0]}</span>
          <span className="text-[0.7rem]">Sign out</span>
        </button>
      </div>

      <nav className="mx-auto mt-2 w-full max-w-6xl px-4 pb-2 sm:px-6">
        <div className="scroll-x">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[0.74rem] font-semibold transition ${
                  active
                    ? 'border-violet-400/60 bg-violet-500/20 text-violet-100'
                    : 'border-white/10 bg-white/[0.03] text-slate-400'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
