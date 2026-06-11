# Content protection (videos & PDFs)

This document explains what protects course videos and lesson PDFs from being
downloaded or shared, what the realistic limits are, and how to reach the
strongest setup.

## The honest reality

You cannot make web content 100% un-downloadable. Anyone who can watch a video
can screen-record it, and anyone who can read a PDF can screenshot it — this is
true of every platform, including Netflix and Coursera. Effective protection
does two things instead:

1. **Raises the bar** so casual downloading and link-sharing stop working.
2. **Makes leaks traceable** so a leaked file points back to one student.

## What is protected now (shipped)

### Lesson PDFs
- **No more download button.** PDFs open in an in-app, view-only viewer
  (`portal/viewer.html`) instead of linking straight to the file.
- **Enrollment is enforced server-side.** The viewer fetches the file through
  `/api/student-activity` (`action: signed-pdf`), which confirms the student is
  enrolled in that PDF's course before returning anything. Migration `v14` also
  tightens the database policy so a logged-in student can only read PDFs for
  courses they're enrolled in (previously any logged-in user could read all).
- **Short-lived signed links** for files stored in Supabase Storage: the URL
  handed to the browser expires after 5 minutes, so it can't be shared.
- **Per-student watermark.** The viewer overlays the student's name, email, and
  the date across the document, so a screenshot is traceable.
- The browser PDF toolbar (download/print) is hidden where the browser supports
  it, and right-click / text-selection are disabled in the viewer.

### Lesson videos
- **Privacy-enhanced embed:** `youtube-nocookie.com` with related videos and
  branding suppressed, picture-in-picture disabled, right-click blocked.
- **Per-student watermark** (name + email) shown over the player.

## Limits you should know

- **PDFs that are external links** (Google Drive, Dropbox, etc.) cannot be given
  expiring signed URLs — only files stored in **Supabase Storage** can. External
  links are still opened view-only with the watermark, but the underlying link
  is not expiring. For full protection, host PDFs in Supabase Storage (below).
- **YouTube videos can still be downloaded** by a determined user, because the
  video ultimately plays from YouTube. The watermark and hardening deter casual
  copying but are not a true lock. Real lockdown needs a signed-URL video host.

## Recommended full lockdown

### PDFs → private Supabase Storage
1. In Supabase → Storage, create a bucket named `pdfs` and set it **Private**.
2. Upload lesson PDFs there (instead of pasting external links). Save the
   storage URL as the PDF's `file_url`.
3. That's it — the viewer already requests expiring signed URLs for Supabase
   files and enforces enrollment. Private + signed means the link can't be
   opened without an active, enrolled session and stops working after 5 minutes.

### Videos → a signed, domain-locked host
YouTube can't be locked down. To genuinely stop downloading and link-sharing,
move videos to a host that issues signed, expiring, domain-restricted embeds:

| Host               | Why                                                   | Rough cost |
| ------------------ | ----------------------------------------------------- | ---------- |
| **Bunny Stream**   | Cheapest; token-auth + domain lock; simple API        | ~$1/mo + ~$0.005/GB delivered |
| **Cloudflare Stream** | Signed URLs, per-view tokens, generous pipeline    | $5 per 1,000 min stored + delivery |
| **Vimeo Pro/Plus** | Domain-restricted privacy, no-download, polished      | ~$20/mo |

Migration `v14` already added `lessons.video_provider` and `lessons.video_id`,
so switching is a **data change, not a rewrite**: set `video_provider` to the
new host and `video_id` to the host's video id, and the player adapts. When you
pick a host, the player code in `portal/lessons.html` needs a small branch to
render that provider's signed embed — ping me and I'll wire it up.

## Summary

| Asset            | Today                                              | Strongest setup |
| ---------------- | -------------------------------------------------- | --------------- |
| PDF in Supabase  | View-only, enrollment-checked, signed (5 min), watermarked | ✅ already strong |
| PDF external link| View-only, enrollment-checked, watermarked (link not expiring) | move file into Supabase Storage |
| Video (YouTube)  | Hardened embed + watermark (still downloadable)    | move to Bunny / Cloudflare / Vimeo |
