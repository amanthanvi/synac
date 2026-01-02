import { SignUp } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  const isClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!isClerkConfigured) {
    return (
      <div style={{ opacity: 0.85, lineHeight: 1.7 }}>
        Clerk is not configured. Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{' '}
        <code>CLERK_SECRET_KEY</code>.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <SignUp />
    </div>
  );
}
