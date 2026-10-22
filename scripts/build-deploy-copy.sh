#!/usr/bin/env bash
# Builds the folder that gets deployed, from a CLEAN copy of the commit
# (git archive), never from the working folder. Used by
# .github/workflows/site-deploy.yml for previews and production.
#
#   scripts/build-deploy-copy.sh <out-dir>
#
# 1. git archive HEAD into <out-dir>, so only committed files go out.
# 2. Remove what must never be public: reference/, docs/, README.md, .git,
#    .github and .wrangler (before the builds, so no route or script hash
#    is made for them).
# 3. Run build-shop-routes, build-og and build-headers inside that copy,
#    then remove scripts/. build-og needs playwright-core (PLAYWRIGHT_CORE)
#    and Chrome (CHROME).
set -euo pipefail

out="${1:?usage: build-deploy-copy.sh <out-dir>}"
rm -rf "$out"
mkdir -p "$out"
git archive --format=tar HEAD | tar -x -C "$out"
rm -rf "$out/reference" "$out/docs" "$out/README.md" "$out/.git" "$out/.github" "$out/.wrangler"

node "$out/scripts/build-shop-routes.mjs"
node "$out/scripts/build-og.mjs"
node "$out/scripts/build-headers.mjs"

rm -rf "$out/scripts"

for p in reference docs scripts README.md .git .github .wrangler; do
  if [ -e "$out/$p" ]; then echo "still in the deploy copy: $p" >&2; exit 1; fi
done
grep -q "Content-Security-Policy" "$out/_headers" || { echo "_headers has no CSP" >&2; exit 1; }
echo "Deploy copy ready: $(find "$out" -type f | wc -l) files in $out"
