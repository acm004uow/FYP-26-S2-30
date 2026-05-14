# FYP-26-S2-30
Smart Task Allocation Application

## Email Confirmation Code Setup

Signup uses Supabase Auth email verification. To send a confirmation code:

1. Open Supabase Dashboard > Authentication > Providers > Email.
2. Enable email confirmations.
3. Open Authentication > Email Templates > Confirm signup.
4. Include the code token in the email body:

```txt
Your confirmation code is: {{ .Token }}
```

You can copy the full template from `supabase/confirm-signup-email-template.html`.

Users enter this code on `/signup` to verify their email before logging in.


If you use a Gmail app password for custom SMTP, configure it in Supabase Dashboard > Project Settings > Auth > SMTP. Do not put the app password in frontend code.
