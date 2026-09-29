# Report storage setup

Apply `migrations/20260928000000_private_reports.sql` to the free Supabase
project before testing report submission. It creates a private photo bucket
limited to 5 MB JPEG files and a `reports` table. Both are restricted to the
signed-in owner. Use the Supabase SQL Editor or link a Supabase CLI project and
run `supabase db push`.

To check access controls, create two test accounts, upload and insert a report
as the first account, then verify that the second account cannot select the
report or read its photo. Verify that a signed-out client cannot read either.
