---
description: Upload IPA or APK to Diawi for ad-hoc distribution. Use when asked to "upload to diawi", "share a build", "create a diawi link", or "distribute via diawi".
---

# Diawi Upload

Upload iOS (.ipa) or Android (.apk) builds to Diawi for over-the-air installation.

## Authentication

API token is stored in the environment variable `$DIAWI_API_KEY`.

## Upload Flow

Diawi uses an async upload process:

1. **Upload the file** — `POST https://upload.diawi.com/` with `token` and `file` fields. Returns a `job` ID.
2. **Poll for status** — `GET https://upload.diawi.com/status?token=$DIAWI_API_KEY&job=<job_id>` until `status` is `2000` (success) or an error.
3. **Get the link** — On success, the response includes a `link` field with the install URL.

## Upload Command

```bash
# Step 1: Upload
curl -s "https://upload.diawi.com/" \
  -F "token=$DIAWI_API_KEY" \
  -F "file=@/path/to/build.ipa"
# Returns: {"job":"<job_id>"}

# Step 2: Poll (repeat until status 2000)
curl -s "https://upload.diawi.com/status?token=$DIAWI_API_KEY&job=<job_id>"
# Returns: {"status":2000,"link":"https://i.diawi.com/xxxxxx"} on success

# Status codes:
# 2001 = still processing (retry after 2s)
# 2000 = success (link available)
# 4000+ = error
```

## Notes

- Uploads can take 30-60 seconds to process
- Poll every 2-3 seconds until status is no longer 2001
- The returned `link` is shareable — anyone with the URL + device UDID in the provisioning profile can install
