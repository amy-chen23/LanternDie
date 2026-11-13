# Report storage setup

Apply `migrations/20261025000000_field_points.sql` after the existing migrations
to enable Profile field points. It sums upvotes minus downvotes for all reports
owned by the signed-in member, including private reports. Negative totals are
allowed; accounts without reports receive zero. The total refreshes when Profile
opens. Test with two accounts: vote on the author's public report, reopen the
author's Profile, remove or switch the vote, and check the new total. Making
the report private must preserve its contribution. Signed-out callers cannot
execute the function.

Apply `migrations/20260928000000_private_reports.sql` to the free Supabase
project before testing report submission. It creates a private photo bucket
limited to 5 MB JPEG files and a `reports` table. Both are restricted to the
signed-in owner. Use the Supabase SQL Editor or link a Supabase CLI project and
run `supabase db push`.

Apply `migrations/20261016142713_profile_photos.sql` before testing profile
pictures. It creates a separate private bucket for JPEG avatars, limited to
2 MB per image. Each signed-in account can read and replace only its own photo.

Apply `migrations/20261018201510_report_details_community.sql` and then
`migrations/20261018201548_combine_report_read_policy.sql` after the private
reports migration. They add observation date, optional location and
caption, public/private sharing, member votes, and inaccuracy flags. Existing
reports remain private. Public report images remain in the private bucket and
are downloaded with the member's session so a visibility change affects new
requests immediately. The app needs this migration before using the new upload
form or community feed.

To check access controls, create two test accounts, upload and insert a report
as the first account, then verify that the second account cannot select the
report or read its photo. Verify that a signed-out client cannot read either.
For profile pictures, verify that a second account cannot list, read, or
replace the first account's avatar.

Then make a report public and verify the second account can see its details
and download its image, vote once, switch or remove the vote, and flag once.
Verify self-votes and self-flags are denied, and that switching the report back
to private blocks the second account from new detail and image requests.
