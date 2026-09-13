import { SignUp } from '@clerk/nextjs'
import { AuthShell } from '@/components/auth-shell'

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp />
      <p className="mt-4 text-center text-[12px] text-muted-foreground">
        New accounts must use an @zenithmedialabs.com email.
      </p>
    </AuthShell>
  )
}
